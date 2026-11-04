import {sha256} from './browser_crypto.mjs';
import {readJson} from './feasible_data.mjs';
export async function skillAssets(bootstrap='/v13-api/bootstrap'){
 const library=await readJson(bootstrap),sources=new Map(),entries=new Map(library.classes.map(c=>[c.key,c]));
 async function load(entry){
  for(const id of new Set(entry.skills.map(s=>s.source))){
   if(sources.has(id))continue;const source=library.sources.find(s=>s.id===id);if(!source)throw Error('技能来源未登记.');
   const response=await fetch('/v13-sources/'+id+'.bin');if(!response.ok)throw Error('技能轨迹读取失败.');const bytes=await response.arrayBuffer();
   const hash=await sha256(bytes);
   if(hash!==source.sha256||bytes.byteLength!==source.frames*53*16)throw Error('技能轨迹校验失败.');
   const values=new Float32Array(bytes);if(values.some(v=>!Number.isFinite(v)))throw Error('技能轨迹包含无效数值.');sources.set(id,values);
  }
 }
 return {library,sources,entries,load};
}
