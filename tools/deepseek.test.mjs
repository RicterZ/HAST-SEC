import test from 'node:test';
import assert from 'node:assert/strict';
import {qwenIntent} from '../service/qwen_intent.mjs';
import {validateResult} from '../service/motion_result.mjs';
const env={HAST_LLM_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'test-secret'};
const base={change:false,name:'保持',motion:0,rest:true};
const command={reply:'好的',operation:'command',base,intents:[{side:'右',part:'手臂',action:'上抬',height:'默认',幅度:1,速度:1,hold:2,delay:0}]};
const dialogue={reply:'你好呀',expression:'happy',gesture:'none',engagement:'brief'};
const response=(value,finish_reason='stop')=>Response.json({choices:[{finish_reason,message:{content:typeof value==='string'?value:JSON.stringify(value)}}],usage:{total_tokens:42}});
function fixture(replies,extra={}){
 const calls=[];
 const model=qwenIntent('/no-local-model-or-config',[],{env,...extra,fetch:async(url,options)=>{calls.push({url,...options,body:JSON.parse(options.body)});return replies.shift();}});
 return {model,calls};
}
test('DeepSeek warms without a paid request, compiles a command and reports its provider',async()=>{
 const {model,calls}=fixture([response(command)]);
 try{
  const state=await model.warm('test');assert.equal(state.provider,'deepseek');assert.equal(state.ready,true);assert.equal(state.pid,null);assert.equal(calls.length,0);
  const result=await model.plan('举起右手',[],'test','v15');
  validateResult(result,[{key:'right-向上抬高'}]);assert.equal(result.model,'deepseek-flash');assert.equal(result.usage.total_tokens,42);
  assert.equal(calls[0].url,'https://api.deepseek.com/chat/completions');assert.equal(calls[0].redirect,'error');
  assert.equal(calls[0].headers.authorization,'Bearer test-secret');assert.equal(calls[0].body.model,'deepseek-flash');
  assert.deepEqual(calls[0].body.response_format,{type:'json_object'});
  assert.deepEqual(calls[0].body.thinking,{type:'disabled'});
  for(const key of ['id_slot','seed','cache_prompt','chat_template_kwargs'])assert.equal(key in calls[0].body,false);
  assert.match(calls[0].body.messages[0].content,/JSON Schema/);assert.ok(!JSON.stringify(state).includes('test-secret'));
 }finally{await model.shutdown();}
});
test('DeepSeek chat and proactive chat retain dialogue presentation and context',async()=>{
 const {model,calls}=fixture([response({...command,operation:'chat',intents:[]}),response(dialogue),response(dialogue)],{env:{...env,DEEPSEEK_MODEL:'deepseek-flash'}});
 const context=[{role:'user',content:'我叫小明'}];
 try{
  const result=await model.plan('你好',context,'test','v15');validateResult(result,[]);assert.equal(result.presentation.expression,'happy');
  assert.ok(calls[1].body.messages.some(m=>m.content==='我叫小明'));
  const proactive=await model.proactive(context,'test');validateResult(proactive,[]);assert.equal(proactive.proactive,true);
 }finally{await model.shutdown();}
});
test('DeepSeek rejects invalid JSON, schema violations, truncated output and unsafe motions',async()=>{
 for(const raw of [response('broken'),response({...command,base:null}),response({...command,intents:[{...command.intents[0],side:'别的'}]}),response(command,'length')]){
  const {model}=fixture([raw]);try{await assert.rejects(model.plan('抬手',[],'test','v15'),/校验|完整/);}finally{await model.shutdown();}
 }
 const {model}=fixture([response({...command,intents:[{...command.intents[0],速度:999}]})]);
 try{const result=await model.plan('抬手',[],'test','v15');assert.throws(()=>validateResult(result,[{key:'right-向上抬高'}]),/检查/);}finally{await model.shutdown();}
});
test('DeepSeek configuration and upstream errors stay actionable without echoing secrets',async()=>{
 const missing=qwenIntent('/missing',[],{env:{HAST_LLM_PROVIDER:'deepseek'}});
 try{await assert.rejects(missing.warm('test'),/DEEPSEEK_API_KEY/);}finally{await missing.shutdown();}
 for(const status of [401,402,429,500]){
  const {model}=fixture([Response.json({error:{message:'test-secret'}},{status})]);
  try{await assert.rejects(model.plan('你好'),error=>error.message.includes(String(status))&&!error.message.includes('test-secret'));}finally{await model.shutdown();}
 }
 assert.throws(()=>qwenIntent('/missing',[],{env:{HAST_LLM_PROVIDER:'typo'}}),/HAST_LLM_PROVIDER/);
});
test('DeepSeek cancellation aborts the request and releases the busy state',async()=>{
 let started;const waiting=new Promise(resolve=>started=resolve);
 const model=qwenIntent('/missing',[],{env,fetch:async(url,{signal})=>{started();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
 try{
  const result=model.plan('你好',[],'owner','v15');const rejected=assert.rejects(result,{name:'AbortError'});await waiting;
  assert.equal(await model.cancel('another',true),false);assert.equal(model.state().busy,true);
  await model.cancel('owner',true);await rejected;assert.equal(model.state().busy,false);assert.equal(model.state().ready,false);
 }finally{await model.shutdown();}
});
