package com.brandmacros.chronexa;
import android.content.*;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
import org.json.JSONObject;

final class FloatingTimer {
 final TrackingService service;WindowManager manager;WindowManager.LayoutParams params;LinearLayout panel;TextView label;int size=200;
 FloatingTimer(TrackingService service){this.service=service;}
 void refresh(){try{
  boolean enabled=Store.read(service,"preferences").optBoolean("floating",false)&&Settings.canDrawOverlays(service);
  if(!enabled){close();return;}if(panel==null)open();long seconds=service.session.optLong("activeSeconds");label.setText(String.format(java.util.Locale.US,"◷ %02d:%02d:%02d",seconds/3600,seconds/60%60,seconds%60));
 }catch(Exception ignored){close();}}
 void open(){manager=(WindowManager)service.getSystemService(Context.WINDOW_SERVICE);panel=new LinearLayout(service);panel.setOrientation(LinearLayout.VERTICAL);panel.setPadding(dp(14),dp(10),dp(14),dp(8));GradientDrawable bg=new GradientDrawable();bg.setColor(0xdd221c31);bg.setCornerRadius(28);bg.setStroke(1,0x779d7be5);panel.setBackground(bg);label=new TextView(service);label.setTextColor(Color.WHITE);label.setTextSize(22);label.setGravity(Gravity.CENTER);panel.addView(label);LinearLayout actions=new LinearLayout(service);actions.setGravity(Gravity.CENTER);panel.addView(actions);
  Button pause=button("Pause"),smaller=button("−"),larger=button("+"),hide=button("×");for(Button b:new Button[]{pause,smaller,larger,hide})actions.addView(b,new LinearLayout.LayoutParams(0,dp(40),1));pause.setOnClickListener(v->service.pause("manual"));smaller.setOnClickListener(v->resize(-25));larger.setOnClickListener(v->resize(25));hide.setOnClickListener(v->{try{JSONObject p=Store.read(service,"preferences");p.put("floating",false);Store.save(service,"preferences",p);}catch(Exception ignored){}close();});
  params=new WindowManager.LayoutParams(dp(size),WindowManager.LayoutParams.WRAP_CONTENT,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,android.graphics.PixelFormat.TRANSLUCENT);params.gravity=Gravity.TOP|Gravity.START;params.x=dp(20);params.y=dp(180);
  label.setOnTouchListener(new View.OnTouchListener(){int x,y;float downX,downY;public boolean onTouch(View view,MotionEvent event){if(event.getAction()==MotionEvent.ACTION_DOWN){x=params.x;y=params.y;downX=event.getRawX();downY=event.getRawY();return true;}if(event.getAction()==MotionEvent.ACTION_MOVE){params.x=Math.max(0,Math.min(service.getResources().getDisplayMetrics().widthPixels-params.width,x+(int)(event.getRawX()-downX)));params.y=Math.max(0,Math.min(service.getResources().getDisplayMetrics().heightPixels-100,y+(int)(event.getRawY()-downY)));manager.updateViewLayout(panel,params);return true;}return true;}});manager.addView(panel,params);
 }
 Button button(String text){Button b=new Button(service);b.setText(text);b.setTextSize(10);b.setTextColor(Color.WHITE);b.setBackgroundColor(Color.TRANSPARENT);b.setPadding(0,0,0,0);b.setMinWidth(0);b.setMinimumWidth(0);return b;}
 int dp(int value){return Math.round(value*service.getResources().getDisplayMetrics().density);}
 void resize(int delta){size=Math.max(160,Math.min(350,size+delta));params.width=dp(size);label.setTextSize(Math.max(16,size/9f));manager.updateViewLayout(panel,params);}
 void close(){if(panel!=null){try{manager.removeView(panel);}catch(Exception ignored){}panel=null;}}
}
