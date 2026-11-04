// 角色适配 profile: 导入时 conversion 把骨骼模型转换为 VRM, runtime 嵌入 VRM 后由网页读取.
// 模型没有嵌入 profile 时, 所有函数都返回 null 或不做任何修改, 保持官方逻辑.
import {MeshToonMaterial,SRGBColorSpace} from "three";
import {VRMExpression} from "@pixiv/three-vrm";
export const PROFILE_VERSION=1,PROFILE_EXTRA="hastModelProfile";
const fail=message=>{throw new Error("角色 profile 无效: "+message);};
const isObject=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const number=(x,min,max)=>typeof x==="number"&&Number.isFinite(x)&&x>=min&&x<=max;
const vector=(x,size=3,limit=10)=>Array.isArray(x)&&x.length===size&&x.every(v=>number(v,-limit,limit));
const strings=x=>Array.isArray(x)&&x.every(v=>typeof v==="string"&&v.length>0);
function regex(source,where){try{return new RegExp(source);}catch{fail(where+" 不是有效正则: "+source);}}

function validateRuntime(r){
  if(!isObject(r))fail("runtime");
  if(r.material!==undefined&&!["original","toon"].includes(r.material))fail("runtime.material");
  if(r.armCollision!==undefined&&typeof r.armCollision!=="boolean")fail("runtime.armCollision");
  if(r.lighting!==undefined){
    const l=r.lighting;
    if(!isObject(l)||!/^#[0-9a-f]{6}$/i.test(l.background)||!number(l.ambient,0,20)||!number(l.key,0,20))fail("runtime.lighting");
  }
  if(r.attachments!==undefined){
    if(!Array.isArray(r.attachments)||!r.attachments.every(a=>isObject(a)&&typeof a.node==="string"&&a.node&&typeof a.bone==="string"&&a.bone))fail("runtime.attachments");
  }
  if(r.mouthAtlas!==undefined){
    const m=r.mouthAtlas,cell=c=>Array.isArray(c)&&c.length===2&&c.every(Number.isInteger)&&c[0]>=0&&c[1]>=0&&c[0]<m.grid[0]&&c[1]<m.grid[1];
    if(!isObject(m)||typeof m.material!=="string"||!m.material||!(Array.isArray(m.grid)&&m.grid.length===2&&m.grid.every(n=>Number.isInteger(n)&&n>0&&n<=64))||!vector(m.origin,2)||!cell(m.neutral)||!Array.isArray(m.rules))fail("runtime.mouthAtlas");
    for(const [i,rule] of m.rules.entries())if(!isObject(rule)||typeof rule.name!=="string"||!rule.name||!number(rule.min,0,1)||!cell(rule.cell))fail("runtime.mouthAtlas.rules["+i+"]");
  }
  if(r.armPose!==undefined){
    const a=r.armPose;
    if(!isObject(a)||!vector(a.rest,3,1)||!vector(a.pole,3,1)||!number(a.speed,.01,5)||!number(a.maxElbowDegrees,1,179)||!Array.isArray(a.poses))fail("runtime.armPose");
    for(const [i,pose] of a.poses.entries()){
      if(!isObject(pose)||typeof pose.match!=="string"||!vector(pose.target,3,1))fail("runtime.armPose.poses["+i+"]");
      regex(pose.match,"runtime.armPose.poses["+i+"].match");
      if(pose.wave!==undefined&&(!isObject(pose.wave)||!number(pose.wave.amplitude,0,.5)||!number(pose.wave.frequency,0,20)))fail("runtime.armPose.poses["+i+"].wave");
    }
  }
}

function validateConversion(c){
  if(!isObject(c)||c.format!=="glb-humanoid")fail("conversion.format 需为 glb-humanoid");
  if(!number(c.scale,1e-4,1e5)||typeof c.tPoseArms!=="boolean")fail("conversion.scale/tPoseArms");
  if(!isObject(c.humanBones)||!Object.values(c.humanBones).every(v=>typeof v==="string"&&v))fail("conversion.humanBones");
  if(c.virtualBones!==undefined&&(!isObject(c.virtualBones)||!Object.values(c.virtualBones).every(v=>typeof v==="string"&&v)))fail("conversion.virtualBones");
  if(c.hideMeshes!==undefined){if(!strings(c.hideMeshes))fail("conversion.hideMeshes");c.hideMeshes.forEach(p=>regex(p,"conversion.hideMeshes"));}
  if(!isObject(c.meta)||typeof c.meta.name!=="string"||!strings(c.meta.authors))fail("conversion.meta");
  const m=c.mouth;
  if(m!==undefined){
    if(!isObject(m)||typeof m.material!=="string"||!number(m.tolerance,1e-9,.01)||![0,1,2].includes(m.axis)||!["min","max"].includes(m.pick))fail("conversion.mouth");
    regex(m.material,"conversion.mouth.material");
    const t=m.atlas;
    if(!isObject(t)||!/^https:\/\//.test(t.url)||!/^[0-9a-f]{64}$/.test(t.sha256)||!vector(t.offset,2)||!vector(t.scale,2))fail("conversion.mouth.atlas");
  }
}

export function validateModelProfile(profile){
  if(!isObject(profile)||profile.version!==PROFILE_VERSION||!/^[a-z0-9][a-z0-9-]*$/.test(profile.id??""))fail("version/id");
  if(profile.conversion!==undefined)validateConversion(profile.conversion);
  validateRuntime(profile.runtime??{});
  return profile;
}

// 浏览器侧只读取嵌入的 runtime; 未嵌入时返回 null.
export function embeddedProfile(gltf){
  const profile=gltf.parser?.json?.asset?.extras?.[PROFILE_EXTRA];
  if(profile===undefined)return null;
  validateModelProfile(profile);
  return {id:profile.id,runtime:profile.runtime??{}};
}

function toonMaterials(vrm){
  const cache=new Map();
  const convert=source=>{
    if(cache.has(source))return cache.get(source);
    const map=source.map?.clone();
    if(map){map.colorSpace=SRGBColorSpace;map.needsUpdate=true;}
    const material=new MeshToonMaterial({name:source.name,map,color:source.color,side:source.side,transparent:source.transparent,depthWrite:!source.transparent,alphaTest:source.alphaTest,normalMap:source.normalMap??null,emissive:source.emissive,emissiveMap:source.emissiveMap??null});
    cache.set(source,material);return material;
  };
  vrm.scene.traverse(object=>{if(object.isMesh)object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);});
}

// 保留导入时的位置和朝向, 再把节点挂到人形骨骼上随骨骼运动 (如独立于头骨的光环).
function attachNodes(vrm,attachments){
  const resolved=attachments.map(({node,bone})=>{
    const matches=[];vrm.scene.traverse(object=>{if(object.name===node)matches.push(object);});
    if(matches.length!==1)throw new Error("profile 附件需对应唯一节点: "+node);
    const parent=vrm.humanoid.getRawBoneNode(bone);
    if(!parent)throw new Error("profile 附件骨骼不存在: "+bone);
    for(let up=parent;up;up=up.parent)if(up===matches[0])throw new Error("profile 附件会形成循环: "+node);
    return {object:matches[0],parent};
  });
  vrm.scene.updateMatrixWorld(true);
  for(const {object,parent} of resolved)parent.attach(object);
  vrm.scene.updateMatrixWorld(true);
}

// 嘴型图集: 表情不靠形态键, 而是切换贴图格子. 贴图偏移不能按权重混合, 所以每帧按 rules 顺序
// 取第一条权重达到 min 的规则显示其格子; 同一表情可写多条规则表示不同张口程度.
function mouthAtlas(vrm,atlas){
  const manager=vrm.expressionManager;
  for(const {name} of atlas.rules)if(!manager.getExpression(name))manager.registerExpression(new VRMExpression(name));
  const maps=new Set();
  vrm.scene.traverse(object=>{if(object.isMesh)for(const material of [object.material].flat())if(material.name===atlas.material&&material.map)maps.add(material.map);});
  if(!maps.size)throw new Error("profile 嘴型图集材质不存在: "+atlas.material);
  const show=([column,row])=>{for(const map of maps)map.offset.set(atlas.origin[0]+column/atlas.grid[0],atlas.origin[1]+row/atlas.grid[1]);};
  const update=manager.update.bind(manager);
  manager.update=(...args)=>{
    update(...args);
    show(atlas.rules.find(rule=>(manager.getValue(rule.name)??0)>=rule.min)?.cell??atlas.neutral);
  };
  show(atlas.neutral);
}

export function applyModelProfile(vrm,profile){
  vrm.modelProfile=profile;
  if(!profile)return vrm;
  if(profile.runtime.material==="toon")toonMaterials(vrm);
  if(profile.runtime.attachments?.length)attachNodes(vrm,profile.runtime.attachments);
  if(profile.runtime.mouthAtlas)mouthAtlas(vrm,profile.runtime.mouthAtlas);
  return vrm;
}
