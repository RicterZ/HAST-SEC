// 按 profile 把带骨架的 GLB 转换为 HAST 可用的 VRM 1.0, 或把 profile 嵌入已有 VRM.
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {createHash} from "node:crypto";
import {Object3D,Vector3,Quaternion} from "three";
import {PROFILE_EXTRA,validateModelProfile} from "../web/model_profile.mjs";

const GLB=0x46546c67,JSON_CHUNK=0x4e4f534a,BIN_CHUNK=0x004e4942;
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const isObject=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
function merge(base,override){
  if(!isObject(base)||!isObject(override))return structuredClone(override);
  const out=structuredClone(base);
  for(const [key,value] of Object.entries(override))out[key]=merge(base[key],value);
  return out;
}

// extends 为相对当前 profile 文件的路径; 对象逐层合并, 数组和标量整体覆盖.
export async function loadModelProfile(path,seen=new Set()){
  const file=resolve(path);
  if(seen.has(file))throw new Error("profile extends 形成循环: "+file);
  seen.add(file);
  const profile=JSON.parse(await readFile(file,"utf8"));
  const {extends:parent,...own}=profile;
  const merged=parent?merge(await loadModelProfile(resolve(dirname(file),parent),seen),own):own;
  return validateModelProfile(merged);
}

export function readGlb(bytes){
  if(bytes.length<28||bytes.readUInt32LE(0)!==GLB||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length||bytes.readUInt32LE(16)!==JSON_CHUNK)throw new Error("模型不是有效的 GLB 2.0.");
  const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length).toString("utf8"));
  const bin=Buffer.from(bytes.subarray(20+length));
  if(bin.length&&bin.readUInt32LE(4)!==BIN_CHUNK)throw new Error("GLB 缺少二进制数据块.");
  return {gltf,bin};
}
export function writeGlb(gltf,bin){
  let json=Buffer.from(JSON.stringify(gltf));
  json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]);
  const header=Buffer.alloc(20);
  header.writeUInt32LE(GLB,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length+bin.length,8);
  header.writeUInt32LE(json.length,12);header.writeUInt32LE(JSON_CHUNK,16);
  return Buffer.concat([header,json,bin]);
}

function embed(gltf,profile,sourceSha256){
  const {conversion,...runtimeOnly}=profile;
  gltf.asset.extras={...gltf.asset.extras,[PROFILE_EXTRA]:{...runtimeOnly,source:{sha256:sourceSha256,converted:Boolean(conversion)}}};
}

export function bindProfile(bytes,profile){
  const {gltf,bin}=readGlb(bytes);
  if(!gltf.extensions?.VRMC_vrm&&!gltf.extensions?.VRM)throw new Error("输入不是 VRM; 非 VRM 模型需要在 profile 中提供 conversion.");
  embed(gltf,profile,sha256(bytes));
  return writeGlb(gltf,bin);
}

function accessorIO(gltf,bin){
  const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},sizes={5121:1,5123:2,5125:4,5126:4};
  const readers={5121:"readUInt8",5123:"readUInt16LE",5125:"readUInt32LE",5126:"readFloatLE"};
  const at=(index,i,k)=>{
    const a=gltf.accessors[index],view=gltf.bufferViews[a.bufferView],count=components[a.type],size=sizes[a.componentType];
    if(a.sparse)throw new Error("暂不支持稀疏 accessor.");
    return 8+(view.byteOffset??0)+(a.byteOffset??0)+i*(view.byteStride??count*size)+k*size;
  };
  return {
    read(index){const a=gltf.accessors[index],count=components[a.type];return Array.from({length:a.count},(_,i)=>Array.from({length:count},(_,k)=>bin[readers[a.componentType]](at(index,i,k))));},
    scale(index,factor,keys){const a=gltf.accessors[index];if(a.componentType!==5126)throw new Error("仅支持 float 位置数据缩放.");for(let i=0;i<a.count;i++)for(const k of keys)bin.writeFloatLE(bin.readFloatLE(at(index,i,k))*factor,at(index,i,k));},
  };
}

