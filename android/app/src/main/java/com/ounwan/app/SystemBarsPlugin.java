package com.ounwan.app;

import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 상태바·하단 버튼 영역 색을 앱에서 고른 테마(라이트/다크)에 맞춘다 (src/lib/native.ts 의 SystemBars).
 * 폰은 라이트인데 앱만 다크로 쓰는 경우에도 위아래 띠가 튀지 않게.
 */
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {

    // 웹 globals.css 의 --bg (라이트 / 다크)
    private static final int BG_LIGHT = 0xFFF6F7F9;
    private static final int BG_DARK = 0xFF0A0E13;

    @PluginMethod
    public void set(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        int color = dark ? BG_DARK : BG_LIGHT;
        // 테마 색상(연핑크 등)의 배경색을 넘기면 그 색으로
        String bg = call.getString("bg");
        if (bg != null && bg.matches("#[0-9a-fA-F]{6}")) color = 0xFF000000 | Integer.parseInt(bg.substring(1), 16);
        final int barColor = color;
        getActivity().runOnUiThread(() -> {
            Window w = getActivity().getWindow();
            // 안드로이드 15+: 웹뷰가 비켜 앉은 여백에 창 배경이 보인다
            w.getDecorView().setBackgroundColor(barColor);
            // 안드로이드 14 이하: 시스템 바 색을 직접 지정
            w.setStatusBarColor(barColor);
            w.setNavigationBarColor(barColor);
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
            c.setAppearanceLightStatusBars(!dark);
            c.setAppearanceLightNavigationBars(!dark);
            call.resolve();
        });
    }
}
