package com.ounwan.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 자체 플러그인은 super.onCreate 전에 등록해야 웹에서 보인다
        registerPlugin(WidgetBridgePlugin.class);
        super.onCreate(savedInstanceState);

        // Android 13+: 러닝 기록 중 알림(백그라운드 GPS 유지용)을 띄우려면 알림 권한 필요
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
        }
    }
}
