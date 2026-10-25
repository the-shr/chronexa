package com.brandmacros.chronexa;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
import java.util.concurrent.TimeUnit;

/** Uploads existing queue entries only. Never starts tracking or screen capture. */
public final class SyncWorker extends Worker {
 static final String QUEUE_WORK="chronexa-pending-sync", PERIODIC_WORK="chronexa-periodic-sync";
 public SyncWorker(@NonNull Context context,@NonNull WorkerParameters parameters){super(context,parameters);}
 @NonNull @Override public Result doWork(){return TrackingService.syncNow(getApplicationContext())?Result.success():Result.retry();}
 static Constraints constraints(){return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();}
 static void schedule(Context context){try{
  Context c=context.getApplicationContext();if(Store.read(c,"account").optString("token").isEmpty()||TrackingService.pending(c)==0)return;
  OneTimeWorkRequest request=new OneTimeWorkRequest.Builder(SyncWorker.class).setConstraints(constraints()).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build();
  WorkManager.getInstance(c).enqueueUniqueWork(QUEUE_WORK,ExistingWorkPolicy.KEEP,request);
 }catch(Exception ignored){}}
 static void initialize(Context context){try{
  Context c=context.getApplicationContext();if(Store.read(c,"account").optString("token").isEmpty())return;
  PeriodicWorkRequest request=new PeriodicWorkRequest.Builder(SyncWorker.class,15,TimeUnit.MINUTES).setConstraints(constraints()).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build();
  WorkManager.getInstance(c).enqueueUniquePeriodicWork(PERIODIC_WORK,ExistingPeriodicWorkPolicy.KEEP,request);
  TrackingService.sync(c);
 }catch(Exception ignored){}}
}
