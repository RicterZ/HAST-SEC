import {randomUUID} from './browser_crypto.mjs';
import {motionName} from './v13_panels.mjs';
const $=id=>document.getElementById(id);
export function commandLoop({assets,policy,history,behavior,layers,hands,pose,play,speech,prepare,generation,dialogue}){
 const session=randomUUID();
 const sendLabel=$('send').textContent;
 let pending=null,revision=0,context=[],turns=[],lastPlan=null,selections=[],self=false,queue=[];
 // 历史按轮保存, 保证 tool_calls 与对应的 tool 结果一起保留或丢弃.
 function remember(messages){turns=[...turns,messages].slice(-2);while(turns.length>1&&JSON.stringify(turns).length>5000)turns=turns.slice(1);context=turns.flat();}
 function cancel(){revision++;pending?.abort();pending=null;self=false;for(const item of queue)item.resolve();queue=[];dialogue?.pending(false);$('send').disabled=false;$('send').textContent=sendLabel;}
 async function proactive(){
  if(pending)return;const ticket=++revision;pending=new AbortController();self=true;dialogue.pending(true,true);
  try{await prepare();if(ticket!==revision)return;const response=await fetch('/v15-api/proactive',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({context,session}),signal:pending.signal}),plan=await response.json();if(ticket!==revision)return;if(!response.ok)throw Error(plan.error);lastPlan=plan;remember(plan.memory);await dialogue.receive(plan,()=>ticket===revision);if(ticket!==revision)return;if($('speak').checked)void speech.speak(plan.reply);}catch(e){if(ticket===revision&&e.name!=='AbortError')$('status').textContent=e.message;}finally{if(ticket===revision){pending=null;self=false;dialogue.pending(false);}}
 }
 async function send(text=$('text').value){
  if(!text.trim())return;
  if(pending&&!self){if(queue.length>=6){$('status').textContent='等待消息已满, 请稍后再发送.';return;}return new Promise(resolve=>{queue.push({text,resolve});$('status').textContent='已排队 '+queue.length+' 条消息, 当前动作继续.';});}
  const interrupted=self;if(interrupted)cancel();const ticket=++revision;pending=new AbortController();dialogue?.pending(true);$('send').disabled=false;$('send').textContent=sendLabel;$('status').textContent='正在理解你的消息...';
  try{if(interrupted){const r=await fetch('/v13-api/interrupt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session}),signal:pending.signal});if(!r.ok)throw Error('自主聊天取消失败.');}if(ticket!==revision)return;await prepare();if(ticket!==revision)return;const response=await fetch('/v13-api/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,context,session,...(generation==='v15'?{generation}:{})}),signal:pending.signal}),plan=await response.json();if(ticket!==revision)return;if(!response.ok)throw Error(plan.error);
   for(const i of plan.intents)await assets.load(assets.entries.get(i.key));if(ticket!==revision)return;
   if(plan.operation==='release'){layers.clear();hands?.clear();}selections=[];
   // 动作序列: 每一步在上一步所有轨道结束后开始, 时长取所选动作片段的实际长度.
   const steps=Math.max(0,...plan.intents.map(i=>i.step??0),...(plan.hands??[]).map(h=>h.step))+1,starts=[],ends=[];
   for(let step=0;step<steps;step++){
    const start=starts[step]=step?ends[step-1]:0;ends[step]=start;
    for(const intent of plan.intents.filter(i=>(i.step??0)===step)){const entry=assets.entries.get(intent.key);if(entry.side==='body'){layers.clear();continue;}
     const selected=policy.select(entry,history()),options={...intent,...selected.options,delay:(intent.delay??0)+start};selections.push(selected.report);layers.add(selected.entry,options,pose());
     ends[step]=Math.max(ends[step],options.delay+selected.entry.skills[0].duration*(options.cycles??1)/(options.speed??1)+(options.hold??2));
    }
    for(const hand of (plan.hands??[]).filter(h=>h.step===step))ends[step]=Math.max(ends[step],start+(hand.motion?0:hand.hold));
   }
   for(const hand of plan.hands??[])hands?.add({side:hand.side,curl:hand.curl,delay:starts[hand.step],duration:hand.motion?ends[hand.step]-starts[hand.step]:hand.hold});
   behavior.lock(layers.active());behavior.apply(plan.base);lastPlan=plan;
   remember([{role:'user',content:text},...plan.memory]);
   $('reply').textContent=plan.reply;$('intent').textContent=selections.map(s=>motionName(s.key)+' / 学习码'+s.code+' / 类内概率'+s.probability.toFixed(3)).join('\n');
   if(dialogue){await dialogue.receive({...plan,input_text:text},()=>ticket===revision,selections);if(ticket!==revision)return;}
   $('status').textContent='中文理解 '+plan.seconds.toFixed(2)+'秒';if(plan.operation!=='chat'||(dialogue&&plan.supported!==false))play();
   if($('speak').checked&&plan.reply.trim())void speech.speak(plan.reply);
  }catch(e){if(ticket===revision&&e.name!=='AbortError')$('status').textContent=e.message;}finally{if(ticket===revision){pending=null;dialogue?.pending(false);$('send').disabled=false;$('send').textContent=sendLabel;const next=queue.shift();if(next)void send(next.text).finally(next.resolve);}}
 }
 return {session,send,proactive,cancel,state:()=>({lastPlan,selections}),reset(){cancel();context=[];turns=[];lastPlan=null;selections=[];}};
}
