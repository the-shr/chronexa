import {createReadCache} from './read-cache.js';
const reads=createReadCache();
let generation=0;let sequence=0;const pending=new Map();
window.__chronexaResult=(id,ok,value)=>{const call=pending.get(id);if(!call)return;pending.delete(id);clearTimeout(call.timeout);if(call.generation!==generation){call.reject(new Error('Account changed. Please retry.'));return;}if(ok){try{call.resolve(JSON.parse(value));}catch{call.resolve(value);}}else call.reject(new Error(value));};
export function native(method,payload={}){if(method==='login'||method==='logout'){generation++;reads.clear();}return new Promise((resolve,reject)=>{if(!window.ChronexaNative){reject(new Error('Open this screen in the Chronexa Android app.'));return;}const id=String(++sequence);const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('Request timed out. Please try again.'));},method==='start'?180000:60000);pending.set(id,{resolve,reject,timeout,generation});window.ChronexaNative.send(id,method,JSON.stringify(payload));});}
export function request(path,method='GET',body){
 if(method!=='GET'){reads.clear();return native('request',{path,method,body}).finally(()=>reads.clear());}
 return reads.read(path,()=>native('request',{path,method,body}));
}
const media=path=>Promise.resolve(`https://appassets.androidplatform.net/media${path}`);
window.api={
 admin:{employees:period=>request(`/api/agent/admin/employees?period=${period==='week'?'week':'month'}`),employee:(id,month)=>request(`/api/agent/admin/employees/${encodeURIComponent(id)}${month?`?month=${encodeURIComponent(month)}`:''}`),avatar:id=>media(`/api/agent/admin/employees/${encodeURIComponent(id)}/avatar`),screenshots:params=>request(`/api/agent/admin/screenshots?${new URLSearchParams(params)}`),recordings:params=>request(`/api/agent/admin/recordings?${new URLSearchParams(params)}`),image:id=>media(`/api/image/${encodeURIComponent(id)}`),clip:id=>media(`/api/recording/${encodeURIComponent(id)}`)},
 configuration:{get:()=>request('/api/agent/admin/policy'),update:patch=>request('/api/agent/admin/policy','PATCH',patch)}
};
