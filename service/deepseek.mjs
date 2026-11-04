// DeepSeek 对话与动作理解: 回复是 assistant 文本, 动作通过工具调用给出, 动作序列按数组顺序依次执行.
// 历史保持 user/assistant 原样; 动作轮次按 API 标准记录为带 tool_calls 的 assistant 消息及其 tool 结果,
// 不用文字描述已执行的动作, 否则模型会模仿文字而不再调用工具.
const ENDPOINT='https://api.deepseek.com/chat/completions';
const SIDES={'左':['left'],'右':['right'],'双':['left','right']};
const MOTIONS={'下放':'向下放低','前伸':'向前移动','后移':'向后移动','左移':'向左移动','右移':'向右移动','摆臂':'摆动手臂','自然活动':'小幅自然活动','挥手':'挥手打招呼'};
const HEIGHTS={'默认':'向上抬高','齐平头部':'向上抬到头部高度','高于头顶':'向上举过头部'};
const CURLS={'握拳':1,'张开':0};
const POSTURES={'静止':{change:true,name:'静止',motion:0,rest:true},'自然活动':{change:true,name:'自然活动',motion:.45,rest:false}};
const KEEP={change:false,name:'保持',motion:0,rest:true};
const EXPRESSIONS=[['angry',/😤|😠|💢/u],['sad',/🫂|💙|😢|😭|🥲/u],['pout',/🥺/u],['shy',/☺️|😳/u],['surprised',/😮|😲|😯/u],['confused',/🤔|😕/u],['heart',/💖|💕|❤️|😍|🥰/u],['star',/🌟|⭐|🎉/u],['happy',/😄|😁|😆|😊/u],['friendly',/👋|✨|🙂/u]];

const action={type:'object',additionalProperties:false,required:['part','side','action'],properties:{
 part:{type:'string',enum:['手臂','腿'],description:'手、手臂、胳膊、拳头属于手臂; 腿、膝盖、脚属于腿.'},
 side:{type:'string',enum:['左','右','双'],description:'角色自身的左右; 双表示两侧同时做.'},
 action:{type:'string',enum:['上抬','下放','前伸','后移','左移','右移','摆臂','挥手','自然活动','保持不动'],description:'腿只支持上抬. 只改手形时用保持不动.'},
 height:{type:'string',enum:['默认','齐平头部','高于头顶'],description:'仅上抬使用.'},
 hand:{type:'string',enum:['默认','握拳','张开'],description:'手形, 未提到用默认.'},
 幅度:{type:'number',minimum:0,maximum:1},
 速度:{type:'number',minimum:.4,maximum:2,description:'正常1, 缓慢0.5, 快速/用力/猛地2.'},
 hold:{type:'number',minimum:0,maximum:20,description:'动作到位后保持的秒数, 默认2; 出拳、踢腿等快速动作用0.3.'},
 同时:{type:'boolean',description:'true 表示与上一项同时开始; 默认 false, 即等上一项结束后再开始.'}
}};
export const TOOLS=[
 {type:'function',function:{name:'perform_actions',description:'让角色执行一个动作序列. actions 按顺序依次执行, 前一项结束后才开始下一项.',parameters:{type:'object',additionalProperties:false,required:['actions'],properties:{actions:{type:'array',minItems:1,maxItems:8,items:action}}}}},
 {type:'function',function:{name:'release',description:'取消当前动作, 把手脚放下.',parameters:{type:'object',additionalProperties:false,properties:{}}}},
 {type:'function',function:{name:'set_posture',description:'切换待机状态: 静止站立或自然活动.',parameters:{type:'object',additionalProperties:false,required:['mode'],properties:{mode:{type:'string',enum:['静止','自然活动']}}}}}
];
export const SYSTEM='你自己叫流明, 是一个桌面数字人, 用户是玩家, 不要把用户称为流明. 用自然中文和玩家交流, 回复直接作为你说的话显示. 每次回复自然使用1至3个emoji表达情绪, 表情须符合语义. 只说你知道的事实, 不编造天气、时间或真实经历. 简短问候一般一句, 用户要求展开时回答三至四句.\n'+
 '身体动作通过工具执行. 只有最新消息要求做动作时才调用工具; 历史中的动作已经执行过, 不要重复. 左右均指角色自身. 能力: 手臂上抬(默认/齐平头部/高于头顶)、下放、前伸、后移、左移、右移、摆臂、挥手、自然活动; 手形握拳或张开; 单腿上抬; 静止站立或自然活动; 放下. '+
 '复合动作用这些能力组合表达, 不要说不会: 出拳=手臂前伸+握拳+速度2+hold 0.3; 踢腿=腿上抬+速度2+hold 0.3; 举拳=上抬+握拳; 欢呼=双侧上抬高于头顶; 打招呼=挥手. 先后进行的动作按顺序放进 actions; 双手一起做用side=双, 不同动作同时开始用同时=true. '+
 '坐下、躺下、跳跃、转身、点头、看着玩家等确实无法组合的动作不要调用工具, 直接说明还没学会; 鼠标移到舞台上时你会自动看向鼠标. 调用工具时可以附一句很短的回复, 也可以不回复.';

