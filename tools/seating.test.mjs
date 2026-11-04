import test from 'node:test';
import assert from 'node:assert/strict';
import {Object3D,Vector3} from 'three';
import {controllerV9} from '../motion/v9/controller.mjs';
import {jointRotation} from '../motion/joint_coordinates.mjs';
import {projectJoint,violation} from '../motion/joint_feasibility.mjs';
import {compileTools} from '../service/deepseek.mjs';
import {validateResult} from '../service/motion_result.mjs';
import {readFileSync} from 'node:fs';
import {humanBones} from '../service/avatar_profile.mjs';
function humanoid(scale=1,direction=1){
 const scene=new Object3D(),nodes=new Map(),names=[];
 const add=(name,parent,offset)=>{const node=new Object3D();node.position.set(...offset.map((v,i)=>v*scale*(i===0?direction:1)));(nodes.get(parent)??scene).add(node);nodes.set(name,node);names.push(name);};
 add('hips',null,[0,.86,0]);add('spine','hips',[0,.12,0]);add('chest','spine',[0,.16,0]);add('neck','chest',[0,.16,0]);add('head','neck',[0,.1,0]);
 for(const [side,sign]of [['left',1],['right',-1]]){
  add(side+'Shoulder','chest',[sign*.08,.12,0]);add(side+'UpperArm',side+'Shoulder',[sign*.12,0,0]);add(side+'LowerArm',side+'UpperArm',[sign*.28,0,0]);add(side+'Hand',side+'LowerArm',[sign*.24,0,0]);
  add(side+'UpperLeg','hips',[sign*.09,-.02,0]);add(side+'LowerLeg',side+'UpperLeg',[0,-.42,0]);add(side+'Foot',side+'LowerLeg',[0,-.4,0]);add(side+'Toes',side+'Foot',[0,0,.12*direction]);
 }
 scene.updateMatrixWorld(true);
 return {direction,profile:{bone_order:names},node:name=>nodes.get(name),vrm:{expressionManager:{getExpression:()=>null}},sync:()=>scene.updateMatrixWorld(true)};
}
const config=()=>({...JSON.parse(readFileSync(new URL('../configs/v9_control.json',import.meta.url))),arm_collision_enabled:false,cached_derivative:true});
test('seated tools expose all modes and reject simultaneous seated leg lifts',()=>{
 const tool=mode=>({function:{name:'set_posture',arguments:JSON.stringify({mode})}});
 for(const [mode,key]of Object.entries({'鸭子坐':'duck','左侧坐':'side-left','右侧坐':'side-right','摆腿坐':'swing','站起':'standing'})){
  const plan=compileTools([tool(mode)]);assert.equal(plan.posture,key);validateResult({...plan,reply:''},[]);
 }
 assert.throws(()=>compileTools([tool('鸭子坐'),tool('摆腿坐')]),/一种坐姿/);
 assert.throws(()=>compileTools([tool('鸭子坐'),{function:{name:'perform_actions',arguments:JSON.stringify({actions:[{part:'腿',side:'右',action:'上抬'}]})}}]),/坐姿不能/);
});
test('deep flexion is confined to seated limits, preserving the standing policy',()=>{
 const q=jointRotation('leftLowerLeg',new Vector3(-166*Math.PI/180,0,0));
 assert(violation('leftLowerLeg',q)>0);assert.equal(violation('leftLowerLeg',q,'seated-vrm0'),0);
 assert(projectJoint('leftLowerLeg',q,0).angleTo(q)>.1);
 assert(projectJoint('leftLowerLeg',q,0,'seated-vrm0').angleTo(q)<1e-7);
 const reverse=jointRotation('leftLowerLeg',new Vector3(166*Math.PI/180,0,0));
 assert.equal(violation('leftLowerLeg',reverse,'seated'),0);assert(violation('leftLowerLeg',reverse,'seated-vrm0')>0);
});
test('solver accepts ground seats, oscillating legs and return to foot support on different rigs',()=>{
 for(const [scale,direction]of [[.6,1],[1,-1]]){
  const solver=controllerV9(humanoid(scale,direction),{config:config()});
  const neutral=solver.rig.neutral.map(q=>q.toArray()),root=solver.rig.offsets[0].toArray();
  let result=solver.step({rotations:neutral,root},0),swing=[];
  for(const mode of ['duck','side-left','side-right','swing','side-right','standing']){
   for(let i=0;i<(mode==='standing'?140:100);i++){
    result=solver.step({rotations:neutral,root,posture:mode},.05);
    assert(result.last.feasible);assert(solver.validate(result));assert(result.last.bone_error_m<1e-6);assert.equal(result.last.range_error_deg,0);
    if(i>60&&mode==='swing'){
     const knee=result.state.p[solver.rig.index('leftLowerLeg')],foot=result.state.p[solver.rig.index('leftFoot')];
     assert(foot.y<knee.y-.2*scale,'swing shins must hang below the knees');swing.push(foot.z);
    }
   }
   if(mode!=='standing')assert(result.state.p[0].y<solver.rig.rest.p[0].y*.8,mode+' must actually sit');
   if(['duck','side-left','side-right'].includes(mode)){
    const floor=Math.min(...['leftFoot','rightFoot','leftToes','rightToes'].map(n=>solver.rig.rest.p[solver.rig.index(n)].y));
    const lowest=Math.min(...['leftLowerLeg','rightLowerLeg','leftFoot','rightFoot'].map(n=>result.state.p[solver.rig.index(n)].y));
    assert(lowest-floor<.08*scale,mode+' must rest on the ground instead of hovering');
   }
   if(mode==='duck'){
    const knee=result.state.p[solver.rig.index('leftLowerLeg')],foot=result.state.p[solver.rig.index('leftFoot')];
    assert(direction*(foot.x-knee.x)>0,'W-sit feet must be outside the knees');
    const right=result.state.p[solver.rig.index('rightLowerLeg')];
    assert(direction*knee.x>=0&&direction*right.x<=0,'W-sit knees must not cross the midline');
   }
   if(mode==='standing')assert(result.state.p[0].y>solver.rig.rest.p[0].y*.95);
   const bad={...result,root:[result.root[0],result.root[1]-.3,result.root[2]]};assert.equal(solver.validate(bad),false,'display validation must reject penetration or lost contact');
  }
  assert(Math.max(...swing)-Math.min(...swing)>.03*scale,'legs must oscillate');
  assert.equal(result.posture,'standing');assert.equal(result.last.support_kind,undefined,'must return to foot support');
  for(const seat of ['duck','side-left']){
   solver.reset();result=solver.step({rotations:neutral,root},0);
   for(const mode of [seat,'standing'])for(let i=0;i<120;i++){result=solver.step({rotations:neutral,root,posture:mode},.05);assert(result.last.feasible,seat+' must stand up without held frames');}
   assert(result.state.p[0].y>solver.rig.rest.p[0].y*.95,'standing straight from '+seat);
  }
  solver.reset();result=solver.step({rotations:neutral,root},0);assert.equal(result.posture,'standing');
  for(const mode of ['duck','side-right','swing','standing'])for(let i=0;i<12;i++){
   const previousRoot=new Vector3().fromArray(result.root);
   result=solver.step({rotations:neutral,root,posture:mode},.05);
   assert(result.last.feasible);assert(solver.validate(result));
   assert(new Vector3().fromArray(result.root).distanceTo(previousRoot)<=.8*.05+1e-7,'interrupted transitions keep the root speed limit');
  }
 }
});
test('VRM0 thumb bones are read with VRM1 names',()=>{
 const bones=humanBones({extensions:{VRM:{humanoid:{humanBones:[{bone:'leftThumbProximal',node:1},{bone:'leftThumbIntermediate',node:2},{bone:'rightThumbDistal',node:3},{bone:'hips',node:0}]}}}});
 assert.deepEqual(bones,{leftThumbMetacarpal:{node:1},leftThumbProximal:{node:2},rightThumbDistal:{node:3},hips:{node:0}});
});
