package com.ounwan.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Bundle;

import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * 오운완 홈 화면 위젯.
 * 웹앱이 WidgetBridgePlugin으로 넘긴 요약(JSON)을 SharedPreferences에서 읽어 그린다.
 * { v, streak, weekStartsOn(0=일,1=월), days: { "YYYY-MM-DD": 잔디단계1~4 } }
 * 오늘/이번 달/잔디 격자는 여기서 날짜 기준으로 다시 계산 → 자정이 지나도 정확.
 */
public class OunwanWidgetProvider extends AppWidgetProvider {

    static final String PREFS = "ounwan_widget";
    static final String KEY = "summary";
    static final String OPEN_URL = "com.ounwan.app://open";

    // 웹 globals.css 잔디 색(--grass-0 ~ --grass-4)과 동일
    private static final int[] GRASS_LIGHT = {0xFFE6E9ED, 0xFF9FE2BF, 0xFF3FC98A, 0xFF12915D, 0xFF084027};
    private static final int[] GRASS_DARK = {0xFF39424F, 0xFF15693F, 0xFF26A668, 0xFF3FD189, 0xFF83F0C6};

    /** 앱에서 데이터가 바뀌었을 때 모든 위젯을 즉시 다시 그린다. */
    public static void refreshAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] ids = m.getAppWidgetIds(new ComponentName(ctx, OunwanWidgetProvider.class));
        for (int id : ids) render(ctx, m, id);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) render(ctx, m, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager m, int id, Bundle newOptions) {
        render(ctx, m, id); // 크기를 바꾸면 잔디 주(週) 수를 다시 맞춤
    }

    static void render(Context ctx, AppWidgetManager m, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_ounwan);
        v.setOnClickPendingIntent(R.id.widget_root, openIntent(ctx, 0, "/"));
        v.setOnClickPendingIntent(R.id.widget_btn_log, openIntent(ctx, 1, "/log"));
        v.setOnClickPendingIntent(R.id.widget_btn_run, openIntent(ctx, 2, "/run"));

        JSONObject data = null;
        try {
            String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
            if (raw != null) data = new JSONObject(raw);
        } catch (Exception ignored) {
        }

        if (data == null) {
            v.setTextViewText(R.id.widget_streak, ctx.getString(R.string.widget_loading));
            v.setTextViewText(R.id.widget_month, "");
            v.setTextViewText(R.id.widget_today, "기록이 여기에 표시돼요");
            m.updateAppWidget(id, v);
            return;
        }

        JSONObject days = data.optJSONObject("days");
        if (days == null) days = new JSONObject();
        int weekStartsOn = data.optInt("weekStartsOn", 1);
        int streak = data.optInt("streak", 0);

        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        Calendar today = Calendar.getInstance();
        String todayKey = fmt.format(today.getTime());
        String monthPrefix = todayKey.substring(0, 8); // "YYYY-MM-"

        int monthDays = 0;
        java.util.Iterator<String> keys = days.keys();
        while (keys.hasNext()) {
            String k = keys.next();
            if (k.startsWith(monthPrefix) && days.optInt(k, 0) > 0) monthDays++;
        }

        v.setTextViewText(R.id.widget_streak, streak > 0 ? "🔥 " + streak + "일 연속" : "오늘부터 시작해요 💪");
        v.setTextViewText(R.id.widget_month, "이번 달 " + monthDays + "일");
        v.setTextViewText(R.id.widget_today,
                days.optInt(todayKey, 0) > 0 ? "✅ 오늘 운동 완료!" : "오늘은 아직 운동 전이에요");

        // 위젯 폭에 맞춰 보여줄 주 수(대략 칸당 16dp)
        Bundle opts = m.getAppWidgetOptions(id);
        int widthDp = opts != null ? opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250) : 250;
        if (widthDp <= 0) widthDp = 250;
        int weeks = Math.max(6, Math.min(17, (widthDp - 28) / 16));

        boolean night = (ctx.getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        v.setImageViewBitmap(R.id.widget_grass,
                drawGrass(days, weekStartsOn, weeks, todayKey, fmt, night ? GRASS_DARK : GRASS_LIGHT, night));

        m.updateAppWidget(id, v);
    }

    /** 웹 Heatmap과 같은 규칙의 잔디 격자: 열=주, 행=요일, 마지막 열=이번 주. */
    private static Bitmap drawGrass(JSONObject days, int weekStartsOn, int weeks, String todayKey,
                                    SimpleDateFormat fmt, int[] colors, boolean night) {
        final int cell = 26, gap = 6, pitch = cell + gap;
        Bitmap bmp = Bitmap.createBitmap(weeks * pitch - gap, 7 * pitch - gap, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(3f);
        ring.setColor(night ? Color.WHITE : 0xFF111827);

        // 격자 끝 = 이번 주의 마지막 요일, 시작 = 그로부터 weeks주 전의 주 시작일
        Calendar cur = Calendar.getInstance();
        int jsDay = cur.get(Calendar.DAY_OF_WEEK) - 1; // 0=일
        cur.add(Calendar.DATE, (weekStartsOn + 6 - jsDay + 7) % 7);
        cur.add(Calendar.DATE, -(weeks * 7 - 1));

        for (int w = 0; w < weeks; w++) {
            for (int d = 0; d < 7; d++) {
                String key = fmt.format(cur.getTime());
                cur.add(Calendar.DATE, 1);
                if (key.compareTo(todayKey) > 0) continue; // 미래 칸은 비워둔다
                int lvl = Math.max(0, Math.min(4, days.optInt(key, 0)));
                fill.setColor(colors[lvl]);
                float x = w * pitch, y = d * pitch;
                RectF r = new RectF(x, y, x + cell, y + cell);
                c.drawRoundRect(r, 6f, 6f, fill);
                if (key.equals(todayKey)) {
                    RectF rr = new RectF(x + 1.5f, y + 1.5f, x + cell - 1.5f, y + cell - 1.5f);
                    c.drawRoundRect(rr, 5f, 5f, ring);
                }
            }
        }
        return bmp;
    }

    /** 앱을 열고 웹의 해당 경로로 이동(NativeBridge가 appUrlOpen으로 처리). */
    private static PendingIntent openIntent(Context ctx, int requestCode, String path) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(OPEN_URL + path), ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, requestCode, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
