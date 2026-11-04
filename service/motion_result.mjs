export function validateResult(result,classes){
 const valid=new Set(classes.map(c=>c.key)),b=result.base;
 if(!b||typeof b.change!=='boolean'||typeof b.rest!=='boolean'||typeof b.name!=='string'||!b.name.trim()||b.name.length>40||!Number.isFinite(b.motion)||b.motion<0||b.motion>1)throw Error('底座意图无效, 没有执行.');
 if(typeof result.reply!=='string'||result.reply.length>600||!['chat','command','release'].includes(result.operation)||!['同时','依次'].includes(result.timing)||!Array.isArray(result.intents)||result.intents.length>4||result.intents.some(r=>!valid.has(r.key)||!['speed','strength','hold','delay'].every(k=>Number.isFinite(r[k]))||r.speed<.4||r.speed>2||r.strength<0||r.strength>1||r.hold<0||r.hold>20||r.delay<0||r.delay>30))throw Error('语言模型输出未通过动作接口检查, 没有执行.');
 const hands=result.hands??[];
 if(!Array.isArray(hands)||hands.length>2||hands.some(h=>!['left','right'].includes(h.side)||![0,1].includes(h.curl)||!(h.delay>=0&&h.delay<=30)||!(h.duration>=0&&h.duration<=30)))throw Error('手形指令未通过检查, 没有执行.');
 if(result.operation==='command'&&!result.intents.length&&!hands.length&&!b.change)throw Error('中文模型未给出可执行动作, 没有执行.');
 if(result.operation!=='command'&&(result.intents.length||hands.length))throw Error('普通聊天或取消不能包含动作.');
}