// 游戏骨架常以 A-pose 绑定, VRM 归一化骨骼要求 T-pose; 保留 inverseBind, 让蒙皮把原网格带到新的静止姿态.
function tPoseArms(gltf,bones){
  const objects=gltf.nodes.map(node=>{
    const object=new Object3D();
    if(node.matrix)throw new Error("T-pose 校准暂不支持 matrix 节点: "+node.name);
    if(node.translation)object.position.fromArray(node.translation);
    if(node.rotation)object.quaternion.fromArray(node.rotation);
    if(node.scale)object.scale.fromArray(node.scale);
    return object;
  });
  gltf.nodes.forEach((node,i)=>(node.children??[]).forEach(child=>objects[i].add(objects[child])));
  const update=()=>{for(const object of objects)if(!object.parent)object.updateMatrixWorld(true);};
  const aim=(bone,child,direction)=>{
    update();
    const object=objects[bones[bone].node],end=objects[bones[child].node];
    const current=end.getWorldPosition(new Vector3()).sub(object.getWorldPosition(new Vector3())).normalize();
    const world=new Quaternion().setFromUnitVectors(current,new Vector3(...direction)).multiply(object.getWorldQuaternion(new Quaternion()));
    const parent=object.parent?.getWorldQuaternion(new Quaternion())??new Quaternion();
    object.quaternion.copy(parent.invert().multiply(world));
    gltf.nodes[bones[bone].node].rotation=object.quaternion.toArray();
  };
  for(const [side,sign] of [["left",1],["right",-1]]){
    aim(side+"UpperArm",side+"LowerArm",[sign,0,0]);
    aim(side+"LowerArm",side+"Hand",[sign,0,0]);
  }
}

// 眼睛与嘴共用一个材质时, 把指定方向最靠前的连通网格拆成独立的嘴部材质, 并使用外部嘴型贴图.
async function splitMouth(gltf,bin,io,mouth,fetchBytes){
  const pattern=new RegExp(mouth.material),hits=[];
  for(const mesh of gltf.meshes)for(const primitive of mesh.primitives)if(pattern.test(gltf.materials[primitive.material]?.name??""))hits.push({mesh,primitive});
  if(hits.length!==1)throw new Error("profile mouth.material 需匹配唯一网格材质, 实际 "+hits.length+" 个.");
  const {mesh,primitive}=hits[0],positions=io.read(primitive.attributes.POSITION),indices=io.read(primitive.indices).flat();
  const parents=positions.map((_,i)=>i),find=i=>{while(parents[i]!==i)i=parents[i]=parents[parents[i]];return i;},union=(a,b)=>{parents[find(a)]=find(b);};
  for(let i=0;i<indices.length;i+=3){union(indices[i],indices[i+1]);union(indices[i+1],indices[i+2]);}
  const order=positions.map((p,i)=>i).sort((a,b)=>positions[a][0]-positions[b][0]);
  for(let x=0;x<order.length;x++)for(let y=x+1;y<order.length&&positions[order[y]][0]-positions[order[x]][0]<mouth.tolerance;y++)
    if(Math.hypot(...positions[order[x]].map((v,k)=>v-positions[order[y]][k]))<mouth.tolerance)union(order[x],order[y]);
  const groups=new Map();
  for(const i of indices){const key=find(i);if(!groups.has(key))groups.set(key,new Set());groups.get(key).add(i);}
  const center=ids=>{const values=[...ids].map(i=>positions[i][mouth.axis]);return (Math.min(...values)+Math.max(...values))/2;};
  const sorted=[...groups.values()].sort((a,b)=>center(a)-center(b)),front=mouth.pick==="min"?sorted[0]:sorted.at(-1);
  const append=data=>{
    const padded=Buffer.concat([data,Buffer.alloc((4-data.length%4)%4)]),offset=bin.length-8;
    bin=Buffer.concat([bin,padded]);bin.writeUInt32LE(bin.length-8,0);gltf.buffers[0].byteLength=bin.length-8;
    gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length});return gltf.bufferViews.length-1;
  };
  const indexAccessor=values=>{
    const wide=values.some(v=>v>65535),data=Buffer.alloc(values.length*(wide?4:2));
    values.forEach((v,i)=>wide?data.writeUInt32LE(v,i*4):data.writeUInt16LE(v,i*2));
    gltf.accessors.push({bufferView:append(data),componentType:wide?5125:5123,count:values.length,type:"SCALAR"});return gltf.accessors.length-1;
  };
  const atlas=await fetchBytes(mouth.atlas.url);
  if(sha256(atlas)!==mouth.atlas.sha256)throw new Error("嘴型贴图与 profile 记录的 SHA-256 不一致, 请检查后再更新 profile.");
  const rest=[],own=[];
  for(let i=0;i<indices.length;i+=3)(front.has(indices[i])?own:rest).push(...indices.slice(i,i+3));
  gltf.images.push({name:"HAST_mouth_atlas",mimeType:"image/png",bufferView:append(atlas)});
  gltf.samplers=gltf.samplers??[];gltf.samplers.push({wrapS:10497,wrapT:10497,magFilter:9729,minFilter:9987});
  gltf.textures.push({source:gltf.images.length-1,sampler:gltf.samplers.length-1});
  gltf.extensionsUsed=[...new Set([...(gltf.extensionsUsed??[]),"KHR_texture_transform"])];
  gltf.materials.push({name:"HAST_mouth",alphaMode:"BLEND",pbrMetallicRoughness:{baseColorTexture:{index:gltf.textures.length-1,extensions:{KHR_texture_transform:{offset:mouth.atlas.offset,scale:mouth.atlas.scale}}},metallicFactor:0,roughnessFactor:1}});
  primitive.indices=indexAccessor(rest);
  mesh.primitives.push({...primitive,indices:indexAccessor(own),material:gltf.materials.length-1});
  return bin;
}

