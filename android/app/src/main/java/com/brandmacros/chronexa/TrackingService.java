package com.brandmacros.chronexa;

import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import java.io.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

public class TrackingService extends Service {
 static volatile TrackingService instance;
 static final Object LOCK=new Object();
 static final java.util.concurrent.ExecutorService network=Executors.newSingleThreadExecutor();
 final Handler handler=new Handler(Looper.getMainLooper());
 JSONObject session; long elapsed; Capture capture; boolean running;String error="";long lastSync;
 final BroadcastReceiver screen=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent intent){pause("android-screen-locked");}};
 static String iso(long stamp){return java.time.Instant.ofEpochMilli(stamp).toString();}
 static String day(long stamp){return Instant.ofEpochMilli(stamp).atZone(ZoneId.of("Asia/Dhaka")).toLocalDate().toString();}
 static boolean isRunning(){return instance!=null&&instance.running;}
 static int pending(Context c)throws Exception{ synchronized(LOCK){return Store.read(c,"queue").optJSONArray("sessions")==null?mediaCount(c):Store.read(c,"queue").getJSONArray("sessions").length()+mediaCount(c);}}
 static int mediaCount(Context c){File[] files=new File(c.getFilesDir(),"outbox").listFiles((dir,name)->name.endsWith(".json"));return files==null?0:files.length;}
 static JSONObject status(Context c)throws Exception {synchronized(LOCK){JSONObject state=Store.read(c,"timer");if(!isRunning()&&state.optBoolean("running"))recover(c);state=Store.read(c,"timer");return new JSONObject().put("running",isRunning()).put("session",state.optJSONObject("session")).put("pending",pending(c)).put("reason",state.optString("reason")).put("error",instance==null?state.optString("error"):instance.error).put("capture",isRunning()&&instance.capture!=null).put("version",BuildConfig.VERSION_NAME);}}
 static void recover(Context c)throws Exception {synchronized(LOCK){JSONObject state=Store.read(c,"timer");JSONObject old=state.optJSONObject("session");if(state.optBoolean("running")&&old!=null){old.put("endedAt",state.optString("checkpoint",old.getString("startedAt"))).put("stopReason","android-interrupted");enqueue(c,old);state.put("running",false).put("reason","Tracking was interrupted. Tap Resume to continue.");Store.save(c,"timer",state);}}}
 static void enqueue(Context c,JSONObject row)throws Exception {synchronized(LOCK){JSONObject q=Store.read(c,"queue");JSONArray rows=q.optJSONArray("sessions");if(rows==null)rows=new JSONArray();JSONArray next=new JSONArray();for(int i=0;i<rows.length();i++)if(!rows.getJSONObject(i).getString("id").equals(row.getString("id")))next.put(rows.getJSONObject(i));next.put(new JSONObject(row.toString()));Store.save(c,"queue",new JSONObject().put("sessions",next));}}
 static void sync(Context source){Context c=source.getApplicationContext();network.execute(()->{try{
  if(Store.read(c,"account").optString("token").isEmpty())return;
  JSONArray rows; synchronized(LOCK){rows=Store.read(c,"queue").optJSONArray("sessions");}
  if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);Api.json(c,"/api/agent/sessions","POST",row);synchronized(LOCK){JSONArray current=Store.read(c,"queue").getJSONArray("sessions"),next=new JSONArray();for(int j=0;j<current.length();j++){JSONObject item=current.getJSONObject(j);if(!item.toString().equals(row.toString()))next.put(item);}Store.save(c,"queue",new JSONObject().put("sessions",next));}}
  File dir=new File(c.getFilesDir(),"outbox");File[] metaFiles=dir.listFiles((d,n)->n.endsWith(".json"));if(metaFiles!=null)for(File metaFile:metaFiles){JSONObject meta=new JSONObject(new String(read(metaFile),"UTF-8"));File file=new File(dir,meta.getString("id")+meta.getString("extension"));Api.upload(c,meta.getString("path"),file,meta,meta.getString("mime"));metaFile.delete();file.delete();}
  if(instance!=null)instance.error="";
 }catch(Exception e){if(instance!=null)instance.error="Sync pending. Check your connection and app version.";}});}
 static byte[] read(File file)throws Exception{try(InputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()){copy(in,out);return out.toByteArray();}}
 static void copy(InputStream in,OutputStream out)throws IOException{byte[] buf=new byte[65536];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);}
 @Override public void onCreate(){super.onCreate();instance=this;getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("tracking","Work tracking",NotificationManager.IMPORTANCE_LOW));registerReceiver(screen,new IntentFilter(Intent.ACTION_SCREEN_OFF));}
 @Override public int onStartCommand(Intent intent,int flags,int startId){if(intent==null){stopSelf();return START_NOT_STICKY;}if("pause".equals(intent.getAction())){pause("manual");return START_NOT_STICKY;}
  try{if(running)return START_NOT_STICKY;recover(this);JSONObject task=new JSONObject(intent.getStringExtra("task"));Intent permission=intent.getParcelableExtra("permission");
   int type=ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;if(permission!=null)type|=ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION;
   if(Build.VERSION.SDK_INT>=34)startForeground(1,notification(),type);else startForeground(1,notification());
   synchronized(LOCK){session=newSession(task,System.currentTimeMillis());running=true;elapsed=SystemClock.elapsedRealtime();checkpoint();}
   if(permission!=null){capture=new Capture(this,intent.getIntExtra("result",-1),permission);capture.start();}
   handler.postDelayed(tick,1000);
  }catch(Exception e){error="Tracking could not start. Reopen Chronexa and grant screen-sharing permission.";pause("android-capture-error");}return START_NOT_STICKY;
 }
 JSONObject newSession(JSONObject task,long now)throws Exception{return new JSONObject().put("id",UUID.randomUUID().toString()).put("startedAt",iso(now)).put("activeSeconds",0).put("idleSeconds",0).put("taskId",task.optString("taskId","")).put("taskNote",task.optString("taskNote","General work")).put("screenshotCount",0);}
 final Runnable tick=new Runnable(){public void run(){if(!running)return;try{checkpoint();if(capture!=null)capture.tick();if(SystemClock.elapsedRealtime()-lastSync>=30000){lastSync=SystemClock.elapsedRealtime();enqueue(TrackingService.this,session);sync(TrackingService.this);refreshPolicy();getSystemService(NotificationManager.class).notify(1,notification());}}catch(Exception e){error="Could not save tracking time. Tracking paused.";pause("android-storage-error");}if(running)handler.postDelayed(this,1000);}};
 void checkpoint()throws Exception{synchronized(LOCK){long now=System.currentTimeMillis();long current=SystemClock.elapsedRealtime();long delta=Math.max(0,(current-elapsed)/1000);elapsed+=delta*1000;
   long boundary=Instant.parse(session.getString("startedAt")).atZone(ZoneId.of("Asia/Dhaka")).toLocalDate().plusDays(1).atStartOfDay(ZoneId.of("Asia/Dhaka")).toInstant().toEpochMilli();
   if(now>=boundary){long before=Math.min(delta,Math.max(0,(boundary-(now-delta*1000))/1000));session.put("activeSeconds",session.optLong("activeSeconds")+before).put("endedAt",iso(boundary)).put("stopReason","day-boundary");enqueue(this,session);JSONObject task=session;session=newSession(task,boundary);delta-=before;}
   session.put("activeSeconds",Math.min(86400,session.optLong("activeSeconds")+delta));Store.save(this,"timer",new JSONObject().put("running",true).put("session",session).put("checkpoint",iso(now)).put("reason","").put("error",error));}}
 void refreshPolicy(){network.execute(()->{try{JSONObject policy=Api.json(this,"/api/agent/policy","GET",null);Store.save(this,"policy",policy);handler.post(()->{if(running&&capture==null&&(policy.optJSONObject("screenshots").optBoolean("enabled")||policy.optJSONObject("recording").optBoolean("enabled")))pause("android-permission-needed");});}catch(Exception ignored){}});}
 void pause(String reason){if(!running){stopSelf();return;}try{checkpoint();}catch(Exception ignored){}running=false;handler.removeCallbacks(tick);if(capture!=null){Capture old=capture;capture=null;old.close();}try{synchronized(LOCK){session.put("endedAt",iso(System.currentTimeMillis())).put("stopReason",reason);enqueue(this,session);Store.save(this,"timer",new JSONObject().put("running",false).put("session",session).put("error",error).put("reason",reason));}}catch(Exception e){error="Could not save the last checkpoint.";}sync(this);stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
 Notification notification(){Intent open=new Intent(this,MainActivity.class);PendingIntent content=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);PendingIntent pause=PendingIntent.getService(this,1,new Intent(this,TrackingService.class).setAction("pause"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);return new Notification.Builder(this,"tracking").setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle("Chronexa · Tracking work").setContentText("Screen sharing follows your team policy. Tap to view; Pause to stop.").setContentIntent(content).setOngoing(true).addAction(new Notification.Action.Builder(null,"Pause",pause).build()).build();}
 @Override public IBinder onBind(Intent intent){return null;}
 @Override public void onDestroy(){if(running)pause("android-service-stopped");handler.removeCallbacksAndMessages(null);try{unregisterReceiver(screen);}catch(Exception ignored){}instance=null;super.onDestroy();}
}
