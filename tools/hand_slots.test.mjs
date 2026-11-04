import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSlots} from '../service/qwen_slots.mjs';
const slot=extra=>({side:'右',part:'手臂',action:'前伸',height:'默认',hand:'默认',幅度:1,速度:2,hold:.3,delay:0,...extra});
test('hand shapes compile into timed finger curls without touching arm keys', ()=>{
 const punch=compileSlots({intents:[slot({hand:'握拳'})]},{parts:true});
 assert.equal(punch.intents[0].key,'right-向前移动');assert.equal('hand' in punch.intents[0],false);
 assert.deepEqual(punch.hands,[{side:'right',curl:1,delay:0,duration:.3+1.5/2}]);
 const fist=compileSlots({intents:[slot({action:'保持不动',hand:'握拳',side:'左',hold:2})]},{parts:true});
 assert.deepEqual(fist.intents,[]);assert.deepEqual(fist.hands,[{side:'left',curl:1,delay:0,duration:2}]);
 assert.deepEqual(compileSlots({intents:[slot({part:'腿',action:'上抬',hand:'握拳'})]},{parts:true}).hands,[]);
 assert.deepEqual(compileSlots({intents:[slot()]},{parts:true}).hands,[]);
});
import {qwenRequests} from '../service/qwen_requests.mjs';
test('remote JSON requests fold history into the latest user message', async()=>{
 const sent=[],remote={request:async p=>{sent.push(p.messages);return {};}};
 const requests=qwenRequests('',{schema:{},prompt:'P',examples:[{role:'user',content:'e'},{role:'assistant',content:'{}'}]},remote);
 const context=[{role:'user',content:'讲个故事'},{role:'assistant',content:'从前有盏灯.'}];
 await requests.plan('后来呢',context);await requests.chat('后来呢',context,true);
 for(const messages of sent){const last=messages.at(-1);assert.equal(last.role,'user');assert.match(last.content,/流明: 从前有盏灯[\s\S]*最新消息: 后来呢$/);assert.equal(messages.some(m=>m.content==='从前有盏灯.'),false);}
 const local=[],plain=qwenRequests('http://x',{schema:{},prompt:'P',examples:[]},null);
 globalThis.fetch=async(u,i)=>{local.push(JSON.parse(i.body).messages);return {ok:true,json:async()=>({})};};
 await plain.plan('后来呢',context);assert.deepEqual(local[0].slice(1),[...context,{role:'user',content:'后来呢'}]);
});
