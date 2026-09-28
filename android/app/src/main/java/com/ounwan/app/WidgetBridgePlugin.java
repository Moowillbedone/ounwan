package com.ounwan.app;

import android.content.Context;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 웹앱 → 홈 화면 위젯 데이터 전달 (src/lib/native.ts 의 WidgetBridge).
 * 웹이 계산한 요약 JSON을 저장하고 위젯을 즉시 다시 그린다.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("data가 필요해요");
            return;
        }
        Context ctx = getContext();
        ctx.getSharedPreferences(OunwanWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(OunwanWidgetProvider.KEY, data)
                .apply();
        OunwanWidgetProvider.refreshAll(ctx);
        call.resolve();
    }
}
