import {Vector3} from 'three';
import {jointCoordinates,jointRotation} from '../joint_coordinates.mjs';
import {projectJoint,violation} from '../joint_feasibility.mjs';
import {supportHull} from '../support_geometry.mjs';
export const POSTURE_MODES=['standing','duck','side-left','side-right','swing'];
const lower=name=>/Leg|Foot|Toes/.test(name)||name==='hips';
const GROUND=new Set(['duck','side-left','side-right']);
const rad=Math.PI/180;

// Authored lower-body targets are inputs to the constrained solver, never a post-solve override.
export function seating(rig,direction=1){
 const floor=Math.min(...['leftFoot','rightFoot','leftToes','rightToes'].map(n=>rig.rest.p[rig.index(n)].y));
 const leg=['left','right'].reduce((s,side)=>s+rig.offsets[rig.index(side+'LowerLeg')].length()+rig.offsets[rig.index(side+'Foot')].length(),0)/2;
 const limitMode=direction<0?'seated-vrm0':'seated';
 const contact=Math.min(...['leftFoot','rightFoot'].map(n=>rig.rest.p[rig.index(n)].y));
 let requested='standing',via=null,from=null,elapsed=0,time=0,last=null;
 function reset(){requested='standing';via=null;from=null;elapsed=0;time=0;last=null;}
 const snapshot=(previous,raw,root)=>previous?{q:previous.q.map(q=>q.clone()),p:previous.p.clone()}:{q:raw.map(q=>q.clone()),p:root.clone()};
 function prepare(mode,raw,root,dt,previous){
  if(!POSTURE_MODES.includes(mode))throw Error('未知坐姿模式.');
  // Rising straight from a floor seat sweeps the shins through the floor, so it first passes through the seated swing pose with the shins upright.
  if(mode!==requested){from=snapshot(previous,raw,root);via=mode==='standing'&&GROUND.has(requested)?'rise':null;requested=mode;elapsed=0;}
  const duration=2.4;if(via&&elapsed>=duration){via=null;from=snapshot(previous,raw,root);elapsed=0;}
  const pose=via??mode;
  if(mode==='standing'&&!from){last=null;return null;}
  elapsed+=dt;time+=dt;const t=Math.min(1,elapsed/duration),blend=t*t*(3-2*t);
  const q=raw.map(q=>q.clone()),set=(name,angles)=>{q[rig.index(name)]=projectJoint(name,jointRotation(name,new Vector3(angles[0]*direction,angles[1],angles[2]*direction).multiplyScalar(rad)),0,limitMode);};
  if(pose!=='standing'){
   set('hips',[0,0,0]);
   for(const [side,sign]of [['left',1],['right',-1]]){
    const wave=pose==='swing'?Math.sin(time*2.4+(side==='right'?.35:0))*16:0;
    const lateral=pose==='side-left'?1:pose==='side-right'?-1:0;
    set(side+'UpperLeg',pose==='duck'?[-85,-sign*35,sign*20]:lateral?[-78,lateral*45,lateral*28]:[-90+wave,sign*3,sign*3]);
    q[rig.index(side+'LowerLeg')]=jointRotation(side+'LowerLeg',new Vector3((pose==='swing'||pose==='rise'?88-wave*.6:170)*rad*direction,0,0));
    // Floor seats plantar-flex so the instep, not the toe tips, meets the floor.
    set(side+'Foot',pose==='swing'||pose==='rise'?[-8,0,0]:[55,0,0]);set(side+'Toes',[0,0,0]);
   }
  }else q.forEach((value,i)=>{if(lower(rig.names[i]))q[i]=rig.neutral[i].clone();});
  if(from)q.forEach((value,i)=>{const name=rig.names[i];if(!lower(name))return;
   q[i]=/LowerLeg$/.test(name)?jointRotation(name,jointCoordinates(name,from.q[i]).lerp(jointCoordinates(name,value),blend)):from.q[i].clone().slerp(value,blend);});
  // Seat height scales with leg length. Ground seats use pelvis/shin support; swing uses a virtual seat.
  const desired=root.clone(),standingY=rig.rest.p[0].y;
  // Floor seats rest the lowest knee or ankle at the standing ankle height instead of guessing a hover height.
  let height=standingY;
  if(pose==='swing'||pose==='rise')height=floor+leg*.66;
  else if(pose!=='standing'){const s=rig.fk(q,root);height=s.p[0].y+contact-Math.min(...['leftLowerLeg','rightLowerLeg','leftFoot','rightFoot'].map(n=>s.p[rig.index(n)].y));}
  if(from){const fromY=rig.fk(from.q,from.p).p[0].y;height=fromY+(height-fromY)*blend;}
  let state=rig.fk(q,desired);const delta=new Vector3(0,height-state.p[0].y,0).applyQuaternion(rig.baseQ.clone().invert());desired.add(delta);
  state=rig.fk(q,desired);
  const ids=rig.names.map((n,i)=>/Leg|Foot|Toes/.test(n)?i:-1).filter(i=>i>=0);
  const min=Math.min(...ids.map(i=>state.p[i].y));
  if(min<floor)desired.add(new Vector3(0,floor-min,0).applyQuaternion(rig.baseQ.clone().invert()));
  state=rig.fk(q,desired);
  const pelvis=state.p[0],supportNames=pose==='swing'||pose==='rise'?['hips']:['hips','leftLowerLeg','rightLowerLeg','leftFoot','rightFoot'];
  const points=[];for(const name of supportNames){const p=state.p[rig.index(name)];for(const x of [-1,1])for(const z of [-1,1])points.push(p.clone().add(new Vector3(x*leg*.18,0,z*leg*.22)));}
  last={mode,limitMode,transition:t<1,floor,leg,pelvis:pelvis.clone(),hull:supportHull(points),support:pose==='swing'||pose==='rise'?'virtual-seat':'pelvis-shins',q,root:desired};
  if(pose==='standing'&&t===1&&previous){
   const actual=rig.fk(previous.q,previous.p);
   const landed=['leftFoot','rightFoot'].every(name=>{const i=rig.index(name);return Math.abs(actual.p[i].y-rig.rest.p[i].y)<.015&&new Vector3(0,1,0).applyQuaternion(actual.q[i]).angleTo(new Vector3(0,1,0))<10*rad;});
   if(landed&&previous.q.every((value,i)=>violation(rig.names[i],value)<1e-6))from=null;
  }
  return last;
 }
 return {prepare,reset,current:()=>last};
}
