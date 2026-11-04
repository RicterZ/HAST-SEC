import {dialogueSchema,dialoguePrompt,dialogueExamples} from './qwen_dialogue.mjs';
export function qwenRequests(endpoint,contract,remote){
 const {schema,prompt,examples}=contract,prefix=[{role:'system',content:prompt},...examples];
 const chatSystem={role:'system',content:'你是数字人流明, 用简短自然中文回答用户, 不要复读问题. 不编造现实经历. 身体仅支持抬手、移动手臂、摆臂、静止和自然活动. 不支持的动作说明尚未学会, 不假装执行.'};
 async function request(parameters,timeout,signal){
  if(remote)return remote.request(parameters,timeout,signal);
  signal?.throwIfAborted();
  const r=await fetch(endpoint+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_template_kwargs:{enable_thinking:false},cache_prompt:true,seed:13,...parameters}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout)});
  if(!r.ok){const detail=await r.json().catch(()=>({}));throw Error('中文生成接口失败, 状态'+r.status+': '+String(detail.error?.message??detail.error??'未提供原因').slice(0,400));}return r.json();
 }
 // DeepSeek JSON 模式下, 历史中的散文助手回复与 JSON 示例冲突时会只输出空白; 远端请求把历史折叠为最新用户消息中的参考文本.
 const latest=(context,text)=>remote&&context.length?[{role:'user',content:'对话历史(仅用于理解省略和指代, 其中的动作已经处理过):\n'+context.map(m=>(m.role==='assistant'?'流明: ':'用户: ')+m.content).join('\n')+'\n\n最新消息: '+text}]:[...context,{role:'user',content:text}];
 const format={type:'json_schema',json_schema:{name:'motion_intent',strict:true,schema}};
 return {
  plan:(text,context,signal)=>request({id_slot:0,messages:[...prefix,...latest(context,text)],response_format:format,temperature:.1,max_tokens:650},60000,signal),
  chat:(text,context,vary=false,signal)=>request({id_slot:1,messages:[vary?{role:'system',content:dialoguePrompt}:chatSystem,...(vary?dialogueExamples:[]),...(vary?latest(context,text):[...context,{role:'user',content:text}])],...(vary?{response_format:{type:'json_schema',json_schema:{name:'dialogue',strict:true,schema:dialogueSchema}}}:{}),seed:vary?Math.floor(Math.random()*2147483647):13,temperature:vary?.35:.6,max_tokens:vary?260:160},20000,signal),
  // 预热只建立缓存, 丢弃输出, 不经过动作执行入口.
  async warm(signal){if(remote){signal?.throwIfAborted();return;}await request({id_slot:0,messages:prefix,response_format:format,temperature:.1,max_tokens:1},60000,signal);await request({id_slot:1,messages:[chatSystem,{role:'user',content:'你好'}],temperature:.6,max_tokens:1},20000,signal);}
 };
}
