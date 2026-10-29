import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {native,request} from './bridge.js';
import Employees from '../desktop/src/pages/admin/Employees.jsx';
import Policy from '../desktop/src/pages/admin/Policy.jsx';
import ActivityHistory from '../desktop/src/pages/admin/ActivityHistory.jsx';
import {humanDuration} from '../desktop/src/lib/format.js';
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
 const[floating,setFloating]=useState(false);const[attendance,setAttendance]=useState(null);
 const[update,setUpdate]=useState(null),[auto,setAuto]=useState(()=>localStorage.getItem('autoUpdate')!=='false');
 async function act(fn){setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function refresh(){const status=await native('status');setTimer(status);setFloating(status.floatingEnabled===true);}
 async function load(){await Promise.all([request('/api/agent/tasks').then(data=>setTasks(data.tasks||[])),request('/api/agent/attendance').then(setAttendance).catch(()=>{}),request('/api/agent/policy').then(setPolicy),request(`/api/agent/activity?month=${selectedDay.slice(0,7)}`).then(setActivity)]);}
 useEffect(()=>{native('account').then(setAccount).catch(e=>setError(e.message));const timer=setInterval(()=>{if(document.visibilityState!=='hidden')refresh().catch(()=>{});},1000);const back=()=>{if(document.querySelector('.monitor-lightbox')){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return;}const dialog=document.querySelector('dialog[open]');if(dialog)dialog.dispatchEvent(new Event('cancel',{cancelable:true}));else setTab('track');};window.addEventListener('chronexa-back',back);return()=>{clearInterval(timer);window.removeEventListener('chronexa-back',back);};},[]);
 useEffect(()=>{if(!account?.signedIn)return;act(load);native('floating').then(data=>setFloating(data.floating===true)).catch(()=>{});request('/api/agent/me').then(data=>setAccount(current=>({...current,user:data.user}))).catch(()=>{});checkUpdate();const id=setInterval(()=>{if(auto)checkUpdate();},3600000);const refreshData=()=>{if(document.visibilityState!=='hidden')load().catch(e=>setError(e.message));};const dataTimer=setInterval(refreshData,60000);window.addEventListener('chronexa-active',refreshData);return()=>{clearInterval(id);clearInterval(dataTimer);window.removeEventListener('chronexa-active',refreshData);};},[account?.signedIn,auto]);
 useEffect(()=>{if(!account?.signedIn)return;const resume=()=>{native('consumeResume').then(data=>{if(data.requested)act(async()=>{await native('start',data.task||{});await refresh();});}).catch(e=>setError(e.message));};resume();window.addEventListener('chronexa-resume',resume);return()=>window.removeEventListener('chronexa-resume',resume);},[account?.signedIn]);
 useEffect(()=>{if(!account?.signedIn||tab!=='activity')return;let current=true;request(`/api/agent/activity?month=${selectedDay.slice(0,7)}`).then(data=>{if(current)setActivity(data);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[account?.signedIn,tab,selectedDay.slice(0,7)]);
 async function checkUpdate(){try{const data=await request('/api/agent/android-version');setUpdate(data);}catch(e){setError(e.message);}}
 const outdated=Boolean(update?.latestVersion&&account?.version&&compare(account.version,update.latestVersion)<0);
 if(!account)return <main className="mobile-login"><h1>Chronexa</h1><p>{error||'Opening your workspace…'}</p></main>;
 if(!account.signedIn)return <main className="mobile-login"><span className="mobile-brand"><BrandMark/></span><h1>Chronexa</h1><p>Your work, in sync.</p><form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);act(async()=>{const data=await native('login',Object.fromEntries(form));setAccount({signedIn:true,user:data.user,version:account.version});});}}><label>Email<input name="email" type="email" autoComplete="username" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label><button className="btn primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form>{error&&<p className="form-error" role="alert">{error}</p>}</main>;
 const admin=account.user?.canManageTrackingPolicy;
 const canViewEmployees=admin||account.user?.canViewEmployeeTracking;
 const current=timer.session;
 const todayKey=new Date(Date.now()+21600000).toISOString().slice(0,10);const todaySessions=new Map();for(const row of [...(activity?.sessions||[]),...(timer.localSessions||[])]){if(new Date(new Date(row.startedAt).getTime()+21600000).toISOString().slice(0,10)!==todayKey)continue;const seconds=(row.activeSeconds||0)+(activity?.countIdleAsWork?(row.idleSeconds||0):0);todaySessions.set(row.id,Math.max(todaySessions.get(row.id)||0,seconds));}const todaySeconds=[...todaySessions.values()].reduce((sum,n)=>sum+n,0);
 const captureRequired=policy?.screenshots?.enabled||policy?.recording?.enabled;
 return <MobileLayout {...{account,setAccount,tab,setTab,error,setError,busy,timer,setTimer,tasks,setTasks,taskId,setTaskId,note,setNote,policy,activity,setActivity,selectedDay,setSelectedDay,attendance,setAttendance,update,auto,setAuto,act,refresh,load,checkUpdate,outdated,todaySeconds,current,captureRequired}}/>;
}
function compare(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;}
createRoot(document.getElementById('root')).render(<App/>);
