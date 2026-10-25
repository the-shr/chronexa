package com.brandmacros.chronexa;

import android.content.*;
import android.graphics.*;
import android.graphics.drawable.*;
import android.provider.Settings;
import android.view.*;
import android.widget.*;

final class FloatingTimer {
 final TrackingService service;
 WindowManager manager;WindowManager.LayoutParams params;
 LinearLayout panel,actions;TextView label;ImageButton play;
 boolean expanded,hidden;
 int lastX=20,lastY=180;
 FloatingTimer(TrackingService service){this.service=service;lastX=dp(20);lastY=dp(180);}
 void newSession(){hidden=false;setExpanded(false);refresh();}
 void refresh(){try{
  if(hidden||!Settings.canDrawOverlays(service)){close();return;}
  if(panel==null)open();
  renderTime(TrackingService.todaySeconds(service));
  play.setImageDrawable(new ControlIcon(service.running?0:1));
  play.setContentDescription(service.running?"Pause tracking":"Resume tracking");
 }catch(Exception ignored){close();}}
 void renderTime(long seconds){if(label!=null)label.setText(String.format(java.util.Locale.US,"%02d:%02d:%02d",seconds/3600,seconds/60%60,seconds%60));}
 void open(){
  manager=(WindowManager)service.getSystemService(Context.WINDOW_SERVICE);
  panel=new LinearLayout(service);panel.setOrientation(LinearLayout.HORIZONTAL);panel.setGravity(Gravity.CENTER_VERTICAL);panel.setPadding(dp(8),dp(6),dp(8),dp(6));
  GradientDrawable bg=new GradientDrawable();bg.setColor(0xea211d30);bg.setCornerRadius(dp(26));bg.setStroke(dp(1),0x669b86d8);panel.setBackground(bg);panel.setElevation(dp(8));
  label=new TextView(service);label.setTextColor(Color.WHITE);label.setTextSize(21);label.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));label.setGravity(Gravity.CENTER);label.setContentDescription("Timer. Tap for controls, drag to move");
  panel.addView(label,new LinearLayout.LayoutParams(dp(120),dp(38)));
  actions=new LinearLayout(service);actions.setGravity(Gravity.CENTER);panel.addView(actions);actions.setVisibility(View.GONE);
  play=button(0,"Pause tracking");ImageButton stop=button(2,"Stop tracking"),hide=button(3,"Hide timer until next play");
  for(ImageButton button:new ImageButton[]{play,stop,hide})actions.addView(button,new LinearLayout.LayoutParams(dp(36),dp(36)));
  play.setOnClickListener(v->{setExpanded(false);if(service.running)service.pause("manual");else service.openResume();});
  stop.setOnClickListener(v->{setExpanded(false);service.stopTracking();});
  hide.setOnClickListener(v->{hidden=true;setExpanded(false);close();if(!service.running)service.stopTrackingWindow();});
  params=new WindowManager.LayoutParams(dp(136),dp(50),WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL|WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,PixelFormat.TRANSLUCENT);
  params.gravity=Gravity.TOP|Gravity.START;params.x=lastX;params.y=lastY;
  panel.setOnTouchListener((view,event)->{if(event.getAction()==MotionEvent.ACTION_OUTSIDE){setExpanded(false);return true;}return false;});
  label.setOnTouchListener(new View.OnTouchListener(){int x,y;float downX,downY;boolean moved;
   public boolean onTouch(View view,MotionEvent event){
    if(event.getAction()==MotionEvent.ACTION_DOWN){x=params.x;y=params.y;downX=event.getRawX();downY=event.getRawY();moved=false;return true;}
    if(event.getAction()==MotionEvent.ACTION_MOVE){float dx=event.getRawX()-downX,dy=event.getRawY()-downY;if(Math.hypot(dx,dy)>ViewConfiguration.get(service).getScaledTouchSlop())moved=true;if(moved){params.x=x+(int)dx;params.y=y+(int)dy;clamp();manager.updateViewLayout(panel,params);}return true;}
    if(event.getAction()==MotionEvent.ACTION_UP){lastX=params.x;lastY=params.y;if(!moved){view.performClick();setExpanded(!expanded);}return true;}
    return event.getAction()==MotionEvent.ACTION_CANCEL;
   }});
  manager.addView(panel,params);
 }
 void setExpanded(boolean value){expanded=value;if(panel==null)return;actions.setVisibility(value?View.VISIBLE:View.GONE);params.width=dp(value?244:136);clamp();manager.updateViewLayout(panel,params);}
 void clamp(){int width=service.getResources().getDisplayMetrics().widthPixels,height=service.getResources().getDisplayMetrics().heightPixels;params.width=Math.min(params.width,width-dp(16));params.x=Math.max(0,Math.min(params.x,width-params.width));params.y=Math.max(0,Math.min(params.y,height-dp(80)));}
 ImageButton button(int kind,String description){ImageButton button=new ImageButton(service);button.setImageDrawable(new ControlIcon(kind));button.setContentDescription(description);button.setPadding(dp(9),dp(9),dp(9),dp(9));GradientDrawable bg=new GradientDrawable();bg.setColor(kind==0?0x227e67cf:Color.TRANSPARENT);bg.setCornerRadius(dp(18));button.setBackground(bg);return button;}
 int dp(int value){return Math.round(value*service.getResources().getDisplayMetrics().density);}
 void close(){if(panel!=null){lastX=params.x;lastY=params.y;try{manager.removeView(panel);}catch(Exception ignored){}panel=null;actions=null;label=null;play=null;}expanded=false;}
 static final class ControlIcon extends Drawable {
  final int kind;final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);ControlIcon(int kind){this.kind=kind;paint.setColor(Color.WHITE);paint.setStrokeWidth(2);paint.setStrokeCap(Paint.Cap.ROUND);}
  @Override public void draw(Canvas canvas){canvas.save();canvas.translate(getBounds().left,getBounds().top);canvas.scale(getBounds().width()/24f,getBounds().height()/24f);paint.setStyle(Paint.Style.STROKE);if(kind==0){canvas.drawLine(8,6,8,18,paint);canvas.drawLine(16,6,16,18,paint);}else if(kind==1){Path path=new Path();path.moveTo(8,5);path.lineTo(19,12);path.lineTo(8,19);path.close();canvas.drawPath(path,paint);}else if(kind==2)canvas.drawRoundRect(6,6,18,18,2,2,paint);else{canvas.drawLine(7,7,17,17,paint);canvas.drawLine(17,7,7,17,paint);}canvas.restore();}
  @Override public void setAlpha(int alpha){paint.setAlpha(alpha);}@Override public void setColorFilter(ColorFilter filter){paint.setColorFilter(filter);}@Override public int getOpacity(){return PixelFormat.TRANSLUCENT;}
 }
}
