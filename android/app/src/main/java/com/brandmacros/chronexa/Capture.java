package com.brandmacros.chronexa;

import android.content.*;
import android.graphics.*;
import android.hardware.display.*;
import android.media.*;
import android.media.projection.*;
import android.os.*;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import java.io.*;
import java.nio.ByteBuffer;
import java.util.UUID;
import org.json.JSONObject;

/** One user-approved projection per tracking run; its display changes surfaces between clips. */
final class Capture {
 final TrackingService service;final int code;final Intent permission;final Handler handler=new Handler(Looper.getMainLooper());
 MediaProjection projection;VirtualDisplay display;ImageReader images;MediaRecorder recorder;File video;long videoAt,lastShot,lastClip;int width,height;boolean closed;
 Capture(TrackingService service,int code,Intent permission){this.service=service;this.code=code;this.permission=permission;}
 void start()throws Exception{
  if(closed||!service.running)throw new IllegalStateException("Tracking must be running before screen capture starts");
  DisplayMetrics metrics=new DisplayMetrics();((WindowManager)service.getSystemService(Context.WINDOW_SERVICE)).getDefaultDisplay().getRealMetrics(metrics);
  float ratio=Math.min(1f,720f/Math.max(metrics.widthPixels,metrics.heightPixels));width=Math.max(2,((int)(metrics.widthPixels*ratio)/2)*2);height=Math.max(2,((int)(metrics.heightPixels*ratio)/2)*2);
  images=ImageReader.newInstance(width,height,PixelFormat.RGBA_8888,2);
  projection=((MediaProjectionManager)service.getSystemService(Context.MEDIA_PROJECTION_SERVICE)).getMediaProjection(code,permission);
  projection.registerCallback(new MediaProjection.Callback(){@Override public void onStop(){if(!closed)service.pause("android-screen-sharing-stopped");}},handler);
  display=projection.createVirtualDisplay("Chronexa screen sharing",width,height,metrics.densityDpi,DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,images.getSurface(),null,handler);
  lastShot=SystemClock.elapsedRealtime()-120000;lastClip=SystemClock.elapsedRealtime();
 }
 void tick()throws Exception{
  if(closed||!service.running)return;JSONObject policy=Store.read(service,"policy"),screens=policy.getJSONObject("screenshots"),record=policy.getJSONObject("recording");long now=SystemClock.elapsedRealtime();
  if(recorder!=null){long duration=record.optString("mode").equals("session")?60000:Math.max(2000,Math.min(60000,record.optLong("durationSeconds",5)*1000));if(!record.optBoolean("enabled")||now-videoAt>=duration){stopClip();return;}else return;}
  try(Image image=images.acquireLatestImage()){
   if(screens.optBoolean("enabled")&&now-lastShot>=Math.max(60000,screens.optLong("intervalMinutes",3)*60000)&&image!=null){
    Image.Plane plane=image.getPlanes()[0];int padded=plane.getRowStride()/plane.getPixelStride();ByteBuffer bytes=plane.getBuffer();Bitmap bitmap=Bitmap.createBitmap(padded,height,Bitmap.Config.ARGB_8888);bitmap.copyPixelsFromBuffer(bytes);Bitmap crop=Bitmap.createBitmap(bitmap,0,0,width,height);
    if(screens.optBoolean("blur")){Bitmap small=Bitmap.createScaledBitmap(crop,Math.max(1,width/24),Math.max(1,height/24),true);Bitmap blurred=Bitmap.createScaledBitmap(small,width,height,true);if(crop!=bitmap)crop.recycle();small.recycle();crop=blurred;}
    String id=UUID.randomUUID().toString();File file=file(id+".jpg");try(OutputStream out=new FileOutputStream(file)){crop.compress(Bitmap.CompressFormat.JPEG,Math.max(10,Math.min(90,screens.optInt("quality",65))),out);}if(crop!=bitmap)crop.recycle();bitmap.recycle();
    JSONObject meta=meta(id).put("capturedAt",TrackingService.iso(System.currentTimeMillis())).put("monitorLabel","Android shared screen").put("blurred",screens.optBoolean("blur")).put("activityPercent",JSONObject.NULL);queue(file,meta,"/api/agent/screenshots","image/jpeg",".jpg");Telemetry.health(service,"screenshots",null);service.session.put("screenshotCount",service.session.optInt("screenshotCount")+1);lastShot=now;
   }
  }
  if(record.optBoolean("enabled")&&(record.optString("mode").equals("session")||now-lastClip>=Math.max(60000,record.optLong("intervalMinutes",10)*60000)))startClip();
 }
 File file(String name)throws Exception{File dir=new File(service.getFilesDir(),"outbox");if(!dir.exists()&&!dir.mkdirs())throw new IOException("Capture storage unavailable");long size=0;File[] files=dir.listFiles();if(files!=null)for(File f:files)size+=f.length();if(size>250L*1024*1024)throw new IOException("Capture storage full. Sync before continuing.");return new File(dir,name);}
 JSONObject meta(String id)throws Exception{return new JSONObject().put("id",id).put("sessionId",service.session.getString("id")).put("width",width).put("height",height);}
 void queue(File file,JSONObject meta,String path,String mime,String extension)throws Exception{
  meta.put("path",path).put("mime",mime).put("extension",extension);File dest=new File(file.getParentFile(),meta.getString("id")+".json"),temp=new File(dest.getPath()+".tmp");try(FileOutputStream out=new FileOutputStream(temp)){out.write(meta.toString().getBytes("UTF-8"));out.getFD().sync();}if(!temp.renameTo(dest))throw new IOException("Could not queue capture");
 }
 void startClip()throws Exception{
  if(closed||!service.running)return;
  video=file(UUID.randomUUID()+".mp4");recorder=new MediaRecorder();recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);recorder.setVideoSize(width,height);recorder.setVideoFrameRate(10);recorder.setVideoEncodingBitRate(350000);recorder.setOutputFile(video.getPath());recorder.prepare();display.setSurface(recorder.getSurface());recorder.start();videoAt=SystemClock.elapsedRealtime();
 }
 void stopClip()throws Exception{
  MediaRecorder current=recorder;recorder=null;if(current==null)return;long duration=SystemClock.elapsedRealtime()-videoAt;try{display.setSurface(closed||!service.running?null:images.getSurface());}catch(RuntimeException ignored){}boolean valid=true;try{current.stop();}catch(RuntimeException e){valid=false;}finally{current.release();}lastClip=SystemClock.elapsedRealtime();
  if(valid&&duration>=1000&&video.length()>0&&video.length()<4*1024*1024){String id=video.getName().replace(".mp4","");queue(video,meta(id).put("startedAt",TrackingService.iso(System.currentTimeMillis()-duration)).put("durationMs",duration),"/api/agent/recordings","video/mp4",".mp4");Telemetry.health(service,"recording",null);}else video.delete();
 }
 void close(){closed=true;if(display!=null)try{display.setSurface(null);}catch(Exception ignored){}try{stopClip();}catch(Exception ignored){}if(display!=null)display.release();if(images!=null)images.close();if(projection!=null)projection.stop();}
}
