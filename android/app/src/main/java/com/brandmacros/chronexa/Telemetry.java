package com.brandmacros.chronexa;
import android.content.Context;
import android.os.Build;
import java.security.MessageDigest;
import org.json.JSONObject;
final class Telemetry {
 static void report(Context c,boolean synced){try{
  JSONObject state=TrackingService.status(c),policy=Store.read(c,"policy"),screens=policy.optJSONObject("screenshots"),record=policy.optJSONObject("recording");if(screens==null||record==null)return;
  StringBuilder hash=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(policy.optString("version").getBytes("UTF-8")))hash.append(String.format("%02x",b));
  String now=TrackingService.iso(System.currentTimeMillis());boolean capturing=state.optBoolean("capture");
  JSONObject health=new JSONObject().put(synced?"lastSuccess":"lastFailure",now).put("failures",synced?0:1).put("code",synced?JSONObject.NULL:"NETWORK_FAILED");
  JSONObject data=new JSONObject().put("schemaVersion",1).put("appVersion",BuildConfig.VERSION_NAME).put("os","android").put("osRelease",Build.VERSION.RELEASE.replaceAll("[^a-zA-Z0-9._-]","_")).put("reportedAt",now).put("policyFingerprint",hash.toString()).put("tracking",state.optBoolean("running")?"running":"paused").put("idlePhase",state.optBoolean("running")?"active":"idle").put("syncEnabled",true)
   .put("pending",new JSONObject().put("sessions",Store.read(c,"queue").optJSONArray("sessions")==null?0:Store.read(c,"queue").getJSONArray("sessions").length()).put("other",TrackingService.mediaCount(c)))
   .put("capture",new JSONObject().put("screenshots",capturing&&screens.optBoolean("enabled")).put("screenshotMinutes",screens.optInt("intervalMinutes")).put("recording",capturing&&record.optBoolean("enabled")).put("recordingMode",record.optString("mode")).put("recordingMinutes",record.optInt("intervalMinutes")))
   .put("components",new JSONObject().put("app",new JSONObject().put("lastSuccess",now)).put("sync",health));
  Api.json(c,"/api/agent/diagnostics","POST",data);
 }catch(Exception ignored){}}
}
