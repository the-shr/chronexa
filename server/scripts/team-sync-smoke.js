import assert from 'node:assert/strict';
import { syncTeamProfiles } from '../src/lib/team-sync.js';
const users = [
 {id:'local', email:'admin@example.com',name:'Local Admin',source:'local',role:'admin',passwordHash:'preserved'},
 {id:'tracked',email:'old@example.com',name:'Old name',source:'bmos',externalId:'os-existing',role:'admin',active:false,overrides:{weeklyTargetHours:25}},
];
const db={user:{
 findMany:async()=>structuredClone(users),
 update:async({where,data})=>Object.assign(users.find(u=>u.id===where.id),data),
 upsert:async({where,create,update})=>{
  const user=users.find(u=>u.email===where.email);
  if(user)return Object.assign(user,update);
  const row={id:'user-'+users.length,...create};users.push(row);return row;
 }
}};
const profiles=[{userId:'os-new',name:'New Employee',email:'New@Example.com'},{userId:'os-existing',name:'Updated name',email:'changed@example.com'},{userId:'os-admin',name:'OS Name',email:'admin@example.com'}];
await syncTeamProfiles(db,profiles);
assert.equal(users.length,3);
const fresh=users.find(u=>u.externalId==='os-new');
assert.equal(fresh.email,'new@example.com');assert.equal(fresh.source,'bmos');assert.equal(fresh.passwordHash,null);assert.equal(fresh.role,'employee');
assert.equal(users[1].id,'tracked');assert.equal(users[1].email,'changed@example.com');assert.equal(users[1].role,'admin');assert.equal(users[1].active,false);assert.equal(users[1].overrides.weeklyTargetHours,25);
assert.equal(users[0].name,'Local Admin');assert.equal(users[0].passwordHash,'preserved');
await syncTeamProfiles(db,profiles);assert.equal(users.length,3);
await syncTeamProfiles(db,null);await syncTeamProfiles(db,[]);await syncTeamProfiles(db,[{userId:'bad',email:'invalid',name:'Bad'}]);assert.equal(users.length,3);
users.push({id:'collision',email:'taken@example.com',source:'bmos',externalId:'another'});
await syncTeamProfiles(db,[{userId:'os-existing',email:'taken@example.com',name:'Should not merge'}]);assert.equal(users[1].email,'changed@example.com');
console.log('PASS: first-login-free provisioning, repeated sync, email changes, stable IDs, local account protection, permissions/policy preservation, unavailable hub, malformed profiles and identity collisions.');
