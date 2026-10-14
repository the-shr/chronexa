'use strict';
const COMPONENTS = ['app','policy','screenshots','recording','sync','screenshotUpload','recordingUpload','report'];
let metrics={}, store=null, runtime=null, timer=null, running=false, owner=null, policyFingerprint=null;
function code(error) {
  const text=String(error?.message || error || '').toLowerCase();
  if (/renderer crashed/.test(text)) return 'RENDERER_CRASHED';
  if (/401|session.*expired|not signed in/.test(text)) return 'SIGNED_OUT';
  if (/426|update chronexa/.test(text)) return 'UPDATE_REQUIRED';
  if (/501|not configured/.test(text)) return 'SERVER_NOT_CONFIGURED';
  if (/413/.test(text)) return 'FILE_TOO_LARGE';
  if (/429/.test(text)) return 'RATE_LIMITED';
  if (/retry limit/.test(text)) return 'RETRY_LIMIT';
  if (/enospc|disk.*full/.test(text)) return 'DISK_FULL';
  if (/eacces|eperm|permission|denied/.test(text)) return 'PERMISSION_DENIED';
  if (/ffmpeg|encoder|codec/.test(text)) return 'ENCODER_FAILED';
  if (/no capture sources/.test(text)) return 'CAPTURE_UNAVAILABLE';
  if (/enoent|missing|not found/.test(text)) return 'FILE_MISSING';
  if (/fetch|network|timeout|econn|enotfound|abort/.test(text)) return 'NETWORK_FAILED';
  if (/http|\b5\d\d\b|\b4\d\d\b/.test(text)) return 'SERVER_REJECTED';
  return 'FAILED';
}
function persist(){try{store?.write({owner,metrics,policyFingerprint});}catch{/* Diagnostics must never interrupt tracking. */}}
function record(component,ok,error){
  if(!COMPONENTS.includes(component))return;
  const previous=metrics[component]||{failures:0,lastSuccess:null,lastFailure:null,code:null};
  metrics[component]={...previous,...(ok?{lastSuccess:new Date().toISOString()}:{lastFailure:new Date().toISOString(),failures:Math.min(1000000,previous.failures+1),code:code(error)})};persist();
}
// Logs are classified locally. Raw messages, file paths, IDs and task content never leave the PC.
function observeLog(level,args){
  const prefix=String(args[0]||'');
  if(prefix==='policy: applied version'){policyFingerprint=require('node:crypto').createHash('sha256').update(String(args[1]||'')).digest('hex');record('policy',true);}
  else if(prefix.startsWith('policy: could not refresh'))record('policy',false,args[1]);
  else if(prefix==='recording: captured')record('recording',true);
  else if(prefix.startsWith('recording: failed'))record('recording',false,args[1]);
  else if(prefix==='tracker: capture failed')record('screenshots',false,args[1]);
  else if(prefix==='sync: screenshot uploaded')record('screenshotUpload',true);
  else if(prefix==='sync: recording uploaded')record('recordingUpload',true);
  else if(prefix==='sync: media file missing')record(args[1]==='recording'?'recordingUpload':'screenshotUpload',false,'File missing');
  else if(prefix==='sync: giving up on'){const item=String(args[1]||'');record(item.startsWith('recording:')?'recordingUpload':'screenshotUpload',false,'Retry limit');}
  else if(prefix.startsWith('sync: recordings are not configured'))record('recordingUpload',false,'501');
  else if(prefix==='sync: item failed'){
    const item=String(args[1]||'');record(item.startsWith('screenshot:')?'screenshotUpload':item.startsWith('recording:')?'recordingUpload':'sync',false,args[2]);
  }else if(prefix==='sync: run failed')record('sync',false,args[1]);
  void level;
}
function resetForAccount(){const key=runtime?.auth.get()?.user?.id||null;if(key!==owner){owner=key;metrics={};policyFingerprint=null;persist();}}
function snapshot(){
  const cfg=runtime.settings.get(), tracking=runtime.tracker.snapshot();
  const queue=runtime.db.peekOutbox(100000);
  const pending={sessions:0,screenshots:0,recordings:0,other:0};
  for(const item of queue){const key={session:'sessions',screenshot:'screenshots',recording:'recordings'}[item.type]||'other';pending[key]++;}
  return {schemaVersion:1,appVersion:runtime.app.getVersion(),policyFingerprint,os:process.platform,osRelease:require('node:os').release(),reportedAt:new Date().toISOString(),tracking:tracking.state,idlePhase:tracking.idlePhase,syncEnabled:Boolean(cfg.sync.enabled),pending,
    capture:{screenshots:Boolean(cfg.screenshots.enabled),screenshotMinutes:cfg.screenshots.intervalMinutes,recording:Boolean(cfg.recording.enabled),recordingMode:cfg.recording.mode,recordingMinutes:cfg.recording.intervalMinutes},components:structuredClone(metrics)};
}
async function report(){
  if(!runtime||running||!runtime.auth.isSignedIn())return;
  resetForAccount();running=true;
  try{
    const response=await fetch(runtime.settings.get().sync.serverUrl+'/api/agent/diagnostics',{method:'POST',headers:{'content-type':'application/json',...runtime.auth.authHeaders()},body:JSON.stringify(snapshot()),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('HTTP '+response.status);
    record('report',true);
  }catch(error){record('report',false,error);}finally{running=false;}
}
function start(dependencies){
  runtime=dependencies;
  const {JsonStore}=require('./jsonstore');store=new JsonStore(require('node:path').join(dependencies.app.getPath('userData'),'diagnostics.json'),{owner:null,metrics:{}});
  const flush=store.flush.bind(store);store.flush=()=>{try{flush();}catch{/* A full disk must not make diagnostics crash the tracker. */}};
  const saved=store.read();owner=saved.owner;metrics=saved.metrics||{};policyFingerprint=saved.policyFingerprint||null;resetForAccount();
  runtime.auth.on('changed',()=>{resetForAccount();report().catch(()=>{});});
  runtime.tracker.on('screenshot',rows=>record('screenshots',rows.length>0,'No capture sources'));
  clearInterval(timer);timer=setInterval(()=>report().catch(()=>{}),60000);report().catch(()=>{});
}
function stop(){clearInterval(timer);timer=null;try{store?.flush();}catch{}}
module.exports={start,stop,record,observeLog,report,snapshot,code};
