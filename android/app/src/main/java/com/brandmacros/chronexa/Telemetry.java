package com.brandmacros.chronexa;
import android.content.Context;
import android.os.Build;
import java.security.MessageDigest;
import org.json.JSONObject;
final class Telemetry {
 static String code(Exception e){if(e instanceof Api.Failure){switch(((Api.Failure)e).status){case 401:return "SIGNED_OUT";case 426:return "UPDATE_REQUIRED";case 413:return "FILE_TOO_LARGE";case 429:return "RATE_LIMITED";case 501:return "SERVER_NOT_CONFIGURED";default:return "SERVER_REJECTED";}}return "NETWORK_FAILED";}
 static synchronized void health(Context c,String name,String code){try{JSONObject all=Store.read(c,"health"),row=all.optJSONObject(name);if(row==null)row=new JSONObject();row.put(code==null?"lastSuccess":"lastFailure",TrackingService.iso(System.currentTimeMillis())).put("code",code==null?JSONObject.NULL:code).put("failures",code==null?row.optInt("failures"):Math.min(1000000,row.optInt("failures")+1));all.put(name,row);Store.save(c,"health",all);}catch(Exception ignored){}}
 static void report(Context c,boolean synced){try{
  JSONObject state=TrackingService.status(c),policy=Store.read(c,"policy"),screens=policy.optJSONObject("screenshots"),record=policy.optJSONObject("recording");if(screens==null||record==null)return;
  StringBuilder hash=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(policy.optString("version").getBytes("UTF-8")))hash.append(String.format("%02x",b));
  String now=TrackingService.iso(System.currentTimeMillis());boolean capturing=state.optBoolean("capture");
  JSONObject health=new JSONObject().put(synced?"lastSuccess":"lastFailure",now).put("failures",synced?0:1).put("code",synced?JSONObject.NULL:"NETWORK_FAILED");
  JSONObject data=new JSONObject().put("schemaVersion",1).put("appVersion",BuildConfig.VERSION_NAME).put("os","android").put("osRelease",Build.VERSION.RELEASE.replaceAll("[^a-zA-Z0-9._-]","_")).put("reportedAt",now).put("policyFingerprint",hash.toString()).put("tracking",state.optBoolean("running")?"running":"paused").put("idlePhase",state.optBoolean("running")?"active":"idle").put("syncEnabled",true)
   .put("pending",new JSONObject().put("sessions",Store.read(c,"queue").optJSONArray("sessions")==null?0:Store.read(c,"queue").getJSONArray("sessions").length()).put("other",TrackingService.mediaCount(c)))
   .put("capture",new JSONObject().put("screenshots",capturing&&screens.optBoolean("enabled")).put("screenshotMinutes",screens.optInt("intervalMinutes")).put("recording",capturing&&record.optBoolean("enabled")).put("recordingMode",record.optString("mode")).put("recordingMinutes",record.optInt("intervalMinutes")))
   .put("components",Store.read(c,"health").put("app",new JSONObject().put("lastSuccess",now)));
  Api.json(c,"/api/agent/diagnostics","POST",data);
 }catch(Exception ignored){}}
}