function check(value,schema,path='参数'){
 if(schema.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error(path+'不是对象');
  for(const key of schema.required??[])if(!Object.hasOwn(value,key))throw Error(path+'缺少'+key);
  for(const [key,item] of Object.entries(value)){if(!schema.properties[key])throw Error(path+'含未知字段'+key);check(item,schema.properties[key],key);}
 }else if(schema.type==='array'){
  if(!Array.isArray(value)||value.length<(schema.minItems??0)||value.length>(schema.maxItems??Infinity))throw Error(path+'数量无效');
  value.forEach(item=>check(item,schema.items,path));
 }else{
  if(typeof value!==schema.type||(schema.type==='number'&&!Number.isFinite(value)))throw Error(path+'类型无效');
  if(schema.enum&&!schema.enum.includes(value))throw Error(path+'取值无效');
  if(value<schema.minimum||value>schema.maximum)throw Error(path+'超出范围');
 }
}

// 工具调用 -> 动作接口. step 为执行顺序, 具体开始时间由页面按各动作实际时长排列.
export function compileTools(calls){
 const intents=[],hands=[],names=[];let operation='chat',base=KEEP,step=-1;
 for(const call of calls){
  const tool=TOOLS.find(t=>t.function.name===call.function?.name);if(!tool)throw Error('未知工具 '+call.function?.name);
  let args;try{args=JSON.parse(call.function.arguments||'{}');}catch{throw Error(tool.function.name+' 参数不是 JSON');}
  check(args,tool.function.parameters);
  if(tool.function.name==='release'){operation='release';names.push('放下');continue;}
  if(tool.function.name==='set_posture'){if(operation!=='release')operation='command';base=POSTURES[args.mode];names.push(args.mode);continue;}
  if(operation!=='release')operation='command';
  for(const [index,a] of args.actions.entries()){
   const {part,side,action,height='默认',hand='默认',幅度=1,速度=1,hold=2,同时=false}=a;
   if(part==='腿'&&action!=='上抬')throw Error('腿只支持上抬');
   if(part==='腿'&&hand!=='默认')throw Error('腿没有手形');
   if(!同时||index===0&&step<0)step++;
   const motion=part==='腿'?'抬腿':action==='上抬'?HEIGHTS[height]:MOTIONS[action];
   for(const s of SIDES[side]){
    if(action!=='保持不动')intents.push({key:s+'-'+motion,strength:幅度,speed:速度,hold,delay:0,step});
    if(hand in CURLS)hands.push({side:s,curl:CURLS[hand],step,hold,motion:action!=='保持不动'});
   }
   names.push((side==='双'?'双侧':side+'侧')+(hand==='默认'?'':hand)+(action==='保持不动'?'':motion));
  }
 }
 if(intents.length>8)throw Error('动作数量过多');
 return {operation,base,intents,hands,timing:step>0?'依次':'同时',summary:names.join(', ')};
}

// 页面回传的对话历史: user/assistant 文本, 以及动作轮次的 assistant tool_calls + tool 结果.
export function validateContext(context){
 const fail=()=>{throw Error('聊天历史格式无效.');};
 if(!Array.isArray(context)||context.length>12||JSON.stringify(context).length>6000)fail();
 let open=[];
 for(const m of context){
  if(!m||typeof m!=='object'||typeof m.content!=='string'||m.content.length>600)fail();
  if(m.role==='tool'){if(Object.keys(m).some(k=>!['role','content','tool_call_id'].includes(k))||!open.includes(m.tool_call_id))fail();open=open.filter(id=>id!==m.tool_call_id);continue;}
  if(open.length)fail();
  if(m.role==='user'){if(Object.keys(m).some(k=>!['role','content'].includes(k)))fail();continue;}
  if(m.role!=='assistant'||Object.keys(m).some(k=>!['role','content','tool_calls'].includes(k)))fail();
  if(m.tool_calls!==undefined){
   if(!Array.isArray(m.tool_calls)||!m.tool_calls.length||m.tool_calls.length>4)fail();
   for(const c of m.tool_calls){if(!c||Object.keys(c).some(k=>!['id','type','function'].includes(k))||c.type!=='function'||typeof c.id!=='string'||c.id.length>64||!c.function||Object.keys(c.function).some(k=>!['name','arguments'].includes(k))||typeof c.function.arguments!=='string')fail();}
   try{compileTools(m.tool_calls);}catch{fail();}
   open=m.tool_calls.map(c=>c.id);
  }
 }
 if(open.length)fail();
}

export function presentationOf(reply){
 const expression=EXPRESSIONS.find(([,pattern])=>pattern.test(reply))?.[0]??'neutral';
 return {expression,gesture:'none',engagement:reply.length>40?'conversation':'brief'};
}

