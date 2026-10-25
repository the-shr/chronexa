const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),assert=require('assert/strict'),Module=require('module'),path=require('path');
const root=path.resolve(__dirname,'..'),out=process.env.CHRONEXA_TEST_OUTPUT||path.join(require('os').tmpdir(),'chronexa-floating-controls-'+Date.now());
fs.mkdirSync(out,{recursive:true});app.setPath('userData',out+'/test-data');app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});
let snapshot={state:'running',session:{id:'test-session'},today:{workSeconds:3671},idlePhase:'active'},cursor={x:-19900,y:-19900};
let preferences={general:{timerOverlayVisible:false}};
const area={x:-20000,y:-20000,width:1320,height:900};
const realLoad=Module._load;
class TestWindow extends BrowserWindow {focus(){} showInactive(){super.showInactive()} }
Module._load=function(name,parent,...args){if(parent?.filename===path.join(root,'electron/lib/windows.js')){
 if(name==='electron')return {BrowserWindow:TestWindow,screen:{getPrimaryDisplay:()=>({workArea:area}),getDisplayMatching:()=>({workArea:area}),getDisplayNearestPoint:()=>({workArea:area}),getCursorScreenPoint:()=>cursor},shell:{}};
 if(name==='./settings')return {get:()=>preferences,set:patch=>preferences={...preferences,general:{...preferences.general,...patch.general}}};
 if(name==='./tracker')return {snapshot:()=>snapshot};
 }return realLoad.call(this,name,parent,...args);};
const windows=require(root+'/electron/lib/windows');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const handle=(name,fn)=>ipcMain.handle(name,(_e,p)=>fn(p));
 handle('tracker:snapshot',()=>snapshot);handle('overlay:expand',windows.setOverlayExpanded);handle('overlay:hide',windows.hideOverlay);handle('overlay:drag',windows.dragOverlay);
 const update=state=>{snapshot={...snapshot,state};windows.updateOverlay(snapshot);windows.broadcast('tracker:state',snapshot);return snapshot;};
 handle('tracker:pause',()=>update('paused'));handle('tracker:resume',()=>update('running'));handle('tracker:stop',()=>update('stopped'));
 // The real renderer and IPC run against an offscreen native window.
 windows.updateOverlay(snapshot);const win=windows.getOverlayWindow();
 const js=s=>win.webContents.executeJavaScript(s);
 async function until(s){for(let i=0;i<100;i++){if(await js(s))return;await wait(50);}throw Error('Timeout: '+s);}
 await until("document.querySelector('.timer-overlay-time strong')?.textContent==='01:01:11'");
 const compact=win.getBounds();assert.equal(await js("document.querySelectorAll('.timer-overlay-actions button').length"),0);
 const pointer=async(type,x,y)=>{win.webContents.sendInputEvent({type,x,y,button:'left',clickCount:1});await wait(80);};
 await pointer('mouseDown',70,25);await pointer('mouseUp',70,25);
 await until("document.querySelectorAll('.timer-overlay-actions button').length===3");assert(win.getBounds().width>compact.width);
 await wait(150);fs.writeFileSync(out+'/expanded.png',(await win.webContents.capturePage()).toPNG());
 await js("document.querySelector('[aria-label=\"Pause tracking\"]').click()");await until("!document.querySelector('.timer-overlay-actions')");assert.equal(snapshot.state,'paused');
 await pointer('mouseDown',70,25);await pointer('mouseUp',70,25);await until("document.querySelector('[aria-label=\"Resume tracking\"]')");
 win.emit('blur');await until("!document.querySelector('.timer-overlay-actions')");
 cursor={x:-19900,y:-19900};await pointer('mouseDown',70,25);cursor={x:-19840,y:-19880};await pointer('mouseMove',100,40);await pointer('mouseUp',100,40);
 assert.equal(await js("!!document.querySelector('.timer-overlay-actions')"),false,'Dragging must not expand');
 assert.notEqual(win.getBounds().x,compact.x,'Dragging must move native window');
 await pointer('mouseDown',70,25);await pointer('mouseUp',70,25);await until("document.querySelector('.timer-overlay-actions')");
 await js("document.querySelector('[aria-label=\"Hide timer until next play\"]').click()");await wait(100);assert.equal(win.isVisible(),false);
 update('running');await until("!document.querySelector('.timer-overlay-actions')");assert.equal(preferences.general.timerOverlayVisible,true);
 assert.equal(win.isVisible(),true,'Next play must restore the hidden timer');
 await pointer('mouseDown',70,25);await pointer('mouseUp',70,25);await until("document.querySelector('.timer-overlay-actions')");
 await js("document.querySelector('[aria-label=\"Stop tracking\"]').click()");await wait(150);assert.equal(snapshot.state,'stopped');assert.equal(win.isVisible(),false);
 fs.writeFileSync(out+'/verification.txt','PASS: time-only collapsed timer, click expansion, pause/play, outside blur collapse, native drag without expansion, hide reset on next play, stop.');win.destroy();app.quit();
}).catch(e=>{fs.writeFileSync(out+'/verification.txt',e.stack);app.exit(1);});
