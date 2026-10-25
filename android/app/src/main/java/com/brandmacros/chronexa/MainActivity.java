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
 String startRequest; JSONObject startPayload;
 @Override public void onCreate(Bundle state){super.onCreate(state);
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
 final class Bridge {
  @JavascriptInterface public void send(String id,String method,String raw){worker.execute(()->{try{
   JSONObject payload=new JSONObject(raw);Object result;
   switch(method){
    case "account": {JSONObject saved=Store.read(MainActivity.this,"account");result=new JSONObject().put("user",saved.optJSONObject("user")).put("signedIn",!saved.optString("token").isEmpty()).put("version",BuildConfig.VERSION_NAME);break;}
    case "login": {if(!Store.read(MainActivity.this,"account").optString("token").isEmpty())throw new Exception("Sign out before changing accounts.");if(TrackingService.isRunning())throw new Exception("Pause tracking before changing accounts.");JSONObject body=new JSONObject().put("email",payload.getString("email")).put("password",payload.getString("password")).put("deviceName",Build.MANUFACTURER+" "+Build.MODEL+" Android").put("platform","android");JSONObject account=Api.json(MainActivity.this,"/api/agent/login","POST",body);Store.save(MainActivity.this,"account",account);SyncWorker.initialize(MainActivity.this);result=new JSONObject().put("user",account.getJSONObject("user"));break;}
    case "logout": {if(TrackingService.isRunning())throw new Exception("Pause tracking before signing out.");if(TrackingService.pending(MainActivity.this)>0)throw new Exception("Sync pending time and captures before signing out.");Store.save(MainActivity.this,"account",new JSONObject());for(String name:new String[]{"timer","history","policy","health","sync-state"})Store.save(MainActivity.this,name,new JSONObject());result=new JSONObject();break;}
    case "request": {String path=payload.getString("path");String verb=payload.optString("method","GET");if(!path.startsWith("/api/agent/")||!(verb.equals("GET")||verb.equals("PATCH")||(verb.equals("POST")&&path.matches("/api/agent/tasks/[A-Za-z0-9_%:-]+/comments"))))throw new Exception("Unsupported request");result=Api.json(MainActivity.this,path,verb,payload.optJSONObject("body"));break;}
    case "floating": {JSONObject preferences=Store.read(MainActivity.this,"preferences");if(payload.has("enabled")){boolean enabled=payload.getBoolean("enabled");if(enabled&&!android.provider.Settings.canDrawOverlays(MainActivity.this)){runOnUiThread(()->startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,android.net.Uri.parse("package:"+getPackageName()))));throw new Exception("Allow display over other apps, then enable the floating timer.");}preferences.put("floating",enabled);Store.save(MainActivity.this,"preferences",preferences);}result=preferences;break;}
    case "open": {android.net.Uri uri=android.net.Uri.parse(payload.getString("url"));if(!"https".equals(uri.getScheme())&&!"http".equals(uri.getScheme()))throw new Exception("Unsupported link");runOnUiThread(()->startActivity(new Intent(Intent.ACTION_VIEW,uri)));result=new JSONObject();break;}
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
     JSONObject policy=Api.json(MainActivity.this,"/api/agent/policy","GET",null);Store.save(MainActivity.this,"policy",policy);
     boolean capture=policy.getJSONObject("screenshots").optBoolean("enabled")||policy.getJSONObject("recording").optBoolean("enabled");
     runOnUiThread(()->{if(startRequest!=null){reply(id,false,"Another tracking request is open.");return;}startRequest=id;startPayload=payload;
      new AlertDialog.Builder(MainActivity.this).setTitle("Start work tracking?").setMessage(capture?"Your work time and screen will be shared with your organisation according to its capture settings. Android will ask you to share your screen. Locking your phone or stopping screen sharing pauses tracking.":"Your work time will be shared with your organisation. Locking your phone pauses tracking.").setPositiveButton("Continue",(dialog,which)->{if(capture){MediaProjectionManager manager=(MediaProjectionManager)getSystemService(MEDIA_PROJECTION_SERVICE);startActivityForResult(captureIntent(),31);}else begin(null,0);}).setNegativeButton("Cancel",(dialog,which)->cancelStart()).setOnCancelListener(dialog->cancelStart()).show();
     });return;
    }
    default:throw new Exception("Unknown action");
   }reply(id,true,result);
  }catch(Exception e){reply(id,false,e.getMessage()==null?"Action failed":e.getMessage());}});}
 }
 void cancelStart(){reply(startRequest,false,"Tracking was not started.");startRequest=null;startPayload=null;}
 Intent captureIntent(){MediaProjectionManager manager=(MediaProjectionManager)getSystemService(MEDIA_PROJECTION_SERVICE);return Build.VERSION.SDK_INT>=34?manager.createScreenCaptureIntent(android.media.projection.MediaProjectionConfig.createConfigForDefaultDisplay()):manager.createScreenCaptureIntent();}
 void begin(Intent permission,int code){try{Intent intent=new Intent(this,TrackingService.class).setAction("start").putExtra("task",startPayload.toString());if(permission!=null)intent.putExtra("permission",permission).putExtra("result",code);startForegroundService(intent);reply(startRequest,true,new JSONObject());}catch(Exception e){reply(startRequest,false,"Could not start tracking. Please try again.");}finally{startRequest=null;startPayload=null;}}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==31){if(result==RESULT_OK&&data!=null)begin(data,result);else cancelStart();}}
 @Override public void onBackPressed(){web.evaluateJavascript("window.dispatchEvent(new Event('chronexa-back'))",null);}
 @Override protected void onResume(){super.onResume();worker.execute(()->SyncWorker.initialize(MainActivity.this));if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('chronexa-active'))",null);}
 @Override protected void onDestroy(){web.removeJavascriptInterface("ChronexaNative");web.destroy();worker.shutdown();super.onDestroy();}
}
