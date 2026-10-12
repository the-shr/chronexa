const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = __dirname;
const source = fs.readFileSync(root+'/server/src/app/api/agent/admin/employees/[id]/avatar/route.js','utf8').replace(/^import .*;$/gm,'').replace(/export /g,'');
let queried=0;
const denied=vm.runInNewContext(source+'\nGET',{Response,adminDeviceFromRequest:async()=>null,prisma:{user:{findUnique(){queried++;}}}});
async function main(){
  assert.equal((await denied({}, {params:Promise.resolve({id:'u'})})).status,401);assert.equal(queried,0);
  const bytes=Buffer.from([137,80,78,71]);
  const allowed=vm.runInNewContext(source+'\nGET',{Response,adminDeviceFromRequest:async()=>({}),prisma:{user:{findUnique:async()=>({avatarPath:'r2:avatars/u.png'})}},getAvatar:async()=>bytes});
  const picture=await allowed({}, {params:Promise.resolve({id:'u'})});assert.equal(picture.headers.get('content-type'),'image/png');assert.equal(picture.headers.get('cache-control'),'private, max-age=300');assert.equal(Buffer.from(await picture.arrayBuffer()).equals(bytes),true);
  let roleAllowed=true,requests=0;
  const auth={isSignedIn:()=>true,get:()=>({user:{id:'admin',canManageTrackingPolicy:roleAllowed}}),authHeaders:()=>({})};
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(root+'/desktop/electron/lib/admin.js','utf8'),{module,require:id=>id==='./auth'?auth:id==='./settings'?{get:()=>({sync:{serverUrl:'https://local.test'}})}:require(id),Buffer,AbortSignal,Date,URLSearchParams,setTimeout,fetch:async()=>{requests++;return new Response(bytes,{headers:{'content-type':'image/png'}});}});
  const admin=module.exports;
  const [first,second]=await Promise.all([admin.avatar('u'),admin.avatar('u')]);assert.equal(first,second);assert.equal(requests,1,'Repeated card/podium photos coalesce');
  await admin.avatar('u');assert.equal(requests,1,'Repeated render uses cache');
  roleAllowed=false;await assert.rejects(()=>admin.avatar('u'),/Admin access required/,'Cached photo cannot bypass admin permission');
  console.log('PASS: private avatar authorization, private cache headers, image bytes, request coalescing and permission checks before cache');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
