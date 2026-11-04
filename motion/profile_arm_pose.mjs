import {Vector3,Quaternion} from "three";
import {armTargets} from "../hands/arm_ik.mjs";
// 手臂比例与训练骨架差异很大的角色 (如 Q 版) 无法直接复用动作片段的手臂旋转.
// HAST 仍负责选择动作, 这里按 profile 把当前手臂动作映射为手部目标点, 再用两段 IK 求解.
// 目标点以肩为原点, 单位为手臂长度: x 向外侧, y 向上, z 向前.
export function profileArmPose(controller,settings){
  if(!settings)return null;
  const ik=armTargets(controller),poses=settings.poses.map(p=>({...p,pattern:new RegExp(p.match)}));
  const previous=new Map(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  let tracks=[],diagnostics={};
  function apply(dt=0){
    const body=controller.node("hips").getWorldQuaternion(new Quaternion());
    const facing=new Vector3(0,0,1).applyQuaternion(body).setY(0).normalize(),outward=new Vector3(1,0,0).applyQuaternion(body).setY(0).normalize();
    diagnostics={};
    for(const [side,sign] of [["left",1],["right",-1]]){
      for(const part of ["Shoulder","UpperArm","LowerArm","Hand"])controller.node(side+part).quaternion.identity();
      controller.sync();
      const shoulder=controller.node(side+"UpperArm").getWorldPosition(new Vector3());
      const length=controller.node(side+"LowerArm").position.length()+controller.node(side+"Hand").position.length();
      const local=new Vector3(...settings.rest);
      const track=tracks.filter(t=>t.side===side&&t.weight>.001).at(-1),pose=track&&poses.find(p=>p.pattern.test(track.key));
      if(pose){
        const desired=new Vector3(...pose.target);
        if(pose.wave)desired.x+=pose.wave.amplitude*Math.sin(track.age*pose.wave.frequency);
        local.lerp(desired,clamp(track.weight,0,1));
      }
      local.multiplyScalar(length);
      const goal=shoulder.clone().addScaledVector(outward,sign*local.x).add(new Vector3(0,local.y,0)).addScaledVector(facing,local.z);
      const prior=previous.get(side);
      if(prior&&dt>0){const delta=goal.clone().sub(prior),step=clamp(dt,0,.1)*settings.speed;if(delta.length()>step)goal.copy(prior).add(delta.setLength(step));}
      previous.set(side,goal.clone());
      const pole=shoulder.clone().addScaledVector(outward,sign*length*settings.pole[0]).add(new Vector3(0,length*settings.pole[1],0)).addScaledVector(facing,length*settings.pole[2]);
      ik(side,goal,1,pole);
      const elbow=controller.node(side+"LowerArm").getWorldPosition(new Vector3()),hand=controller.node(side+"Hand").getWorldPosition(new Vector3());
      const bend=elbow.clone().sub(shoulder).angleTo(hand.clone().sub(elbow))*180/Math.PI;
      if(!Number.isFinite(bend)||bend>settings.maxElbowDegrees)throw new Error("profile 手臂姿态超出肘部角度限制.");
      diagnostics[side]={skill:track?.key??"rest",pose:pose?.match??null,elbow_bend_degrees:bend,hand_target_error_m:hand.distanceTo(goal)};
    }
  }
  return {setTracks(value){tracks=value??[];},apply,reset(){previous.clear();},report:()=>diagnostics};
}