export function deepseekAgent(classes,{env=process.env,fetch:send=globalThis.fetch}={}){
 const key=env.DEEPSEEK_API_KEY?.trim(),model=env.DEEPSEEK_MODEL?.trim()||'deepseek-flash',known=new Set(classes.map(c=>c.key));
 let busy=false,owner=null,controller=null,settled=null,finish=null;
 const configured=()=>{if(!key)throw Error('需要在服务端设置 DEEPSEEK_API_KEY.');};
 const state=()=>({provider:'deepseek',model,loaded:false,pid:null,ready:!!key,device:null,startup_seconds:0,busy});
 const begin=session=>{if(busy)throw Error('正在处理上一条消息.');configured();busy=true;owner=session;controller=new AbortController();settled=new Promise(resolve=>finish=resolve);return controller.signal;};
 const end=()=>{busy=false;owner=null;controller=null;finish?.();finish=null;settled=null;};
 async function chat(messages,{tools=true,timeout=30000,signal}){
  const requestSignal=AbortSignal.any([signal,AbortSignal.timeout(timeout)]);let response;
  try{response=await send(ENDPOINT,{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:'Bearer '+key},
   body:JSON.stringify({model,messages,...(tools?{tools:TOOLS,tool_choice:'auto'}:{}),thinking:{type:'disabled'},temperature:.4,max_tokens:600}),signal:requestSignal});}
  catch(error){if(signal.aborted)throw signal.reason;if(error.name==='TimeoutError')throw Error('DeepSeek 请求超时, 请重试.');throw Error('无法连接 DeepSeek API, 请检查服务端网络.');}
  if(!response.ok){const hint={401:'请检查 DEEPSEEK_API_KEY',402:'账户余额不足',429:'请求过于频繁, 请稍后重试'}[response.status]??'请稍后重试';throw Error('DeepSeek API 返回 '+response.status+': '+hint+'.');}
  const raw=await response.json(),choice=raw.choices?.[0];
  if(!['stop','tool_calls'].includes(choice?.finish_reason))throw Error('DeepSeek 回复未完整结束, 没有执行动作.');
  return {raw,message:choice.message??{}};
 }
 const tidy=text=>(text??'').trim().replace(/[，。？！：；]/g,c=>({'，':',','。':'.','？':'?','！':'!','：':':','；':';'})[c]);
 return {
  state,
  async warm(){configured();return state();},
  async stop(){},
  async cancel(session){if(busy&&owner!==session)return false;const done=settled;controller?.abort();if(done)await done;return true;},
  async shutdown(){controller?.abort();if(settled)await settled;},
  async plan(text,context=[],session='local-test'){
   const signal=begin(session),started=performance.now();
   try{
    const messages=[{role:'system',content:SYSTEM},...context,{role:'user',content:text}];
    let {raw,message}=await chat(messages,{signal}),result;
    for(let attempt=0;;attempt++){
     const calls=message.tool_calls??[];
     try{result=compileTools(calls);if(result.intents.some(i=>!known.has(i.key)))throw Error('动作不在已学会的动作库中');break;}
     catch(error){
      // 工具参数不合法时把原因作为工具结果交回模型修正一次; 仍不合法则不执行任何动作.
      if(attempt>0)throw Error('DeepSeek 动作参数无效 ('+error.message+'), 没有执行动作.');
      ({raw,message}=await chat([...messages,{role:'assistant',content:message.content??'',tool_calls:calls},...calls.map(c=>({role:'tool',tool_call_id:c.id,content:'未执行: '+error.message+'. 请修正参数后重新调用, 或直接用文字说明做不到.'}))],{signal}));
     }
    }
    const reply=tidy(message.content);
    if(result.operation==='chat'&&!reply)throw Error('DeepSeek 没有给出回复, 请稍后重试.');
    const calls=(message.tool_calls??[]).map(({id,function:{name,arguments:args}})=>({id,type:'function',function:{name,arguments:args}}));
    const memory=calls.length?[{role:'assistant',content:reply,tool_calls:calls},...calls.map(c=>({role:'tool',tool_call_id:c.id,content:'已执行.'}))]:[{role:'assistant',content:reply}];
    return {...result,reply,memory,presentation:presentationOf(reply),seconds:(performance.now()-started)/1000,usage:raw.usage,provider:'deepseek',model,load_seconds:0};
   }finally{end();}
  },
  async proactive(context,session){
   const signal=begin(session),started=performance.now();
   try{
    const {raw,message}=await chat([{role:'system',content:SYSTEM},...context,{role:'user',content:'(玩家暂时没有说话. 请你主动和玩家自然聊一句, 可以问问玩家想聊什么, 不要说将执行什么, 不要声称刚刚发生了某件事.)'}],{tools:false,signal});
    const reply=tidy(message.content);if(!reply)throw Error('DeepSeek 没有给出回复, 请稍后重试.');
    return {reply,memory:[{role:'assistant',content:reply}],operation:'chat',base:KEEP,intents:[],hands:[],timing:'同时',presentation:presentationOf(reply),proactive:true,seconds:(performance.now()-started)/1000,usage:raw.usage};
   }finally{end();}
  }
 };
}
