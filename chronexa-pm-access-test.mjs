import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('./', import.meta.url)).replaceAll('\\','/');
const policy=await import('file:///'+root+'server/src/lib/tracking-access.js');
const pm={id:'pm',email:'pm@example.test',active:true,role:'employee',bmosRoleKeys:['CUSTOM_PROJECT_MANAGER_MRGN4WYY']};
const low={id:'low',email:'low@example.test',active:true,role:'employee',externalId:'os-low'};
const profile={userId:'os-low',email:low.email,roleKeys:['EMPLOYEE']};
assert(policy.canViewEmployeeTracking(pm));assert(policy.canViewEmployeeTracking({...pm,bmosRoleKeys:['CUSTOM_ASSIGNED_PROJECT_MANAGER']}));assert(!policy.canViewEmployeeTracking({...pm,active:false}));
assert(!policy.canViewEmployeeTracking({...pm,bmosRoleKeys:[]}));
for(const role of ['CEO','HOO','SUPER_ADMIN','CUSTOM_CEO_123','HEAD_OF_OPERATIONS']) {
 assert(policy.managerCanView(pm,{...low,bmosRoleKeys:[role]},profile));
 assert(policy.managerCanView(pm,low,{...profile,roleKeys:[role]}));
}
assert(policy.managerCanView(pm,low,{...profile,isSuperAdmin:true}));
assert(policy.managerCanView(pm,low,{...profile,roleKeys:pm.bmosRoleKeys}));
assert(!policy.managerCanView(pm,low,null));assert(policy.managerCanView(pm,low,profile));assert(policy.managerCanView(pm,pm,{roleKeys:pm.bmosRoleKeys}));
const strip=s=>s.replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
const authSource=strip(fs.readFileSync(root+'server/src/lib/auth.js','utf8').replace(/^export \{.*from .*;\r?\n/gm,''));
let directory=[profile];const people=[pm,low,{id:'boss',email:'boss@example.test',role:'admin',active:true,bmosIsSuperAdmin:true}];
const auth=new Function('prisma','fetchTeamProfiles','isProjectManager','canViewEmployeeTracking','managerCanView',authSource+';return {isChronexaAdmin,trackingUserScope,canReadTrackingUser};')({user:{findMany:async()=>people}},async()=>directory,policy.isProjectManager,policy.canViewEmployeeTracking,policy.managerCanView);
assert(!auth.isChronexaAdmin({...pm,role:'admin',bmosPermissions:['settings.manage','attendance.manage']}));
assert(auth.isChronexaAdmin({...pm,bmosIsSuperAdmin:true}));
assert.deepEqual(await auth.trackingUserScope(pm),['pm','low']);assert(!await auth.canReadTrackingUser(pm,'boss'));
directory=[profile,{userId:'boss',email:'boss@example.test',roleKeys:['SUPER_ADMIN']}];assert.deepEqual(await auth.trackingUserScope(pm),['pm','low','boss']);
directory=null;assert.deepEqual(await auth.trackingUserScope(pm),[]);
const admin={id:'admin',role:'admin',active:true};assert.equal(await auth.trackingUserScope(admin),null);
// Exercise each route's guard before it can read protected sessions or media.
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
for(const route of ['agent/admin/employees/[id]','agent/admin/employees/[id]/avatar','image/[id]','recording/[id]']) {
 const source=strip(fs.readFileSync(root+'server/src/app/api/'+route+'/route.js','utf8'));
 let read=false;
 const deps={trackingDeviceFromRequest:async()=>({user:pm}),canReadTrackingUser:async()=>false,currentAdmin:async()=>null,prisma:{screenshot:{findUnique:async()=>({userId:'boss'})},recording:{findUnique:async()=>({userId:'boss',driveFileId:'secret'})}},employeeDetail:async()=>{read=true;throw Error('should not read');},getScreenshot:async()=>{read=true;},getFile:async()=>{read=true;},getAvatar:async()=>{read=true;}};
 const get=await new AsyncFunction(...Object.keys(deps),source+';return GET;')(...Object.values(deps));
 const res=await get(new Request('https://example.test/api'),{params:Promise.resolve({id:'boss'})});assert.equal(res.status,404,route);assert(!read,route);
}
for(const route of ['screenshots','recordings']) {
 const source=strip(fs.readFileSync(root+'server/src/app/api/agent/admin/'+route+'/route.js','utf8'));
 const get=await new AsyncFunction('trackingDeviceFromRequest','trackingUserScope',source+';return GET;')(async()=>({user:pm}),async()=>['pm','low']);
 for(const suffix of ['','?userId=boss']){const r=await get(new Request('https://example.test/api'+suffix));assert.equal(r.status,403);}
}
console.log('PASS: PM scope follows the OS selection, including selected executives, self, revoked directory, direct media/detail IDs and capture lists');

