import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {embeddedProfile,applyModelProfile,validateModelProfile} from "../web/model_profile.mjs";
import {bindProfile,convertModel,loadModelProfile,readGlb,writeGlb} from "./model_convert.mjs";
const root=fileURLToPath(new URL("../",import.meta.url));

// 最小骨骼模型: 肩-上臂-前臂-手 两侧各一条链, 手臂向下 (A-pose), 外加一个应被隐藏的道具网格.
function sampleGlb(){
  const nodes=[{name:"Root",children:[1]},{name:"Pelvis",children:[2,3,7]},{name:"Head"}];
  for(const [side,sign] of [["L",1],["R",-1]]){
    const base=nodes.length;
    nodes.push({name:side+" Shoulder",translation:[sign*.001,.002,0],children:[base+1]},{name:side+" Upper",translation:[sign*.001,0,0],children:[base+2]},{name:side+" Lower",translation:[sign*.0005,-.002,0],children:[base+3]},{name:side+" Hand",translation:[0,-.002,0]});
  }
  nodes.push({name:"Gun_Weapon",mesh:0},{name:"Char_Body",mesh:0});
  nodes[0].children.push(11,12);
  const bin=Buffer.alloc(8+36);bin.writeUInt32LE(36,0);bin.writeUInt32LE(0x004e4942,4);
  [0,0,0,.001,0,0,0,.001,0].forEach((v,i)=>bin.writeFloatLE(v,8+i*4));
  const gltf={asset:{version:"2.0"},scene:0,scenes:[{nodes:[0]}],nodes,meshes:[{name:"m",primitives:[{attributes:{POSITION:0},material:0}]}],materials:[{name:"mat"}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:"VEC3",min:[0,0,0],max:[.001,.001,0]}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36}],buffers:[{byteLength:36}]};
  return writeGlb(gltf,bin);
}
const sampleProfile=()=>validateModelProfile({version:1,id:"sample",conversion:{format:"glb-humanoid",scale:100,tPoseArms:true,
  humanBones:{hips:"Pelvis",head:"Head",leftShoulder:"L Shoulder",leftUpperArm:"L Upper",leftLowerArm:"L Lower",leftHand:"L Hand",rightShoulder:"R Shoulder",rightUpperArm:"R Upper",rightLowerArm:"R Lower",rightHand:"R Hand"},
  virtualBones:{leftIndexProximal:"leftHand"},hideMeshes:["_Weapon$"],meta:{name:"{model} test",authors:["test"]}},
  runtime:{material:"toon",attachments:[{node:"Gun_Weapon",bone:"head"}],armCollision:false}});

test("没有嵌入 profile 的模型保持官方逻辑",()=>{
  assert.equal(embeddedProfile({parser:{json:{asset:{}}}}),null);
  const vrm={scene:{traverse(){throw Error("不应修改场景");}}};
  assert.equal(applyModelProfile(vrm,null),vrm);
  assert.equal(vrm.modelProfile,null);
});

test("非法 profile 被拒绝",()=>{
  for(const mutate of [p=>p.version=2,p=>p.id="Bad Id",p=>p.runtime.material="pbr",p=>p.runtime.lighting={background:"red",ambient:1,key:1},p=>p.conversion.scale=0,p=>p.conversion.hideMeshes=["("],p=>p.runtime.armPose={rest:[0,0,0],pole:[0,0,0],speed:1,maxElbowDegrees:90,poses:[{match:"(",target:[0,0,0]}]}]){
    const profile=structuredClone(sampleProfile());mutate(profile);
    assert.throws(()=>validateModelProfile(profile),/profile 无效/);
  }
});

test("extends 逐层合并对象, 数组整体覆盖",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"hast-profile-"));
  await writeFile(join(dir,"base.json"),JSON.stringify(sampleProfile()));
  await writeFile(join(dir,"child.json"),JSON.stringify({extends:"base.json",version:1,id:"child",runtime:{lighting:{background:"#112233",ambient:1,key:1},attachments:[]}}));
  const profile=await loadModelProfile(join(dir,"child.json"));
  assert.equal(profile.id,"child");assert.equal(profile.runtime.material,"toon");
  assert.deepEqual(profile.runtime.attachments,[]);assert.equal(profile.conversion.scale,100);
  await writeFile(join(dir,"loop.json"),JSON.stringify({extends:"loop.json",version:1,id:"loop"}));
  await assert.rejects(loadModelProfile(join(dir,"loop.json")),/循环/);
});

