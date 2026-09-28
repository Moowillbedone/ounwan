package com.ounwan.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/** 1x1 연속기록 위젯. 큰 위젯과 같은 요약 데이터(WidgetBridgePlugin이 저장)를 쓴다. */
public class OunwanStreakWidgetProvider extends AppWidgetProvider {

    public static void refreshAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] ids = m.getAppWidgetIds(new ComponentName(ctx, OunwanStreakWidgetProvider.class));
        for (int id : ids) render(ctx, m, id);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) render(ctx, m, id);
    }

    static void render(Context ctx, AppWidgetManager m, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_streak);
        v.setOnClickPendingIntent(R.id.streak_root, OunwanWidgetProvider.openIntent(ctx, 10, "/"));

        JSONObject data = null;
        try {
            String raw = ctx.getSharedPreferences(OunwanWidgetProvider.PREFS, Context.MODE_PRIVATE)
                    .getString(OunwanWidgetProvider.KEY, null);
            if (raw != null) data = new JSONObject(raw);
        } catch (Exception ignored) {
        }

        if (data == null) {
            v.setTextViewText(R.id.streak_value, "🔥 –");
            v.setTextViewText(R.id.streak_sub, "앱을 열어 주세요");
        } else {
            int streak = data.optInt("streak", 0);
            JSONObject days = data.optJSONObject("days");
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Calendar.getInstance().getTime());
            boolean doneToday = days != null && days.optInt(today, 0) > 0;
            v.setTextViewText(R.id.streak_value, "🔥 " + streak);
            v.setTextViewText(R.id.streak_sub, doneToday ? "오늘 완료 ✓" : "일 연속");
        }
        m.updateAppWidget(id, v);
    }
}
