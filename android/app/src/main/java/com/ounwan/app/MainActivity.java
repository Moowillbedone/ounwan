package com.ounwan.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Health Connect가 '권한 사용 안내'를 열 때 → 웹의 건강 데이터 안내 화면으로
    private static final String HEALTH_PRIVACY_URL = "com.ounwan.app://open/health-privacy";

    private void routeHealthRationale(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if ("androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE".equals(action)
                || "android.intent.action.VIEW_PERMISSION_USAGE".equals(action)) {
            intent.setAction(Intent.ACTION_VIEW);
            intent.setData(Uri.parse(HEALTH_PRIVACY_URL));
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        routeHealthRationale(intent);
        super.onNewIntent(intent);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        routeHealthRationale(getIntent());
        // 자체 플러그인은 super.onCreate 전에 등록해야 웹에서 보인다
        registerPlugin(WidgetBridgePlugin.class);
        registerPlugin(SystemBarsPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(HealthStepsPlugin.class);
        super.onCreate(savedInstanceState);

        // Android 13+: 러닝 기록 중 알림(백그라운드 GPS 유지용)을 띄우려면 알림 권한 필요
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
        }
    }
}
