import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {ReadCache}=require('../../desktop/electron/lib/read-cache.js');
const mobileSource=await fs.readFile(new URL('../../android-web/read-cache.js',import.meta.url),'utf8');
const {createReadCache}=await import('data:text/javascript;base64,'+Buffer.from(mobileSource).toString('base64'));
const oldWindow=globalThis.window;
try {
 const sent=[];globalThis.window={ChronexaNative:{send:(id,method,raw)=>sent.push({id,method,raw})}};
 const cacheUrl='data:text/javascript;base64,'+Buffer.from(mobileSource).toString('base64');
 const bridgeSource=(await fs.readFile(new URL('../../android-web/bridge.js',import.meta.url),'utf8')).replace("'./read-cache.js'",JSON.stringify(cacheUrl));
 const bridge=await import('data:text/javascript;base64,'+Buffer.from(bridgeSource).toString('base64'));
 const requests=Array.from({length:10},()=>bridge.request('/api/agent/activity'));await Promise.resolve();
 assert.equal(sent.length,1);window.__chronexaResult(sent[0].id,true,'{"sessions":[]}');await Promise.all(requests);
 const late=bridge.request('/api/agent/policy');await Promise.resolve();const old=sent.at(-1);
 const rejected=assert.rejects(late,/Account changed/);const logout=bridge.native('logout');const current=sent.at(-1);
 window.__chronexaResult(old.id,true,'{"private":"old account"}');window.__chronexaResult(current.id,true,'{}');await rejected;await logout;
} finally {if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
for(const create of [opts=>new ReadCache(opts),createReadCache]){
 let now=0,calls=0;const cache=create({ttl:20,limit:2,now:()=>now});
 const load=async()=>++calls;
 assert.deepEqual(await Promise.all(Array.from({length:12},()=>cache.read('account-a:team',load))),Array(12).fill(1));
 assert.equal(calls,1,'Concurrent reads must share one request');
 assert.equal(await cache.read('account-a:team',load),1);assert.equal(calls,1);
 assert.equal(await cache.read('account-b:team',load),2,'Accounts must not share data');
 now=21;assert.equal(await cache.read('account-a:team',load),3,'Expired data must refetch');
 await assert.rejects(cache.read('failure',()=>Promise.reject(Error('offline'))));
 assert.equal(await cache.read('failure',load),4,'Failures must not be cached');
 let release;const stale=cache.read('late',()=>new Promise(resolve=>release=resolve));await Promise.resolve();
 cache.clear();assert.equal(await cache.read('late',load),5);release('old');await stale;
 assert.equal(await cache.read('late',load),5,'Late pre-invalidation response must not replace current data');
 cache.clear();await cache.read('one',load);await cache.read('two',load);await cache.read('three',load);
 const before=calls;await cache.read('one',load);assert.equal(calls,before+1,'Cache size must remain bounded');
}
const {syncTeamProfiles}=await import('../src/lib/team-sync.js');
let reads=0;const db={user:{findMany:async()=>{reads++;return [{id:'a',email:'a@example.com',name:'A',externalId:'os-a',source:'bmos'}];}}};
const people=[{userId:'os-a',email:'a@example.com',name:'A'}];
await Promise.all(Array.from({length:8},()=>syncTeamProfiles(db,people)));assert.equal(reads,1,'Same directory snapshot must sync once');
await syncTeamProfiles(db,[...people]);assert.equal(reads,2,'New directory snapshot must sync again');
let fail=true;const failing={user:{findMany:async()=>{if(fail)throw Error('database offline');return [];},upsert:async()=>({})}};
await assert.rejects(syncTeamProfiles(failing,people));fail=false;await syncTeamProfiles(failing,people);
// Exercise the actual desktop task client with isolated stores and transport.
let token='first',networkCalls=0,expired=0,respond;
const auth={get:()=>({token}),isSignedIn:()=>Boolean(token),authHeaders:()=>({authorization:token}),markExpired:()=>expired++};
const context={module:{exports:{}},require:name=>{
 if(name==='node:events')return require(name);
 if(name==='./auth')return auth;
 if(name==='./settings')return {get:()=>({sync:{serverUrl:'https://test.invalid'}})};
 if(name==='./db')return {peekOutbox:()=>[]};
 if(name==='./log')return {warn:()=>{}};
 return {};
},AbortSignal,Date,setInterval,clearInterval,fetch:async()=>{networkCalls++;return new Promise(resolve=>respond=resolve);}};
vm.runInNewContext(await fs.readFile(new URL('../../desktop/electron/lib/tasks.js',import.meta.url),'utf8'),context);
const tasks=context.module.exports;let saved={rows:[],fetchedAt:null};tasks.store={read:()=>saved,write:value=>saved=value,flush:()=>{}};
const pendingTasks=Array.from({length:20},()=>tasks.refresh());
respond({ok:true,status:200,json:async()=>({tasks:[{id:'t',status:'open'}]})});await Promise.all(pendingTasks);
assert.equal(networkCalls,1,'Twenty task refreshes must make one server call');
await tasks.refresh();assert.equal(networkCalls,1,'Repeated focus must respect refresh cooldown');
tasks.lastRefreshAttempt=0;const previous=tasks.refresh();token='second';
respond({ok:false,status:401});await previous;assert.equal(expired,0,'Old account response must not expire a newly signed-in account');
const originalFetch=globalThis.fetch,envKeys=['BMOS_URL','ECOSYSTEM_CLIENT_ID','ECOSYSTEM_CLIENT_SECRET'];
const oldEnv=envKeys.map(key=>process.env[key]);
try {
 process.env.BMOS_URL='https://test.invalid';process.env.ECOSYSTEM_CLIENT_ID='test';process.env.ECOSYSTEM_CLIENT_SECRET='test';
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({people:[{userId:'one',email:'one@example.com',name:'One'}]});};
 const {fetchTeamProfiles}=await import('../src/lib/bmos.js');
 await Promise.all(Array.from({length:15},()=>fetchTeamProfiles('one@example.com')));assert.equal(calls,1);
 await fetchTeamProfiles('one@example.com');assert.equal(calls,1,'Cached directory must avoid another OS request');
 await fetchTeamProfiles('two@example.com');assert.equal(calls,2,'Actor caches must be isolated');
 await fetchTeamProfiles('one@example.com',{fresh:true});assert.equal(calls,3,'Explicit fresh directory request must bypass the cache');
} finally { globalThis.fetch=originalFetch;envKeys.forEach((key,i)=>{if(oldEnv[i]===undefined)delete process.env[key];else process.env[key]=oldEnv[i];}); }
console.log('PASS: desktop/Android request coalescing, TTL, account isolation, failure retry, mutation races, bounded caches, directory sync coalescing and retry.');
console.log('PASS: 20 task refreshes -> 1 network call; old-account 401 isolation; 15 concurrent directory reads -> 1 OS call; fresh requests bypass cache.');
