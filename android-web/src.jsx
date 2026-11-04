import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {native,request} from './bridge.js';
import Employees from '../desktop/src/pages/admin/Employees.jsx';
import Policy from '../desktop/src/pages/admin/Policy.jsx';
import ActivityHistory from '../desktop/src/pages/admin/ActivityHistory.jsx';
import {humanDuration} from '../desktop/src/lib/format.js';
import {dutyDayFor} from '../desktop/src/lib/check-ins.js';
import '../desktop/src/styles.css';
import '../desktop/src/admin.css';
import '../desktop/src/liquid-glass.css';
import '../desktop/src/ultron-treatment.css';
import './styles.css';
import './mobile-redesign.css';
import {BrandMark,NavIcon} from './icons.jsx';
import MobileLayout from './MobileLayout.jsx';

function App(){
 const[account,setAccount]=useState(null),[tab,setTab]=useState('track'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[timer,setTimer]=useState({}),[tasks,setTasks]=useState([]),[taskId,setTaskId]=useState(''),[note,setNote]=useState(''),[policy,setPolicy]=useState(null),[activity,setActivity]=useState(null),[selectedDay,setSelectedDay]=useState(()=>new Date(Date.now()+21600000).toISOString().slice(0,10));
 const[floating,setFloating]=useState(true);const[attendance,setAttendance]=useState(null);
 const[update,setUpdate]=useState(null),[auto,setAuto]=useState(()=>localStorage.getItem('autoUpdate')!=='false');
 const [today,setToday]=useState(null);
 const actionPending=useRef(false), statusPending=useRef(null);
 async function act(fn){
  if(actionPending.current)return;
  actionPending.current=true;setBusy(true);setError('');
  try{await fn();}catch(e){setError(e.message);}finally{actionPending.current=false;setBusy(false);}
 }
 function refresh(){
  if(statusPending.current)return statusPending.current;
  const pending=native('status').then(status=>{setTimer(status);setFloating(status.floatingEnabled!==false);})
    .finally(()=>{if(statusPending.current===pending)statusPending.current=null;});
  statusPending.current=pending;
  return pending;
 }
 async function load(){await Promise.all([request('/api/agent/tasks').then(data=>setTasks(data.tasks||[])),request('/api/agent/attendance').then(setAttendance).catch(()=>setAttendance(current=>current??{unavailable:true})),request('/api/agent/policy').then(setPolicy)]);}
 useEffect(()=>{native('account').then(setAccount).catch(e=>setError(e.message));const back=()=>{if(document.querySelector('.monitor-lightbox')){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return;}const dialog=document.querySelector('dialog[open]');if(dialog)dialog.dispatchEvent(new Event('cancel',{cancelable:true}));else setTab('track');};window.addEventListener('chronexa-back',back);return()=>window.removeEventListener('chronexa-back',back);},[]);
 useEffect(()=>{
  if(!account?.signedIn)return;
  const poll=()=>{if(document.visibilityState!=='hidden')refresh().catch(()=>{});};
  poll();
  const interval=setInterval(poll,timer.running?1000:3000);
  return()=>clearInterval(interval);
 },[account?.signedIn,timer.running]);
 useEffect(()=>{
  if(!account?.signedIn){setToday(null);setAttendance(null);setPolicy(null);setActivity(null);setTasks([]);setTimer({});return;}
  let active=true;
  const loadToday=()=>{if(document.visibilityState!=='hidden')request('/api/agent/activity?scope=today').then(data=>{if(active)setToday(data);}).catch(()=>{});};
  const loadWorkspace=()=>{if(document.visibilityState!=='hidden')load().catch(e=>{if(active)setError(e.message);});};
  const onActive=()=>{loadWorkspace();loadToday();};
  onActive();
  request('/api/agent/me').then(data=>{if(active)setAccount(current=>({...current,user:data.user}));}).catch(()=>{});
  const workspaceTimer=setInterval(loadWorkspace,60000);
  const todayTimer=setInterval(loadToday,45000);
  window.addEventListener('chronexa-active',onActive);
  return()=>{active=false;clearInterval(workspaceTimer);clearInterval(todayTimer);window.removeEventListener('chronexa-active',onActive);};
 },[account?.signedIn]);
 useEffect(()=>{
  if(!account?.signedIn)return;
  checkUpdate();
  if(!auto)return;
  const interval=setInterval(checkUpdate,3600000);
  return()=>clearInterval(interval);
 },[account?.signedIn,auto]);
 useEffect(()=>{if(!account?.signedIn)return;const resume=()=>{native('consumeResume').then(data=>{if(data.requested)act(async()=>{const result=await native('start',data.task||{});if(result.attendance)setAttendance(result.attendance);await refresh();});}).catch(e=>setError(e.message));};resume();window.addEventListener('chronexa-resume',resume);return()=>window.removeEventListener('chronexa-resume',resume);},[account?.signedIn]);
 useEffect(()=>{if(!account?.signedIn||tab!=='activity')return;let current=true;request(`/api/agent/activity?month=${selectedDay.slice(0,7)}`).then(data=>{if(current)setActivity(data);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[account?.signedIn,tab,selectedDay.slice(0,7)]);
 async function checkUpdate(){try{const data=await request('/api/agent/android-version');setUpdate(data);}catch(e){setError(e.message);}}
 const outdated=Boolean(update?.latestVersion&&account?.version&&compare(account.version,update.latestVersion)<0);
 if(!account)return <main className="mobile-login"><h1>Chronexa</h1><p>{error||'Opening your workspace…'}</p></main>;
 if(!account.signedIn)return <main className="mobile-login"><span className="mobile-brand"><BrandMark/></span><h1>Chronexa</h1><p>Your work, in sync.</p><form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);act(async()=>{const data=await native('login',Object.fromEntries(form));setAccount({signedIn:true,user:data.user,version:account.version});});}}><label>Email<input name="email" type="email" autoComplete="username" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label><button className="btn primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form>{error&&<p className="form-error" role="alert">{error}</p>}</main>;
 const admin=account.user?.canManageTrackingPolicy;
 const canViewEmployees=admin||account.user?.canViewEmployeeTracking;
 const current=timer.session;
 const todayKey=dutyDayFor(new Date(),policy?.work);
 const serverRows=today?.date===todayKey?(today.sessions||[]):[];
 const todaySessions=new Map(serverRows.map(row=>[row.id,row]));
 for(const row of timer.localSessions||[]) {
  if(dutyDayFor(row.startedAt,policy?.work)===todayKey)todaySessions.set(row.id,row);
 }
 const countIdle=today?.countIdleAsWork??policy?.idle?.countIdleAsWork;
 const todaySeconds=[...todaySessions.values()].reduce((sum,row)=>sum+(row.activeSeconds||0)+(countIdle?(row.idleSeconds||0):0),0);
 const captureRequired=policy?.screenshots?.enabled||policy?.recording?.enabled;
 return <MobileLayout {...{account,setAccount,tab,setTab,error,setError,busy,timer,setTimer,tasks,setTasks,taskId,setTaskId,note,setNote,policy,activity,setActivity,selectedDay,setSelectedDay,attendance,setAttendance,update,auto,setAuto,floating,setFloating,act,refresh,load,checkUpdate,outdated,todaySeconds,current,captureRequired}}/>;
}
function compare(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;}
createRoot(document.getElementById('root')).render(<App/>);
