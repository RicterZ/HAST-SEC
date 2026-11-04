import {humanBones} from '../service/avatar_profile.mjs';
import {copyFile,mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {basename,extname,resolve} from 'node:path';
import {bindProfile,convertModel,loadModelProfile} from './model_convert.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2);
const flag=args.indexOf('--profile'),profilePath=flag>=0?args[flag+1]:null;
if(flag>=0&&!profilePath)throw Error('--profile 后需指定 profile 文件.');
const path=args.filter((_,i)=>flag<0||(i!==flag&&i!==flag+1))[0],output=resolve(root,'assets/avatar.vrm');
if(!path||!(await stat(path)).isFile()||(await stat(path)).size>100*1024**2)throw Error('请指定100MB以内的VRM角色文件, 或带 --profile 的骨骼模型 GLB.');
let bytes=await readFile(path);if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(12)>bytes.length-20)throw Error('角色格式无效.');
const profile=JSON.parse(await readFile(resolve(root,'configs/skeleton_profile.json'),'utf8'));
let json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
if(profilePath){
  const modelProfile=await loadModelProfile(profilePath),isVrm=Boolean(json.extensions?.VRMC_vrm||json.extensions?.VRM);
  if(isVrm)bytes=bindProfile(bytes,modelProfile);
  else{const result=await convertModel(bytes,modelProfile,{modelName:basename(path,extname(path)),requiredBones:profile.bone_order});bytes=result.bytes;console.log(JSON.stringify(result.report));}
  json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
}
const bones=humanBones(json);
if(!bones)throw Error('文件不包含VRM信息; 其他骨骼模型请用 --profile 指定适配 profile.');
if(profile.bone_order.some(name=>!bones[name]))throw Error('角色骨骼不完整, 需包含人形、眼睛和手指骨骼.');
await mkdir(resolve(root,'assets'),{recursive:true});
if(profilePath)await writeFile(output,bytes);else await copyFile(path,output);
console.log('角色已导入本机, 不会加入发布清单. 请遵守角色原始许可.');
