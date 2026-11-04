// DeepSeek JSON mode does not enforce JSON Schema; check it before compiling motions.
function validate(value,schema){
 if(schema.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('对象无效');
  if(schema.required?.some(key=>!Object.hasOwn(value,key)))throw Error('缺少字段');
  for(const [key,item] of Object.entries(value)){
   if(!schema.properties[key]){if(schema.additionalProperties===false)throw Error('未知字段');}
   else validate(item,schema.properties[key]);
  }
 }else if(schema.type==='array'){
  if(!Array.isArray(value)||(schema.maxItems!==undefined&&value.length>schema.maxItems))throw Error('数组无效');
  value.forEach(item=>validate(item,schema.items));
 }else if(typeof value!==schema.type||(schema.type==='number'&&!Number.isFinite(value)))throw Error('字段类型无效');
 if(schema.enum&&!schema.enum.includes(value))throw Error('字段取值无效');
}

export function deepseek({env=process.env,fetch:send=globalThis.fetch}={}){
 const key=env.DEEPSEEK_API_KEY?.trim(),model=env.DEEPSEEK_MODEL?.trim()||'deepseek-flash';
 let ready=false;
 function configured(){if(!key)throw Error('DeepSeek 模式需要在服务端设置 DEEPSEEK_API_KEY.');}
 return {
  model,
  state:()=>({provider:'deepseek',model,loaded:false,pid:null,ready,device:null,startup_seconds:0}),
  settings:Promise.resolve({idle_seconds:120}),
  async ensure(){configured();ready=true;},
  async stop(){ready=false;},
  async request(parameters,timeout,signal){
   configured();signal?.throwIfAborted();
   const {id_slot,seed,response_format,...body}=parameters;
   const schema=response_format?.json_schema?.schema;
   if(schema){
    body.response_format={type:'json_object'};
    body.messages=[{role:'system',content:'Return valid JSON matching this JSON Schema: '+JSON.stringify(schema)},...body.messages];
   }
   let response;
   try{response=await send('https://api.deepseek.com/chat/completions',{
    method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:'Bearer '+key},
    body:JSON.stringify({...body,model,thinking:{type:'disabled'}}),
    signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout)
   });}catch(error){if(signal?.aborted)throw signal.reason;if(error.name==='TimeoutError')throw Error('DeepSeek 请求超时, 请重试.');throw Error('无法连接 DeepSeek API, 请检查服务端网络.');}
   if(!response.ok){
    const hint={401:'请检查 DEEPSEEK_API_KEY',402:'账户余额不足',429:'请求过于频繁, 请稍后重试'}[response.status]??'请稍后重试';
    throw Error('DeepSeek API 返回 '+response.status+': '+hint+'.');
   }
   const raw=await response.json();
   if(raw.choices?.[0]?.finish_reason!=='stop')throw Error('DeepSeek 回复未完整结束, 没有执行动作.');
   const content=raw.choices?.[0]?.message?.content;
   if(typeof content!=='string'||!content.trim())throw Error('DeepSeek 回复为空.');
   if(schema)try{validate(JSON.parse(content),schema);}catch{throw Error('DeepSeek JSON 输出未通过校验, 没有执行动作.');}
   return raw;
  }
 };
}
