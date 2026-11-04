import {Vector3,Quaternion} from "three";
// 手形: 按手指弯曲程度 (0 张开, 1 握拳) 设置各指节; 不依赖动作片段, 任何完整人形骨骼都适用.
const FINGERS={Thumb:["Metacarpal","Proximal","Distal"],Index:["Proximal","Intermediate","Distal"],Middle:["Proximal","Intermediate","Distal"],Ring:["Proximal","Intermediate","Distal"],Little:["Proximal","Intermediate","Distal"]};
const CURL_DEGREES={Thumb:[20,35,45],other:[80,90,60]},PALM=new Vector3(0,-1,0);
// 归一化骨骼在 T-pose 下手臂沿世界 ±X、掌心朝下; 记录静止时各骨骼的局部轴, 运行时与模型的骨骼朝向无关.
export function handRig(controller,side,sign){
  const quaternion=name=>controller.node(name).getWorldQuaternion(new Quaternion()),position=name=>controller.node(name).getWorldPosition(new Vector3());
  const rest=quaternion(side+"Hand").invert(),along=position(side+"Hand").sub(position(side+"LowerArm")).normalize();
  const joints=[];
  for(const [finger,parts] of Object.entries(FINGERS)){
    const names=parts.map(part=>side+finger+part);let direction=new Vector3(sign,0,0);
    names.forEach((name,i)=>{
      if(names[i+1]){const next=position(names[i+1]).sub(position(name));if(next.length()>1e-6)direction=next.normalize();}
      const parent=controller.node(name).parent.getWorldQuaternion(new Quaternion()).invert();
      joints.push({name,axis:direction.clone().cross(PALM).normalize().applyQuaternion(parent),degrees:(CURL_DEGREES[finger]??CURL_DEGREES.other)[i]});
    });
  }
  return {along:along.applyQuaternion(rest.clone()),palm:PALM.clone().applyQuaternion(rest),joints};
}
export function curlHand(controller,rig,curl,weight=1){
  const target=new Quaternion();
  for(const joint of rig.joints){target.setFromAxisAngle(joint.axis,curl*joint.degrees*Math.PI/180);controller.node(joint.name).quaternion.slerp(target,weight);}
  controller.sync();
}
// 中文指令中的手形 (握拳/张开): 从 delay 开始保持 duration 秒, 前后各用 fade 秒过渡; 没有手形指令时不修改手指.
export function handShapes(controller,{fade=.15}={}){
  const rigs=Object.fromEntries([["left",1],["right",-1]].map(([side,sign])=>[side,handRig(controller,side,sign)]));
  let time=0,shapes=[];
  const ease=x=>Math.max(0,Math.min(1,x));
  return {
    add({side,curl,delay=0,duration=2}){
      if(!rigs[side]||!Number.isFinite(curl)||curl<0||curl>1||!Number.isFinite(delay)||delay<0||!Number.isFinite(duration)||duration<0)throw new Error("手形指令无效.");
      shapes=shapes.filter(s=>s.side!==side||s.start+s.duration<time+delay);
      shapes.push({side,curl,start:time+delay,duration});
    },
    apply(dt=0){
      time+=Math.max(0,dt);shapes=shapes.filter(s=>time<=s.start+s.duration+fade);
      for(const s of shapes){const weight=Math.min(ease((time-s.start)/fade),ease((s.start+s.duration+fade-time)/fade));if(weight>0)curlHand(controller,rigs[s.side],s.curl,weight);}
    },
    clear(){shapes=[];},
    report:()=>shapes.map(({side,curl,start,duration})=>({side,curl,starts_in:start-time,duration})),
  };
}