test("按 profile 把骨骼模型转换为 VRM 并嵌入 runtime",async()=>{
  const {bytes,report}=await convertModel(sampleGlb(),sampleProfile(),{modelName:"Char",requiredBones:["hips","head","leftIndexProximal"]});
  const {gltf,bin}=readGlb(bytes),vrm=gltf.extensions.VRMC_vrm,node=name=>gltf.nodes.find(n=>n.name===name);
  assert.equal(vrm.meta.name,"Char test");assert.equal(vrm.meta.licenseUrl,"https://vrm.dev/licenses/1.0/");
  assert.equal(gltf.nodes[vrm.humanoid.humanBones.hips.node].name,"Pelvis");
  assert.equal(gltf.nodes[vrm.humanoid.humanBones.leftIndexProximal.node].name,"HAST_virtual_leftIndexProximal");
  assert.deepEqual(report.hidden_meshes,["Gun_Weapon"]);assert.equal(node("Gun_Weapon").mesh,undefined);assert.equal(node("Char_Body").mesh,0);
  assert.ok(Math.abs(bin.readFloatLE(8+12)-.1)<1e-6);assert.ok(Math.abs(gltf.accessors[0].max[0]-.1)<1e-6);
  const embedded=gltf.asset.extras.hastModelProfile;
  assert.equal(embedded.id,"sample");assert.equal(embedded.conversion,undefined);assert.equal(embedded.source.converted,true);
  assert.deepEqual(embeddedProfile({parser:{json:gltf}}),{id:"sample",runtime:sampleProfile().runtime});
});

test("缺少 profile 指定的骨骼时明确报错",async()=>{
  const profile=sampleProfile();profile.conversion.humanBones.neck="Neck";
  await assert.rejects(convertModel(sampleGlb(),profile),/缺少 profile 指定的骨骼: neck/);
  await assert.rejects(convertModel(sampleGlb(),sampleProfile(),{requiredBones:["leftEye"]}),/leftEye/);
});

test("VRM 只嵌入 runtime, 非 VRM 不能直接绑定",async()=>{
  const {bytes}=await convertModel(sampleGlb(),sampleProfile());
  const runtimeOnly={version:1,id:"soft",runtime:{lighting:{background:"#e8dfd5",ambient:2,key:.5}}};
  assert.equal(readGlb(bindProfile(bytes,runtimeOnly)).gltf.asset.extras.hastModelProfile.id,"soft");
  assert.throws(()=>bindProfile(sampleGlb(),runtimeOnly),/不是 VRM/);
});

test("随附的 Kivo 通用 profile 和示例均有效",async()=>{
  const kivo=await loadModelProfile(join(root,"configs/model_profiles/kivo.json"));
  const mika=await loadModelProfile(join(root,"configs/model_profiles/examples/kivo-mika.json"));
  assert.equal(mika.conversion.scale,kivo.conversion.scale);
  assert.notEqual(mika.runtime.lighting.background,kivo.runtime.lighting.background);
  const hide=new RegExp(kivo.conversion.hideMeshes[0]);
  for(const name of ["CH0069_Weapon","CH0069_Weapon001","Momoi_Original_GamePad","Airi_Original_Icecream_01"])assert.ok(hide.test(name),name);
  for(const name of ["CH0069_Body","Azusa_Original_Halo"])assert.ok(!hide.test(name),name);
});

test("嘴型图集按规则顺序切换格子",()=>{
  const map={offset:{set(u,v){this.u=u;this.v=v;}}},values={},registered=new Map();
  const mesh={isMesh:true,material:{name:"mouth",map}};
  const manager={getExpression:n=>registered.get(n),registerExpression:e=>registered.set(e.expressionName,e),getValue:n=>values[n]??0,update(){}};
  const vrm={scene:{traverse:f=>f(mesh)},expressionManager:manager};
  const mouthAtlas={material:"mouth",grid:[8,8],origin:[0,-.375],neutral:[0,2],rules:[{name:"aa",min:.2,cell:[1,3]},{name:"aa",min:.05,cell:[1,1]},{name:"happy",min:.3,cell:[0,3]}]};
  applyModelProfile(vrm,{id:"t",runtime:validateModelProfile({version:1,id:"t",runtime:{mouthAtlas}}).runtime});
  const cell=()=>[map.offset.u*8,(map.offset.v+.375)*8];
  assert.deepEqual([...registered.keys()],["aa","happy"]);
  assert.deepEqual(cell(),[0,2]);
  Object.assign(values,{aa:.1,happy:.9});manager.update();assert.deepEqual(cell(),[1,1]);
  Object.assign(values,{aa:.3});manager.update();assert.deepEqual(cell(),[1,3]);
  Object.assign(values,{aa:0});manager.update();assert.deepEqual(cell(),[0,3]);
  Object.assign(values,{happy:.1});manager.update();assert.deepEqual(cell(),[0,2]);
  assert.throws(()=>validateModelProfile({version:1,id:"t",runtime:{mouthAtlas:{...mouthAtlas,neutral:[8,0]}}}),/mouthAtlas/);
});
