const COMPONENTS=['app','policy','screenshots','recording','sync','screenshotUpload','recordingUpload','report'];
const CODES=['SIGNED_OUT','UPDATE_REQUIRED','SERVER_NOT_CONFIGURED','FILE_TOO_LARGE','RATE_LIMITED','RETRY_LIMIT','DISK_FULL','PERMISSION_DENIED','ENCODER_FAILED','CAPTURE_UNAVAILABLE','FILE_MISSING','NETWORK_FAILED','SERVER_REJECTED','RENDERER_CRASHED','FAILED'];
const iso=value=>typeof value==='string' && value.length<40 && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString():null;
const integer=(value,max=100000)=>Number.isInteger(value)&&value>=0?Math.min(max,value):0;
export function sanitizeDiagnostics(body){
  if(!body||body.schemaVersion!==1||typeof body.appVersion!=='string'||!/^\d+\.\d+\.\d+$/.test(body.appVersion)||body.appVersion.length>25)return null;
  const capture=body.capture||{},components={};
  for(const key of COMPONENTS){const row=body.components?.[key];if(!row)continue;components[key]={lastSuccess:iso(row.lastSuccess),lastFailure:iso(row.lastFailure),failures:integer(row.failures,1000000),code:CODES.includes(row.code)?row.code:null};}
  const policyFingerprint=typeof body.policyFingerprint==='string'&&/^[a-f0-9]{64}$/.test(body.policyFingerprint)?body.policyFingerprint:null;
  return {schemaVersion:1,appVersion:body.appVersion,policyFingerprint,os:['win32','darwin','linux','android'].includes(body.os)?body.os:'unknown',osRelease:typeof body.osRelease==='string'&&/^[a-zA-Z0-9._-]{1,80}$/.test(body.osRelease)?body.osRelease:null,reportedAt:iso(body.reportedAt),tracking:['running','paused','stopped'].includes(body.tracking)?body.tracking:'unknown',idlePhase:['active','warning','idle'].includes(body.idlePhase)?body.idlePhase:'unknown',syncEnabled:body.syncEnabled===true,pending:Object.fromEntries(['sessions','screenshots','recordings','other'].map(key=>[key,integer(body.pending?.[key])])),capture:{screenshots:capture.screenshots===true,screenshotMinutes:integer(capture.screenshotMinutes,120),recording:capture.recording===true,recordingMode:['interval','session'].includes(capture.recordingMode)?capture.recordingMode:null,recordingMinutes:integer(capture.recordingMinutes,240)},components};
}
