export function bodyContract(contract){
 const {schema,prompt:basePrompt,examples}=structuredClone(contract),intent=schema.properties.intents.items;
 const prompt=basePrompt+' 对话历史中的动作已经处理过, 仅用于理解省略和指代. 最新消息明确指定侧别和部位时, 只输出这次指定的动作, 不重复历史动作. 只有最新消息明确要求双侧时才输出双侧.';
 intent.properties.part={type:'string',enum:['手臂','腿']};intent.properties.hand={type:'string',enum:['默认','握拳','张开']};intent.required.push('part','hand');intent.properties.action.enum.push('挥手');
 for(const message of examples)if(message.role==='assistant'){const plan=JSON.parse(message.content);plan.intents.forEach(i=>{i.part='手臂';i.hand='默认';});message.content=JSON.stringify(plan);}
 const move=(side,part,action,extra={})=>({side,part,action,height:'默认',hand:'默认',幅度:1,速度:1,hold:2,delay:0,...extra});
 for(const text of ['你今天怎么样','讲一段小故事','你喜欢什么','我们聊聊吧'])examples.push({role:'user',content:text},{role:'assistant',content:JSON.stringify({reply:'好的.',operation:'chat',base:{change:false,name:'保持',motion:0,rest:true},intents:[]})});
 for(const [text,side,part,action]of [['抬右腿','右','腿','上抬'],['把左脚抬起来','左','腿','上抬'],['举起右手','右','手臂','上抬'],['左手在身前挥手打招呼','左','手臂','挥手'],['挥舞右手','右','手臂','挥手'],['挥挥左手','左','手臂','挥手']])examples.push({role:'user',content:text},{role:'assistant',content:JSON.stringify({reply:'好的.',operation:'command',base:{change:false,name:'保持',motion:0,rest:true},intents:[move(side,part,action)]})});
 for(const side of ['左','右']){const other=side==='左'?'右':'左';for(const current of [side,other])examples.push({role:'user',content:'抬起'+current+'腿'},{role:'assistant',content:JSON.stringify({reply:'好的.',operation:'command',base:{change:false,name:'保持',motion:0,rest:true},intents:[move(current,'腿','上抬')]})});}
 // 组合动作: 用已有动作加手形与速度表达, 不因为没有专门动作就拒绝.
 const command=intents=>JSON.stringify({reply:'好的.',operation:'command',base:{change:false,name:'保持',motion:0,rest:true},intents});
 for(const [text,intents]of [
  ['握拳',[move('右','手臂','保持不动',{hand:'握拳'})]],
  ['双手握拳',[move('左','手臂','保持不动',{hand:'握拳'}),move('右','手臂','保持不动',{hand:'握拳'})]],
  ['张开右手',[move('右','手臂','保持不动',{hand:'张开'})]],
  ['出拳',[move('右','手臂','前伸',{hand:'握拳',速度:2,hold:.3})]],
  ['左手打一拳',[move('左','手臂','前伸',{hand:'握拳',速度:2,hold:.3})]],
  ['左右连续出拳',[move('左','手臂','前伸',{hand:'握拳',速度:2,hold:.3}),move('右','手臂','前伸',{hand:'握拳',速度:2,hold:.3,delay:.6})]],
  ['举起拳头',[move('右','手臂','上抬',{hand:'握拳',height:'高于头顶'})]],
  ['踢腿',[move('右','腿','上抬',{速度:2,hold:.3})]],
 ])examples.push({role:'user',content:text},{role:'assistant',content:command(intents)});
 return {schema,examples,prompt:prompt.replace('能力仅限手臂方向移动, 举高, 放低, 摆臂, 静止和自然活动.','能力包括手臂方向移动, 举高, 放低, 摆臂, 挥手打招呼, 单腿抬起, 静止和自然活动. 腿暂只支持上抬, 不把其他腿动作替换为手臂. ')+' 每个动作必须预测part. 手、手臂、胳膊属于手臂, 腿、膝盖、脚属于腿. 严禁把抬腿变成抬手. 挥手、挥挥手、挥舞手打招呼用挥手, 普通胳膊来回摆用摆臂. hand表示手形: 握拳/拳头用握拳, 张开手掌用张开, 未提到手形用默认; 只改手形时action用保持不动. 速度0.4到2, 快速/用力/猛地用2, 缓慢用0.5. 复合动作用已有动作组合表达, 不要回答不支持: 出拳=手臂前伸+握拳+速度2+hold 0.3, 踢腿=腿上抬+速度2+hold 0.3. 普通问候或聊天operation=chat, intents为空, 正常回复一句中文, 不能假装执行手臂动作.'};
}
