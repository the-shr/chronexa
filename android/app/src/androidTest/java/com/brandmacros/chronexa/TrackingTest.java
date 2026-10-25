package com.brandmacros.chronexa;
import static org.junit.Assert.*;
import android.content.*;
import android.os.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.*;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import java.io.File;

@RunWith(AndroidJUnit4.class)
public class TrackingTest {
 @Test public void pendingWorkRetriesWithoutStartingTracking()throws Exception{
  Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();
  JSONObject row=new JSONObject().put("id","automatic-sync-test").put("startedAt",TrackingService.iso(System.currentTimeMillis())).put("endedAt",TrackingService.iso(System.currentTimeMillis())).put("activeSeconds",17).put("idleSeconds",0);
  TrackingService.enqueue(c,row);Store.save(c,"account",new JSONObject().put("token","test-only"));
  java.util.concurrent.atomic.AtomicBoolean offline=new java.util.concurrent.atomic.AtomicBoolean(true);java.util.concurrent.atomic.AtomicInteger sent=new java.util.concurrent.atomic.AtomicInteger();
  Api.testTransport=(path,method,body)->{if(path.equals("/api/agent/sessions")){if(offline.get())throw new java.io.IOException("Test connection unavailable");assertEquals("automatic-sync-test",body.getString("id"));sent.incrementAndGet();}return new JSONObject();};
  try{
   SyncWorker worker=androidx.work.testing.TestListenableWorkerBuilder.from(c,SyncWorker.class).build();
   assertEquals(androidx.work.ListenableWorker.Result.retry(),worker.doWork());assertEquals(1,TrackingService.pending(c));assertFalse(TrackingService.isRunning());
   offline.set(false);assertEquals(androidx.work.ListenableWorker.Result.success(),worker.doWork());assertEquals(0,TrackingService.pending(c));assertEquals(1,sent.get());assertFalse("Sync must not start tracking or capture",TrackingService.isRunning());assertNotNull(Store.read(c,"sync-state").optString("lastSuccess",null));
   assertEquals(androidx.work.NetworkType.CONNECTED,SyncWorker.constraints().getRequiredNetworkType());
  }finally{Api.testTransport=null;Store.save(c,"account",new JSONObject());}
 }
 @Test public void inactiveTrackingCannotStartCapture()throws Exception{
  var instrumentation=InstrumentationRegistry.getInstrumentation();
  instrumentation.runOnMainSync(()->{try{
   TrackingService service=new TrackingService();Capture capture=new Capture(service,-1,null);
   capture.tick();capture.startClip();assertNull(capture.recorder);assertNull(capture.display);assertNull(capture.images);
   try{capture.start();fail("Inactive tracking must reject screen capture startup");}catch(IllegalStateException expected){}
   capture.close();capture.tick();capture.startClip();assertNull(capture.recorder);
  }catch(Exception e){throw new RuntimeException(e);}});
 }
 @Before public void isolate()throws Exception{Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{if(TrackingService.instance!=null)TrackingService.instance.pause("manual");c.stopService(new Intent(c,TrackingService.class));});for(int i=0;i<50&&TrackingService.instance!=null;i++)Thread.sleep(100);c.getSharedPreferences("private",0).edit().clear().commit();File[] oldCaptures=new File(c.getFilesDir(),"outbox").listFiles();if(oldCaptures!=null)for(File capture:oldCaptures)capture.delete();UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());device.wakeUp();device.pressMenu();}
 @After public void cleanup()throws Exception{Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{if(TrackingService.instance!=null)TrackingService.instance.pause("manual");c.stopService(new Intent(c,TrackingService.class));});UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).wakeUp();}
 @Test public void encryptedStoreAndCrashRecovery()throws Exception{
  Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();Store.save(c,"account",new JSONObject());Store.save(c,"history",new JSONObject());
  JSONObject session=new JSONObject().put("id","offline-recovery-test").put("startedAt","2026-10-24T01:00:00Z").put("activeSeconds",17);
  Store.save(c,"timer",new JSONObject().put("running",true).put("session",session).put("checkpoint","2026-10-24T01:00:17Z"));
  String raw=c.getSharedPreferences("private",0).getString("timer","");assertFalse(raw.contains("offline-recovery-test"));
  TrackingService.recover(c);JSONObject recovered=TrackingService.status(c);assertFalse(recovered.getBoolean("running"));assertEquals(17,recovered.getJSONObject("session").getInt("activeSeconds"));assertEquals("2026-10-24T01:00:17Z",recovered.getJSONObject("session").getString("endedAt"));
  TrackingService.enqueue(c,recovered.getJSONObject("session"));assertEquals("Retry must coalesce the local history entry",1,Store.read(c,"history").getJSONArray("sessions").length());
  Store.save(c,"queue",new JSONObject().put("sessions",new JSONArray()));Store.save(c,"timer",new JSONObject());
 }
 @Test public void projectionCapturesAndLockPauses()throws Exception{
  var instrumentation=InstrumentationRegistry.getInstrumentation();Context c=instrumentation.getTargetContext();Store.save(c,"account",new JSONObject());Store.save(c,"timer",new JSONObject());Store.save(c,"queue",new JSONObject().put("sessions",new JSONArray()));
  Store.save(c,"policy",new JSONObject("{\"version\":\"test\",\"screenshots\":{\"enabled\":true,\"intervalMinutes\":1,\"quality\":65},\"recording\":{\"enabled\":true,\"mode\":\"interval\",\"intervalMinutes\":10,\"durationSeconds\":3}}"));
  if(Build.VERSION.SDK_INT>=33)instrumentation.getUiAutomation().grantRuntimePermission(c.getPackageName(),android.Manifest.permission.POST_NOTIFICATIONS);
  MainActivity activity=(MainActivity)instrumentation.startActivitySync(new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
  instrumentation.runOnMainSync(()->{try{activity.startRequest="test";activity.startPayload=new JSONObject().put("taskNote","Emulator lifecycle test");activity.startActivityForResult(activity.captureIntent(),31);}catch(Exception e){throw new RuntimeException(e);}});
  UiDevice device=UiDevice.getInstance(instrumentation);UiObject2 button=device.wait(Until.findObject(By.text(java.util.regex.Pattern.compile("(?i)start now|start recording|start sharing|share screen|share|start"))),15000);
  if(button==null)button=device.findObject(By.res("android:id/button1"));
  if(button==null){java.io.ByteArrayOutputStream hierarchy=new java.io.ByteArrayOutputStream();device.dumpWindowHierarchy(hierarchy);fail("Android screen-sharing consent missing: "+hierarchy.toString("UTF-8"));}button.click();
  for(int i=0;i<50&&!TrackingService.isRunning();i++)Thread.sleep(200);assertTrue("Foreground timer starts after consent",TrackingService.isRunning());Thread.sleep(2500);
  assertTrue("JPEG was captured",new File(c.getFilesDir(),"outbox").listFiles((d,n)->n.endsWith(".jpg")).length>0);
  instrumentation.runOnMainSync(()->{try{TrackingService.instance.capture.startClip();}catch(Exception e){throw new RuntimeException(e);}});Thread.sleep(3500);
  instrumentation.runOnMainSync(()->{try{TrackingService.instance.capture.stopClip();}catch(Exception e){throw new RuntimeException(e);}});
  File[] clips=new File(c.getFilesDir(),"outbox").listFiles((d,n)->n.endsWith(".mp4"));assertTrue("MP4 clip was captured",clips.length>0);byte[] bytes=TrackingService.read(clips[0]);assertEquals("ftyp",new String(bytes,4,4,"US-ASCII"));
  Capture stoppedCapture=TrackingService.instance.capture;
  instrumentation.runOnMainSync(()->{try{stoppedCapture.startClip();}catch(Exception e){throw new RuntimeException(e);}});Thread.sleep(1200);
  device.sleep();for(int i=0;i<100&&TrackingService.isRunning();i++)Thread.sleep(100);assertFalse("Lock must pause tracking",TrackingService.isRunning());assertTrue("Time survives pause",TrackingService.status(c).getJSONObject("session").getInt("activeSeconds")>=5);assertTrue("Offline work is queued",TrackingService.pending(c)>0);device.wakeUp();
  int filesAfterPause=new File(c.getFilesDir(),"outbox").list().length;
  instrumentation.runOnMainSync(()->{try{stoppedCapture.tick();stoppedCapture.startClip();}catch(Exception e){throw new RuntimeException(e);}});Thread.sleep(1200);
  assertNull("Pause must release the active recorder",stoppedCapture.recorder);assertEquals("Late capture callbacks must not create files while paused",filesAfterPause,new File(c.getFilesDir(),"outbox").list().length);
  instrumentation.runOnMainSync(activity::finish);
 }
}
