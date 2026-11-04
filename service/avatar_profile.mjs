import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
// VRM0 的拇指命名为 Proximal/Intermediate/Distal, 对应 VRM1 的 Metacarpal/Proximal/Distal (与 three-vrm 加载时的映射一致).
const VRM0_THUMB={ThumbProximal:'ThumbMetacarpal',ThumbIntermediate:'ThumbProximal',ThumbDistal:'ThumbDistal'};
export function humanBones(json){
 const v1=json.extensions?.VRMC_vrm,v0=json.extensions?.VRM;
 if(v1)return v1.humanoid.humanBones;
 if(!v0)return null;
 return Object.fromEntries(v0.humanoid.humanBones.map(b=>[b.bone.replace(/(left|right)(Thumb\w+)$/,(m,side,part)=>side+(VRM0_THUMB[part]??part)),{node:b.node}]));
}
export async function avatarProfile(root){
 const bytes=await readFile(resolve(root,'assets/avatar.vrm'));
 if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(16)!==0x4e4f534a||bytes.readUInt32LE(12)>bytes.length-20)throw Error('角色文件不是有效VRM.');
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8')),v1=json.extensions?.VRMC_vrm,bones=humanBones(json);
 if(!bones)throw Error('角色缺少VRM信息.');
 const profile=JSON.parse(await readFile(resolve(root,'configs/skeleton_profile.json'),'utf8'));
 if(profile.bone_order.some(name=>!bones[name]))throw Error('角色需包含完整的人形、眼睛和手指骨骼.');
 return {...profile,vrm_version:v1?'1':'0',bone_nodes:Object.fromEntries(Object.entries(bones).map(([name,bone])=>[name,bone.node]))};
}
