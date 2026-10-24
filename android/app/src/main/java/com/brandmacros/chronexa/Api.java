package com.brandmacros.chronexa;

import android.content.Context;
import java.net.*;
import java.io.*;
import org.json.JSONObject;

final class Api {
 static final class Failure extends IOException { final int status;Failure(int status,String message){super(message);this.status=status;} }
 static final String BASE="https://chronexa-psi.vercel.app";
 static HttpURLConnection connection(Context c,String path,String method) throws Exception {
  if(!path.matches("/api/(agent/[A-Za-z0-9_/?=&.%:-]+|image/[A-Za-z0-9_-]+|recording/[A-Za-z0-9_-]+)"))throw new Exception("Invalid API path");
  HttpURLConnection con=(HttpURLConnection)new URL(BASE+path).openConnection();con.setInstanceFollowRedirects(false);con.setConnectTimeout(15000);con.setReadTimeout(45000);con.setRequestMethod(method);
  con.setRequestProperty("x-chronexa-version",BuildConfig.VERSION_NAME);con.setRequestProperty("x-chronexa-platform","android");
  String token=Store.read(c,"account").optString("token");if(!token.isEmpty())con.setRequestProperty("Authorization","Bearer "+token); return con;
 }
 static JSONObject json(Context c,String path,String method,JSONObject body) throws Exception {
  HttpURLConnection con=connection(c,path,method);
  try{if(body!=null){con.setDoOutput(true);con.setRequestProperty("Content-Type","application/json");try(OutputStream out=con.getOutputStream()){out.write(body.toString().getBytes("UTF-8"));}}
   int status=con.getResponseCode();InputStream in=status<400?con.getInputStream():con.getErrorStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream();if(in!=null){try(in){TrackingService.copy(in,bytes);}}String text=in==null?"{}":bytes.toString("UTF-8");JSONObject data=new JSONObject(text);
   if(status>=400)throw new Failure(status,data.optString("error","Request failed ("+status+")"));return data;
  }finally{con.disconnect();}
 }
 static void upload(Context c,String path,File file,JSONObject meta,String mime) throws Exception {
  String boundary="Chronexa"+java.util.UUID.randomUUID();HttpURLConnection con=connection(c,path,"POST");con.setDoOutput(true);con.setRequestProperty("Content-Type","multipart/form-data; boundary="+boundary);con.setChunkedStreamingMode(65536);
  try(OutputStream out=con.getOutputStream()){
   out.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"meta\"\r\n\r\n"+meta+"\r\n--"+boundary+"\r\nContent-Disposition: form-data; name=\"file\"; filename=\"capture"+(mime.equals("image/jpeg")?".jpg":".mp4")+"\"\r\nContent-Type: "+mime+"\r\n\r\n").getBytes("UTF-8"));
   try(InputStream in=new FileInputStream(file)){TrackingService.copy(in,out);}out.write(("\r\n--"+boundary+"--\r\n").getBytes("UTF-8"));
  }
  try{int status=con.getResponseCode();if(status>=400)throw new Failure(status,"Capture upload failed ("+status+")");}finally{con.disconnect();}
 }
}
