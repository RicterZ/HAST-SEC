import test from 'node:test';
import assert from 'node:assert/strict';
import {deepseekAgent,compileTools,presentationOf,validateContext} from '../service/deepseek.mjs';
import {validateResult} from '../service/motion_result.mjs';
const keys=['right-向前移动','left-向前移动','right-抬腿','left-抬腿','right-向上举过头部','left-向上举过头部','right-挥手打招呼','left-挥手打招呼'];
const classes=keys.map(key=>({key}));
const call=(name,args,id='c'+Math.random())=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const response=(message,finish=message.tool_calls?'tool_calls':'stop')=>({ok:true,status:200,json:async()=>({choices:[{finish_reason:finish,message:{role:'assistant',content:'',...message}}],usage:{}})});
function fixture(replies,env={DEEPSEEK_API_KEY:'sk-test'}){
 const calls=[];
 const fetch=async(url,init)=>{calls.push({url,body:JSON.parse(init.body),signal:init.signal});const next=replies.shift();if(typeof next==='function')return next(init);return next;};
 return {model:deepseekAgent(classes,{env,fetch}),calls};
}
test('chat replies are assistant text and history keeps the user/assistant layout',async()=>{
 const {model,calls}=fixture([response({content:'你好呀! 😊'})]);
 const context=[{role:'user',content:'讲个故事'},{role:'assistant',content:'从前有盏灯.'}];
 const result=await model.plan('后来呢',context);validateResult(result,classes);
 assert.equal(result.operation,'chat');assert.equal(result.reply,'你好呀! 😊');assert.equal(result.presentation.expression,'happy');
 const {messages,tools,thinking}=calls[0].body;
 assert.equal(messages[0].role,'system');assert.deepEqual(messages.slice(1),[...context,{role:'user',content:'后来呢'}]);
 assert.deepEqual(tools.map(t=>t.function.name),['perform_actions','release','set_posture']);assert.deepEqual(thinking,{type:'disabled'});
 assert.equal(calls[0].body.response_format,undefined);
});
test('tool call sequences compile into ordered steps with hand shapes',async()=>{
 const actions=[{part:'手臂',side:'左',action:'前伸',hand:'握拳',速度:2,hold:.3},{part:'手臂',side:'右',action:'前伸',hand:'握拳',速度:2,hold:.3},{part:'腿',side:'右',action:'上抬',速度:2,hold:.3,同时:true},{part:'手臂',side:'双',action:'上抬',height:'高于头顶'}];
 const {model}=fixture([response({tool_calls:[call('perform_actions',{actions})]})]);
 const result=await model.plan('左拳右拳同时踢腿然后欢呼',[]);validateResult(result,classes);
 assert.equal(result.operation,'command');assert.equal(result.timing,'依次');assert.equal(result.reply,'');
 assert.deepEqual(result.intents.map(i=>[i.key,i.step,i.speed]),[['left-向前移动',0,2],['right-向前移动',1,2],['right-抬腿',1,2],['left-向上举过头部',2,1],['right-向上举过头部',2,1]]);
 assert.deepEqual(result.hands,[{side:'left',curl:1,step:0,hold:.3,motion:true},{side:'right',curl:1,step:1,hold:.3,motion:true}]);
 assert.equal(result.summary,'左侧握拳向前移动, 右侧握拳向前移动, 右侧抬腿, 双侧向上举过头部');
 const [assistant,tool]=result.memory;assert.equal(assistant.role,'assistant');assert.equal(assistant.tool_calls[0].function.name,'perform_actions');
 assert.deepEqual(tool,{role:'tool',tool_call_id:assistant.tool_calls[0].id,content:'已执行.'});
 validateContext([{role:'user',content:'x'},...result.memory]);
});
test('hand-only, release and posture tools',()=>{
 const fist=compileTools([call('perform_actions',{actions:[{part:'手臂',side:'双',action:'保持不动',hand:'握拳'}]})]);
 assert.deepEqual(fist.intents,[]);assert.equal(fist.hands.length,2);assert.equal(fist.operation,'command');
 assert.equal(compileTools([call('release',{})]).operation,'release');
 const still=compileTools([call('set_posture',{mode:'静止'})]);assert.equal(still.base.rest,true);assert.equal(still.operation,'command');
 assert.equal(compileTools([]).operation,'chat');
 assert.equal(presentationOf('讲一个很长的故事'.repeat(8)).engagement,'conversation');
});
test('invalid tool arguments are returned to the model once, then rejected',async()=>{
 const bad=call('perform_actions',{actions:[{part:'腿',side:'右',action:'前伸'}]},'bad');
 const good=call('perform_actions',{actions:[{part:'腿',side:'右',action:'上抬'}]});
 let {model,calls}=fixture([response({tool_calls:[bad]}),response({content:'好的! ✨',tool_calls:[good]})]);
 const result=await model.plan('踢一下',[]);assert.deepEqual(result.intents.map(i=>i.key),['right-抬腿']);assert.equal(result.reply,'好的! ✨');
 const retry=calls[1].body.messages;assert.equal(retry.at(-2).tool_calls[0].id,'bad');assert.equal(retry.at(-1).role,'tool');assert.match(retry.at(-1).content,/腿只支持上抬/);
 ({model}=fixture([response({tool_calls:[bad]}),response({tool_calls:[bad]})]));
 await assert.rejects(model.plan('踢一下',[]),/动作参数无效/);
 ({model}=fixture([response({tool_calls:[call('perform_actions',{actions:[{part:'手臂',side:'右',action:'摆臂'}]})]}),response({tool_calls:[call('perform_actions',{actions:[{part:'手臂',side:'右',action:'摆臂',extra:1}]})]})]));
 await assert.rejects(model.plan('摆臂',[]),/动作参数无效/);
});
test('empty chat, truncation and upstream errors stay actionable without echoing secrets',async()=>{
 let {model}=fixture([response({content:'   '})]);await assert.rejects(model.plan('你好',[]),/没有给出回复/);
 ({model}=fixture([response({content:'{"reply"'},'length')]));await assert.rejects(model.plan('你好',[]),/未完整结束/);
 ({model}=fixture([{ok:false,status:401,json:async()=>({})}]));await assert.rejects(model.plan('你好',[]),e=>/401/.test(e.message)&&!e.message.includes('sk-test'));
 ({model}=fixture([],{}));await assert.rejects(model.warm('s'),/DEEPSEEK_API_KEY/);
});
test('proactive chat sends no tools and cancellation releases the busy state',async()=>{
 let {model,calls}=fixture([response({content:'想聊点什么呀? 🙂'})]);
 const proactive=await model.proactive([],'s');validateResult(proactive,classes);assert.equal(calls[0].body.tools,undefined);assert.equal(proactive.proactive,true);
 ({model}=fixture([init=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason)))]));
 const pending=model.plan('你好',[],'s');await new Promise(r=>setTimeout(r,5));
 assert.equal(model.state().busy,true);assert.equal(await model.cancel('s'),true);await assert.rejects(pending);assert.equal(model.state().busy,false);
});
test('context accepts user/assistant text and complete tool turns only',()=>{
 const c=call('release',{},'r1'),turn=[{role:'user',content:'放下'},{role:'assistant',content:'',tool_calls:[c]},{role:'tool',tool_call_id:'r1',content:'已执行.'}];
 validateContext(turn);validateContext([{role:'user',content:'你好'},{role:'assistant',content:'你好呀'}]);
 for(const bad of [turn.slice(0,2),[turn[2]],[{role:'system',content:'x'}],[{role:'assistant',content:'',tool_calls:[call('rm_rf',{},'x')]},{role:'tool',tool_call_id:'x',content:''}],[{role:'user',content:'x',extra:1}],[{role:'user',content:'x'.repeat(601)}]])
  assert.throws(()=>validateContext(bad),/聊天历史格式无效/);
});
