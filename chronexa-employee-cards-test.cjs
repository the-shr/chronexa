const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
const root=__dirname;
async function main(){
  let user={id:'u',name:'User',overrides:{screenshotsEnabled:false,dailyTargetHours:6}};
  const prisma={user:{findUnique:async()=>user,update:async({data})=>{user={...user,...data};return user;}}};
  const code=fs.readFileSync(root+'/server/src/lib/policy.js','utf8').replace(/^import .*;$/gm,'').replace(/export /g,'');
  const set=vm.runInNewContext(code+'\nsetUserOverride',{prisma});
  await set('u',{rankingEnabled:false});assert.equal(user.overrides.rankingEnabled,false);assert.equal(user.overrides.screenshotsEnabled,false);
  await set('u',{dailyTargetHours:7});assert.equal(user.overrides.rankingEnabled,false);
  assert.match((await set('u',{rankingEnabled:'false'})).error,/On or Off/);
  await set('u',{rankingEnabled:null});assert.equal(user.overrides.rankingEnabled,undefined);assert.equal(user.overrides.screenshotsEnabled,false);
  console.log('PASS: ranking off survives other changes, capture overrides preserved, invalid flags rejected, include restores default');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
