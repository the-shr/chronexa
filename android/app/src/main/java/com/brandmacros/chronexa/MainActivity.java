package com.brandmacros.chronexa;

import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.webkit.*;
import androidx.webkit.WebViewAssetLoader;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public class MainActivity extends Activity {
 WebView web;
 final java.util.concurrent.ExecutorService worker=Executors.newSingleThreadExecutor();
 final java.util.concurrent.ExecutorService readers=Executors.newFixedThreadPool(3);
 final java.util.concurrent.ExecutorService local=Executors.newSingleThreadExecutor();
 String startRequest; JSONObject startPayload; boolean startNeedsCapture; volatile boolean overlayResumeRequested;
 AlertDialog startDialog;
 int nextPermissionRequest=100, overlayRequest, captureRequest;
 volatile CachedResponse policyResponse, attendanceResponse;
 static final class CachedResponse {
  final String token;
  final JSONObject data;
  final long at=SystemClock.elapsedRealtime();
  CachedResponse(String token,JSONObject data){this.token=token;this.data=data;}
  boolean fresh(String current,long ttl){return !current.isEmpty()&&token.equals(current)&&SystemClock.elapsedRealtime()-at<ttl;}
 }
 @Override public void onCreate(Bundle state){super.onCreate(state);overlayResumeRequested=getIntent().getBooleanExtra("resumeFromOverlay",false);
  web=new WebView(this);android.widget.FrameLayout frame=new android.widget.FrameLayout(this);frame.addView(web,new android.widget.FrameLayout.LayoutParams(-1,-1));setContentView(frame);if(Build.VERSION.SDK_INT>=30){getWindow().setDecorFitsSystemWindows(false);frame.setOnApplyWindowInsetsListener((view,insets)->{android.graphics.Insets bars=insets.getInsets(android.view.WindowInsets.Type.systemBars()|android.view.WindowInsets.Type.ime());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);return android.view.WindowInsets.CONSUMED;});}web.setBackgroundColor(0xff14131e);
  web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){if(request.getUrl().toString().startsWith("https://appassets.androidplatform.net/assets/"))return false;return true;}
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
    if("appassets.androidplatform.net".equals(request.getUrl().getHost())&&request.getUrl().getPath().startsWith("/media/")){
     try{String path=request.getUrl().getPath().substring(6);java.net.HttpURLConnection con=Api.connection(MainActivity.this,path,"GET");String range=request.getRequestHeaders().get("Range");if(range!=null)con.setRequestProperty("Range",range);int status=con.getResponseCode();if(status!=200&&status!=206){con.disconnect();return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",null,new java.io.ByteArrayInputStream(new byte[0]));}
      java.util.Map<String,String> headers=new java.util.HashMap<>();for(String key:new String[]{"Content-Length","Content-Range","Accept-Ranges"})if(con.getHeaderField(key)!=null)headers.put(key,con.getHeaderField(key));
      return new WebResourceResponse(con.getContentType().split(";")[0],null,status,status==206?"Partial Content":"OK",headers,new java.io.FilterInputStream(con.getInputStream()){@Override public void close()throws java.io.IOException{super.close();con.disconnect();}});
     }catch(Exception e){return new WebResourceResponse("text/plain","UTF-8",503,"Unavailable",null,new java.io.ByteArrayInputStream(new byte[0]));}
    }
    WebResourceResponse local=loader.shouldInterceptRequest(request.getUrl());return local!=null?local:new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",null,new java.io.ByteArrayInputStream(new byte[0]));
   }
  });
  web.addJavascriptInterface(new Bridge(),"ChronexaNative");web.loadUrl("https://appassets.androidplatform.net/assets/index.html");
  if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},22);
 }
 void reply(String id,boolean ok,Object result){runOnUiThread(()->{if(!isDestroyed())web.evaluateJavascript("window.__chronexaResult&&window.__chronexaResult("+JSONObject.quote(id)+","+ok+","+JSONObject.quote(String.valueOf(result))+")",null);});}
 boolean isReadRequest(String method,String raw){try{return method.equals("request")&&new JSONObject(raw).optString("method","GET").equals("GET");}catch(Exception ignored){return false;}}
 final class Bridge {
  @JavascriptInterface public void send(String id,String method,String raw){java.util.concurrent.ExecutorService executor=method.equals("status")||method.equals("account")?local:isReadRequest(method,raw)?readers:worker;
   executor.execute(()->{try{
   JSONObject payload=new JSONObject(raw);Object result;
   switch(method){
    case "account": {JSONObject saved=Store.read(MainActivity.this,"account");result=new JSONObject().put("user",saved.optJSONObject("user")).put("signedIn",!saved.optString("token").isEmpty()).put("version",BuildConfig.VERSION_NAME);break;}
    case "login": {if(!Store.read(MainActivity.this,"account").optString("token").isEmpty())throw new Exception("Sign out before changing accounts.");if(TrackingService.isRunning())throw new Exception("Pause tracking before changing accounts.");JSONObject body=new JSONObject().put("email",payload.getString("email")).put("password",payload.getString("password")).put("deviceName",Build.MANUFACTURER+" "+Build.MODEL+" Android").put("platform","android");JSONObject account=Api.json(MainActivity.this,"/api/agent/login","POST",body);Store.save(MainActivity.this,"account",account);SyncWorker.initialize(MainActivity.this);result=new JSONObject().put("user",account.getJSONObject("user"));break;}
    case "logout": {if(TrackingService.isRunning())throw new Exception("Pause tracking before signing out.");if(TrackingService.pending(MainActivity.this)>0)throw new Exception("Sync pending time and captures before signing out.");Store.save(MainActivity.this,"account",new JSONObject());for(String name:new String[]{"timer","history","policy","health","sync-state","activity-today"})Store.save(MainActivity.this,name,new JSONObject());result=new JSONObject();break;}
    case "request": {String path=payload.getString("path");String verb=payload.optString("method","GET");if(!path.startsWith("/api/agent/")||!(verb.equals("GET")||verb.equals("PATCH")||(verb.equals("POST")&&(path.matches("/api/agent/tasks/[A-Za-z0-9_%:-]+/comments")||path.equals("/api/agent/attendance")))))throw new Exception("Unsupported request");
     String token=Store.read(MainActivity.this,"account").optString("token");
     JSONObject response=Api.json(MainActivity.this,path,verb,payload.optJSONObject("body"));
     if(token.equals(Store.read(MainActivity.this,"account").optString("token"))){
      if(path.equals("/api/agent/activity?scope=today")&&response.has("date"))cacheToday(response);
      if(path.equals("/api/agent/policy"))policyResponse=new CachedResponse(token,response);
      if(path.equals("/api/agent/attendance"))attendanceResponse=new CachedResponse(token,response);
     }
     result=response;break;}
    case "floating": {JSONObject preferences=Store.read(MainActivity.this,"preferences");if(!preferences.has("floating"))preferences.put("floating",true);if(payload.has("enabled")){boolean enabled=payload.getBoolean("enabled");preferences.put("floating",enabled);Store.save(MainActivity.this,"preferences",preferences);if(enabled&&!android.provider.Settings.canDrawOverlays(MainActivity.this))runOnUiThread(()->startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,android.net.Uri.parse("package:"+getPackageName()))));if(TrackingService.instance!=null&&TrackingService.instance.floating!=null)TrackingService.instance.floating.refresh();}result=preferences;break;}
    case "open": {android.net.Uri uri=android.net.Uri.parse(payload.getString("url"));if(!"https".equals(uri.getScheme())&&!"http".equals(uri.getScheme()))throw new Exception("Unsupported link");runOnUiThread(()->startActivity(new Intent(Intent.ACTION_VIEW,uri)));result=new JSONObject();break;}
    case "consumeResume": {boolean requested=overlayResumeRequested&&!TrackingService.isRunning();overlayResumeRequested=false;JSONObject timer=Store.read(MainActivity.this,"timer");JSONObject previous=timer.optJSONObject("session");result=new JSONObject().put("requested",requested).put("task",new JSONObject().put("taskId",previous==null?"":previous.optString("taskId")).put("taskNote",previous==null?"General work":previous.optString("taskNote","General work")));break;}
    case "stop": {startService(new Intent(MainActivity.this,TrackingService.class).setAction("stop"));result=new JSONObject();break;}
    case "status": result=TrackingService.status(MainActivity.this);break;
    case "pause": {startService(new Intent(MainActivity.this,TrackingService.class).setAction("pause"));result=new JSONObject();break;}
    case "sync": {TrackingService.syncNow(MainActivity.this);result=TrackingService.status(MainActivity.this);break;}
    case "installUpdate": {
     JSONObject release=Api.json(MainActivity.this,"/api/agent/android-version","GET",null);String version=release.getString("latestVersion"),url=release.getString("downloadUrl"),sha=release.getString("downloadSha256");
     if(!version.matches("[0-9]+\\.[0-9]+\\.[0-9]+")||!url.equals("https://github.com/the-shr/chronexa/releases/download/v"+version+"/Chronexa.Android."+version+".apk")||!sha.matches("[a-f0-9]{64}"))throw new Exception("Invalid update information");
     java.io.File dir=new java.io.File(getCacheDir(),"updates");dir.mkdirs();java.io.File apk=new java.io.File(dir,"Chronexa.apk"),temp=new java.io.File(dir,"Chronexa.download");java.net.HttpURLConnection download=(java.net.HttpURLConnection)new java.net.URL(url).openConnection();download.setConnectTimeout(15000);download.setReadTimeout(60000);java.security.MessageDigest digest=java.security.MessageDigest.getInstance("SHA-256");
     try{if(download.getResponseCode()!=200)throw new Exception("Update download failed");try(java.io.InputStream in=download.getInputStream();java.io.OutputStream out=new java.io.FileOutputStream(temp)){byte[] buf=new byte[65536];int count;long total=0;while((count=in.read(buf))!=-1){total+=count;if(total>100*1024*1024)throw new Exception("Update is too large");digest.update(buf,0,count);out.write(buf,0,count);}}}finally{download.disconnect();}
     StringBuilder hex=new StringBuilder();for(byte b:digest.digest())hex.append(String.format("%02x",b));if(!sha.equals(hex.toString())){temp.delete();throw new Exception("Update checksum mismatch. Please retry.");}if(apk.exists())apk.delete();if(!temp.renameTo(apk))throw new Exception("Could not save update");
     runOnUiThread(()->{if(!getPackageManager().canRequestPackageInstalls()){startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,android.net.Uri.parse("package:"+getPackageName())));reply(id,false,"Allow Chronexa to install updates, then tap Download update again.");return;}Intent install=new Intent(Intent.ACTION_VIEW).setDataAndType(androidx.core.content.FileProvider.getUriForFile(MainActivity.this,getPackageName()+".files",apk),"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(install);reply(id,true,new JSONObject());});return;
    }
    case "start": {
     String token=Store.read(MainActivity.this,"account").optString("token");
     CachedResponse cached=policyResponse;
     JSONObject policy=cached!=null&&cached.fresh(token,20000)?cached.data:Api.json(MainActivity.this,"/api/agent/policy","GET",null);
     Store.save(MainActivity.this,"policy",policy);
     boolean capture=policy.getJSONObject("screenshots").optBoolean("enabled")||policy.getJSONObject("recording").optBoolean("enabled");
     runOnUiThread(()->{if(startRequest!=null){reply(id,false,"Another tracking request is open.");return;}if(TrackingService.isRunning()){reply(id,true,new JSONObject());return;}startRequest=id;startPayload=payload;startNeedsCapture=capture;startAttendancePolicy=policy;
      startDialog=new AlertDialog.Builder(MainActivity.this).setTitle("Start work tracking?").setMessage(capture?"Your work time and screen will be shared with your organisation according to its capture settings. Android will ask you to share your screen. Locking your phone or stopping screen sharing pauses tracking.":"Your work time will be shared with your organisation. Locking your phone pauses tracking.").setPositiveButton("Continue",(dialog,which)->{requestTrackingPermissions();}).setNegativeButton("Cancel",(dialog,which)->cancelStart()).setOnCancelListener(dialog->cancelStart()).show();
     });return;
    }
    case "cancelStart": {runOnUiThread(()->{if(payload.optString("id").equals(startRequest))cancelStart();});return;}
    default:throw new Exception("Unknown action");
   }reply(id,true,result);
  }catch(Exception e){reply(id,false,e.getMessage()==null?"Action failed":e.getMessage());}});}
 }
 JSONObject startAttendancePolicy;
 boolean checkedInForPeriod(JSONObject attendance,JSONObject policy)throws Exception{
  JSONObject work=policy.optJSONObject("work");org.json.JSONArray segments=work==null?null:work.optJSONArray("segments");
  if(segments==null||segments.length()==0){segments=new org.json.JSONArray();segments.put(new JSONObject().put("start",work==null?"09:00":work.optString("officeStart","09:00")).put("end",work==null?"17:00":work.optString("officeEnd","17:00")));}
  long current=periodStartFor(System.currentTimeMillis(),segments);
  org.json.JSONArray punches=attendance.optJSONArray("recentPunches");if(punches==null)punches=attendance.optJSONArray("punches");if(punches==null)return false;
  for(int i=0;i<punches.length();i++){String stamp=punches.getJSONObject(i).getString("checkedInAt");if(periodStartFor(java.time.Instant.parse(stamp).toEpochMilli(),segments)==current)return true;}
  return false;
 }
 long periodStartFor(long stamp,org.json.JSONArray segments)throws Exception{
  java.time.ZoneId zone=java.time.ZoneId.of("Asia/Dhaka");
  java.time.LocalDate date=java.time.Instant.ofEpochMilli(stamp).atZone(zone).toLocalDate();
  long inside=Long.MIN_VALUE,upcoming=Long.MAX_VALUE;
  for(int day=-1;day<=1;day++)for(int i=0;i<segments.length();i++){
   JSONObject row=segments.getJSONObject(i);int startMinute=minuteOf(row.getString("start")),endMinute=minuteOf(row.getString("end"));
   long dayStart=date.plusDays(day).atStartOfDay(zone).toInstant().toEpochMilli();
   long start=dayStart+startMinute*60000L,end=dayStart+(endMinute<=startMinute?endMinute+1440L:endMinute)*60000L;
   if(stamp>=start&&stamp<end)inside=start;
   if(start>stamp&&start<upcoming)upcoming=start;
  }
  return inside!=Long.MIN_VALUE?inside:upcoming;
 }
 int minuteOf(String clock){String[] parts=clock.split(":");return Integer.parseInt(parts[0])*60+Integer.parseInt(parts[1]);}
 void cacheToday(JSONObject data)throws Exception{
  org.json.JSONArray rows=data.getJSONArray("sessions"),todayRows=new org.json.JSONArray();
  for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);todayRows.put(new JSONObject().put("id",row.getString("id")).put("seconds",row.optLong("activeSeconds")+(data.optBoolean("countIdleAsWork")?row.optLong("idleSeconds"):0)));}
  Store.save(this,"activity-today",new JSONObject().put("date",data.getString("date")).put("sessions",todayRows));
 }
 int newPermissionRequest(){if(nextPermissionRequest>=65000)nextPermissionRequest=100;return nextPermissionRequest++;}
 void requestTrackingPermissions(){try{JSONObject preferences=Store.read(this,"preferences");if(!android.provider.Settings.canDrawOverlays(this)&&!preferences.optBoolean("overlayPermissionAsked")){preferences.put("overlayPermissionAsked",true);Store.save(this,"preferences",preferences);overlayRequest=newPermissionRequest();startActivityForResult(new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,android.net.Uri.parse("package:"+getPackageName())),overlayRequest);return;}requestCapture();}catch(Exception e){cancelStart();}}
 void requestCapture(){try{if(startNeedsCapture){captureRequest=newPermissionRequest();startActivityForResult(captureIntent(),captureRequest);}else begin(null,0);}catch(Exception e){cancelStart();}}
 @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if(intent.getBooleanExtra("resumeFromOverlay",false)){overlayResumeRequested=true;if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('chronexa-resume'))",null);}}
 void clearStart(){
  startRequest=null;startPayload=null;startAttendancePolicy=null;
  overlayRequest=0;captureRequest=0;
  if(startDialog!=null){startDialog.dismiss();startDialog=null;}
 }
 void cancelStart(){if(startRequest!=null)reply(startRequest,false,"Tracking was not started.");clearStart();}
 Intent captureIntent(){MediaProjectionManager manager=(MediaProjectionManager)getSystemService(MEDIA_PROJECTION_SERVICE);return Build.VERSION.SDK_INT>=34?manager.createScreenCaptureIntent(android.media.projection.MediaProjectionConfig.createConfigForDefaultDisplay()):manager.createScreenCaptureIntent();}
 void begin(Intent permission,int code){
  final JSONObject policy=startAttendancePolicy; startAttendancePolicy=null;
  final String request=startRequest;
  if(policy==null||request==null)return;
  worker.execute(()->{try{
   String token=Store.read(this,"account").optString("token");
   CachedResponse cached=attendanceResponse;
   JSONObject attendance=cached!=null&&cached.fresh(token,300000)&&checkedInForPeriod(cached.data,policy)
     ?cached.data:Api.json(this,"/api/agent/attendance","GET",null);
   if(!checkedInForPeriod(attendance,policy))attendance=Api.json(this,"/api/agent/attendance","POST",null);
   if(!checkedInForPeriod(attendance,policy))throw new Exception("Check-in was not recorded for this duty period. Please retry.");
   if(cached==null||attendance!=cached.data)attendanceResponse=new CachedResponse(token,attendance);
   final JSONObject result=new JSONObject().put("attendance",attendance);
   runOnUiThread(()->{if(request!=null&&request.equals(startRequest))launchTracking(permission,code,result);});
  }catch(Exception e){runOnUiThread(()->{if(request.equals(startRequest)){reply(request,false,e.getMessage()==null?"Check-in failed. Please retry.":e.getMessage());clearStart();}});}});
 }
 void launchTracking(Intent permission,int code,JSONObject result){try{Intent intent=new Intent(this,TrackingService.class).setAction("start").putExtra("task",startPayload.toString());if(permission!=null)intent.putExtra("permission",permission).putExtra("result",code);startForegroundService(intent);reply(startRequest,true,result);}catch(Exception e){reply(startRequest,false,"Could not start tracking. Please try again.");}finally{clearStart();}}
 @Override protected void onActivityResult(int request,int result,Intent data){
  super.onActivityResult(request,result,data);
  if(startRequest==null)return;
  if(request==overlayRequest){overlayRequest=0;requestCapture();}
  else if(request==captureRequest){captureRequest=0;if(result==RESULT_OK&&data!=null)begin(data,result);else cancelStart();}
 }
 @Override public void onBackPressed(){web.evaluateJavascript("window.dispatchEvent(new Event('chronexa-back'))",null);}
 @Override protected void onResume(){super.onResume();worker.execute(()->SyncWorker.initialize(MainActivity.this));if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('chronexa-active'))",null);}
 @Override protected void onDestroy(){web.removeJavascriptInterface("ChronexaNative");web.destroy();worker.shutdown();readers.shutdown();local.shutdown();super.onDestroy();}
}
