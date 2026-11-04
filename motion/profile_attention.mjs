import {Vector3,Quaternion,Euler} from "three";
// 姿态求解后的两项 profile 修正: 限制身体朝向偏离正前方的角度, 以及让头颈转向鼠标位置.
// 归一化骨骼在静止姿态下朝向世界 +Z, 所以用初始化时的世界朝向作为各骨骼的参照.
// 注视点取鼠标射线上相机到头部距离的 80% 处, 相当于看向屏幕上的光标, 而不是头部旁边的一点.
const FORWARD=new Vector3(0,0,1),UP=new Vector3(0,1,0);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rad=Math.PI/180;
export function profileAttention(controller,{bodyYawLimitDegrees,lookAtPointer}={},pointerRay=()=>null){
  if(bodyYawLimitDegrees===undefined&&!lookAtPointer)return null;
  const world=name=>controller.node(name).getWorldQuaternion(new Quaternion());
  const rest=Object.fromEntries(["hips","chest","neck","head"].map(name=>[name,world(name)]));
  let yaw=0,pitch=0,weight=0,diagnostics={};
  const relative=name=>world(name).multiply(rest[name].clone().invert());
  function setWorld(name,target){
    const node=controller.node(name),parent=node.parent.getWorldQuaternion(new Quaternion());
    node.quaternion.copy(parent.invert().multiply(target));controller.sync();
  }
  function limitBody(){
    const facing=FORWARD.clone().applyQuaternion(relative("hips")),current=Math.atan2(facing.x,facing.z)/rad;
    diagnostics.body_yaw_degrees=current;
    if(Math.abs(current)<=bodyYawLimitDegrees)return;
    const turn=new Quaternion().setFromAxisAngle(UP,(Math.sign(current)*bodyYawLimitDegrees-current)*rad);
    setWorld("hips",turn.multiply(world("hips")));
    diagnostics.body_yaw_limited_degrees=Math.sign(current)*bodyYawLimitDegrees;
  }
  function look(dt){
    const settings=lookAtPointer,ray=pointerRay(),chest=relative("chest");
    const head=controller.node("head").getWorldPosition(new Vector3());
    let targetYaw=0,targetPitch=0;
    if(ray){
      const distance=ray.direction.dot(head.clone().sub(ray.origin))*.8;
      const local=ray.origin.clone().addScaledVector(ray.direction,Math.max(distance,.1)).sub(head).normalize().applyQuaternion(chest.clone().invert());
      targetYaw=clamp(Math.atan2(local.x,local.z)/rad,-settings.maxYawDegrees,settings.maxYawDegrees);
      targetPitch=clamp(Math.asin(clamp(local.y,-1,1))/rad,-settings.maxPitchDegrees,settings.maxPitchDegrees);
    }
    const follow=dt>0?1-Math.exp(-dt*settings.speed):0;
    weight+=((ray?1:0)-weight)*follow;
    if(ray||weight<.001){yaw+=(targetYaw-yaw)*follow;pitch+=(targetPitch-pitch)*follow;}
    diagnostics.look={pointer:Boolean(ray),yaw_degrees:yaw,pitch_degrees:pitch,weight};
    if(weight<.001)return;
    for(const [name,share] of [["neck",.4],["head",1]]){
      const turn=new Quaternion().setFromEuler(new Euler(-pitch*share*rad,yaw*share*rad,0,"YXZ"));
      const target=chest.clone().multiply(turn).multiply(rest[name]);
      setWorld(name,world(name).slerp(target,weight));
    }
  }
  return {
    apply(dt=0){diagnostics={};if(bodyYawLimitDegrees!==undefined)limitBody();if(lookAtPointer)look(dt);},
    reset(){yaw=0;pitch=0;weight=0;},
    report:()=>diagnostics,
  };
}