async function defaultFetch(url){
  const response=await fetch(url,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error("下载失败 HTTP "+response.status+": "+url);
  return Buffer.from(await response.arrayBuffer());
}

export async function convertModel(bytes,profile,{modelName="model",requiredBones=[],fetchBytes=defaultFetch}={}){
  const c=profile.conversion;
  if(!c)throw new Error("profile 没有 conversion, 无法转换非 VRM 模型.");
  let {gltf,bin}=readGlb(bytes);
  if(gltf.extensions?.VRMC_vrm||gltf.extensions?.VRM)throw new Error("输入已是 VRM, 不需要 conversion.");
  const io=accessorIO(gltf,bin),byName=new Map();
  gltf.nodes.forEach((node,i)=>{if(node.name!==undefined){if(byName.has(node.name))byName.set(node.name,-1);else byName.set(node.name,i);}});
  const bones={};
  for(const [bone,name] of Object.entries(c.humanBones)){
    const node=byName.get(name);
    if(node===undefined)throw new Error("模型缺少 profile 指定的骨骼: "+bone+" -> "+name);
    if(node<0)throw new Error("骨骼节点名不唯一: "+name);
    bones[bone]={node};
  }
  const virtualBones=[];
  for(const [bone,parent] of Object.entries(c.virtualBones??{})){
    if(bones[bone])continue;
    if(!bones[parent])throw new Error("虚拟骨骼的父骨骼不存在: "+bone+" -> "+parent);
    gltf.nodes.push({name:"HAST_virtual_"+bone,translation:[.01/c.scale,0,0]});
    (gltf.nodes[bones[parent].node].children??=[]).push(gltf.nodes.length-1);
    bones[bone]={node:gltf.nodes.length-1};virtualBones.push(bone);
  }
  const missing=requiredBones.filter(name=>!bones[name]);
  if(missing.length)throw new Error("profile 映射后仍缺少 HAST 需要的骨骼: "+missing.join(", "));
  if(new Set(Object.values(bones).map(b=>b.node)).size!==Object.keys(bones).length)throw new Error("多个人形骨骼映射到了同一节点.");
  // HAST 的正向运动学假设父节点为单位缩放, 所以把缩放烘焙进节点平移和顶点数据.
  if(c.scale!==1){
    for(const node of gltf.nodes){
      if(node.translation)node.translation=node.translation.map(v=>v*c.scale);
      if(node.matrix)for(const i of [12,13,14])node.matrix[i]*=c.scale;
    }
    const targets=new Map();
    for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){
      targets.set(primitive.attributes.POSITION,[0,1,2]);
      for(const target of primitive.targets??[])if(target.POSITION!==undefined)targets.set(target.POSITION,[0,1,2]);
    }
    for(const skin of gltf.skins??[])if(skin.inverseBindMatrices!==undefined)targets.set(skin.inverseBindMatrices,[12,13,14]);
    for(const animation of gltf.animations??[])for(const channel of animation.channels)if(channel.target.path==="translation")targets.set(animation.samplers[channel.sampler].output,[0,1,2]);
    for(const [index,keys] of targets){
      io.scale(index,c.scale,keys);
      const a=gltf.accessors[index];if(a.type==="VEC3")for(const key of ["min","max"])if(a[key])a[key]=a[key].map(v=>v*c.scale);
    }
  }
  if(c.tPoseArms)tPoseArms(gltf,bones);
  if(c.mouth)bin=await splitMouth(gltf,bin,io,c.mouth,fetchBytes);
  const hide=(c.hideMeshes??[]).map(p=>new RegExp(p)),hidden=[];
  for(const node of gltf.nodes)if(node.mesh!==undefined&&hide.some(p=>p.test(node.name??""))){hidden.push(node.name);delete node.mesh;delete node.skin;}
  const fill=value=>typeof value==="string"?value.replaceAll("{model}",modelName):Array.isArray(value)?value.map(fill):value;
  const meta=Object.fromEntries(Object.entries(c.meta).map(([key,value])=>[key,fill(value)]));
  gltf.extensionsUsed=[...new Set([...(gltf.extensionsUsed??[]),"VRMC_vrm"])];
  gltf.extensions={...gltf.extensions,VRMC_vrm:{specVersion:"1.0",meta:{licenseUrl:"https://vrm.dev/licenses/1.0/",...meta},humanoid:{humanBones:bones},expressions:{preset:{},custom:{}}}};
  embed(gltf,profile,sha256(bytes));
  return {bytes:writeGlb(gltf,bin),report:{profile:profile.id,model:modelName,mapped_bones:Object.keys(bones).length-virtualBones.length,virtual_bones:virtualBones,hidden_meshes:hidden,mouth:Boolean(c.mouth)}};
}
