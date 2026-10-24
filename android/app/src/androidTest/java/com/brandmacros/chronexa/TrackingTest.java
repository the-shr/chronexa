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
 @Test public void encryptedStoreAndCrashRecovery()throws Exception{
  Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();Store.save(c,"account",new JSONObject());
  JSONObject session=new JSONObject().put("id","offline-recovery-test").put("startedAt","2026-10-24T01:00:00Z").put("activeSeconds",17);
  Store.save(c,"timer",new JSONObject().put("running",true).put("session",session).put("checkpoint","2026-10-24T01:00:17Z"));
  String raw=c.getSharedPreferences("private",0).getString("timer","");assertFalse(raw.contains("offline-recovery-test"));
  TrackingService.recover(c);JSONObject recovered=TrackingService.status(c);assertFalse(recovered.getBoolean("running"));assertEquals(17,recovered.getJSONObject("session").getInt("activeSeconds"));assertEquals("2026-10-24T01:00:17Z",recovered.getJSONObject("session").getString("endedAt"));
  Store.save(c,"queue",new JSONObject().put("sessions",new JSONArray()));Store.save(c,"timer",new JSONObject());
 }
 @Test public void projectionCapturesAndLockPauses()throws Exception{
  var instrumentation=InstrumentationRegistry.getInstrumentation();Context c=instrumentation.getTargetContext();Store.save(c,"account",new JSONObject());Store.save(c,"timer",new JSONObject());Store.save(c,"queue",new JSONObject().put("sessions",new JSONArray()));
  Store.save(c,"policy",new JSONObject("{\"version\":\"test\",\"screenshots\":{\"enabled\":true,\"intervalMinutes\":1,\"quality\":65},\"recording\":{\"enabled\":true,\"mode\":\"interval\",\"intervalMinutes\":10,\"durationSeconds\":3}}"));
  if(Build.VERSION.SDK_INT>=33)instrumentation.getUiAutomation().grantRuntimePermission(c.getPackageName(),android.Manifest.permission.POST_NOTIFICATIONS);
  MainActivity activity=(MainActivity)instrumentation.startActivitySync(new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
  instrumentation.runOnMainSync(()->{try{activity.startRequest="test";activity.startPayload=new JSONObject().put("taskNote","Emulator lifecycle test");activity.startActivityForResult(activity.captureIntent(),31);}catch(Exception e){throw new RuntimeException(e);}});
  UiDevice device=UiDevice.getInstance(instrumentation);UiObject2 button=device.wait(Until.findObject(By.text(java.util.regex.Pattern.compile("(?i)start now|start recording|start sharing"))),10000);assertNotNull("Android screen-sharing consent must be visible",button);button.click();
  for(int i=0;i<50&&!TrackingService.isRunning();i++)Thread.sleep(200);assertTrue("Foreground timer starts after consent",TrackingService.isRunning());Thread.sleep(2500);
  assertTrue("JPEG was captured",new File(c.getFilesDir(),"outbox").listFiles((d,n)->n.endsWith(".jpg")).length>0);
  instrumentation.runOnMainSync(()->{try{TrackingService.instance.capture.startClip();}catch(Exception e){throw new RuntimeException(e);}});Thread.sleep(3500);
  instrumentation.runOnMainSync(()->{try{TrackingService.instance.capture.stopClip();}catch(Exception e){throw new RuntimeException(e);}});
  File[] clips=new File(c.getFilesDir(),"outbox").listFiles((d,n)->n.endsWith(".mp4"));assertTrue("MP4 clip was captured",clips.length>0);byte[] bytes=TrackingService.read(clips[0]);assertEquals("ftyp",new String(bytes,4,4,"US-ASCII"));
  device.sleep();Thread.sleep(1200);assertFalse("Lock must pause tracking",TrackingService.isRunning());assertTrue("Time survives pause",TrackingService.status(c).getJSONObject("session").getInt("activeSeconds")>=5);assertTrue("Offline work is queued",TrackingService.pending(c)>0);device.wakeUp();
  instrumentation.runOnMainSync(activity::finish);
 }
}
