package com.ounwan.app;

import android.Manifest;
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.SystemClock;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * 러닝 중 걸음 수(케이던스 계산용) — 휴대폰 하드웨어 걸음 센서(TYPE_STEP_COUNTER).
 * 센서 값은 '부팅 후 누적 걸음'이라 웹(run-tracker.ts)에서 달리는 구간의 차이만 더한다.
 * 화면이 꺼져 있어도 센서는 계속 세고, 러닝 위치 서비스가 앱을 살려 두므로 값이 이어진다.
 * 안드로이드 10+는 '신체 활동' 권한이 필요하다.
 */
@CapacitorPlugin(
        name = "StepCounter",
        permissions = {
                @Permission(alias = "activity", strings = {Manifest.permission.ACTIVITY_RECOGNITION})
        }
)
public class StepCounterPlugin extends Plugin implements SensorEventListener {

    private static final long NOTIFY_EVERY_MS = 1000;

    private SensorManager sensorManager;
    private boolean listening = false;
    private float last = -1;
    private long lastNotify = 0;

    private SensorManager sm() {
        if (sensorManager == null) {
            sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        }
        return sensorManager;
    }

    /** 걸음 센서 켜기(필요하면 권한 요청). {started, reason?} */
    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 29 && getPermissionState("activity") != PermissionState.GRANTED) {
            requestPermissionForAlias("activity", call, "activityPermissionCallback");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void activityPermissionCallback(PluginCall call) {
        if (getPermissionState("activity") == PermissionState.GRANTED) {
            begin(call);
        } else {
            JSObject r = new JSObject();
            r.put("started", false);
            r.put("reason", "denied");
            call.resolve(r);
        }
    }

    private void begin(PluginCall call) {
        JSObject r = new JSObject();
        SensorManager m = sm();
        Sensor sensor = m == null ? null : m.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        if (sensor == null) {
            r.put("started", false);
            r.put("reason", "no-sensor");
            call.resolve(r);
            return;
        }
        if (!listening) {
            last = -1;
            listening = m.registerListener(this, sensor, SensorManager.SENSOR_DELAY_UI);
        }
        r.put("started", listening);
        if (!listening) r.put("reason", "register-failed");
        call.resolve(r);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        release();
        call.resolve();
    }

    /** 가장 최근 센서 누적값(아직 없으면 steps 없음) */
    @PluginMethod
    public void read(PluginCall call) {
        if (listening) sm().flush(this);
        JSObject r = new JSObject();
        if (last >= 0) r.put("steps", (double) last);
        call.resolve(r);
    }

    private void release() {
        if (listening && sensorManager != null) sensorManager.unregisterListener(this);
        listening = false;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        last = event.values[0];
        long now = SystemClock.elapsedRealtime();
        if (now - lastNotify < NOTIFY_EVERY_MS) return;
        lastNotify = now;
        JSObject r = new JSObject();
        r.put("steps", (double) last);
        notifyListeners("step", r);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // 걸음 센서는 정확도 변화 없음
    }

    @Override
    protected void handleOnDestroy() {
        release();
        super.handleOnDestroy();
    }
}
