package com.ounwan.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Bundle;
import android.util.TypedValue;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * 1x1 연속기록 위젯. 큰 위젯과 같은 요약 데이터(WidgetBridgePlugin이 저장)를 쓴다.
 * 가운데 연속 일수, 둘레에 이번 주 7일 링(운동한 날은 잔디 색 + 입체 두께, 오늘은 바깥 표시).
 */
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

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager m, int id, Bundle newOptions) {
        render(ctx, m, id);
    }

    static void render(Context ctx, AppWidgetManager m, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_streak);
        v.setOnClickPendingIntent(R.id.streak_root, OunwanWidgetProvider.openIntent(ctx, 10, "/"));

        Bundle opts = m.getAppWidgetOptions(id);
        int wDp = opts != null ? opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) : 0;
        int hDp = opts != null ? opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) : 0;
        int sizeDp = Math.min(wDp > 0 ? wDp : 72, hDp > 0 ? hDp : 72);
        v.setTextViewTextSize(R.id.streak_value, TypedValue.COMPLEX_UNIT_SP, sizeDp < 64 ? 19 : 24);

        JSONObject data = OunwanWidgetProvider.readData(ctx);
        OunwanWidgetProvider.Palette pal = new OunwanWidgetProvider.Palette(ctx, data);
        v.setInt(R.id.streak_root, "setBackgroundResource", pal.bgRes);
        v.setTextColor(R.id.streak_value, pal.text);
        JSONObject days = data != null ? data.optJSONObject("days") : null;
        if (days == null) days = new JSONObject();
        int weekStartsOn = data != null ? data.optInt("weekStartsOn", 1) : 1;

        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        String todayKey = fmt.format(Calendar.getInstance().getTime());
        boolean doneToday = days.optInt(todayKey, 0) > 0;

        if (data == null) {
            v.setTextViewText(R.id.streak_value, "–");
            v.setTextViewText(R.id.streak_sub, "앱 열기");
        } else {
            v.setTextViewText(R.id.streak_value, String.valueOf(data.optInt("streak", 0)));
            v.setTextViewText(R.id.streak_sub, doneToday ? "✓ 오늘" : "일 연속");
        }
        v.setTextColor(R.id.streak_sub, doneToday ? pal.brand : pal.sub);

        // 이번 주 7일: 주 시작일부터
        Calendar cur = Calendar.getInstance();
        int jsDay = cur.get(Calendar.DAY_OF_WEEK) - 1; // 0=일
        cur.add(Calendar.DATE, -((jsDay - weekStartsOn + 7) % 7));
        int[] level = new int[7];
        int todayIdx = 0;
        for (int i = 0; i < 7; i++) {
            String key = fmt.format(cur.getTime());
            cur.add(Calendar.DATE, 1);
            int cmp = key.compareTo(todayKey);
            if (cmp == 0) todayIdx = i;
            level[i] = cmp > 0 ? -1 : Math.max(0, Math.min(4, days.optInt(key, 0)));
        }
        float scale = Math.min(ctx.getResources().getDisplayMetrics().density, 3f);
        int px = Math.max(60, Math.round((sizeDp - 10) * scale));
        v.setImageViewBitmap(R.id.streak_ring, drawRing(level, todayIdx, px, pal));
        m.updateAppWidget(id, v);
    }

    /** 7칸 링. 운동한 칸은 아래로 두께(어두운 면)를 줘 입체감, 오늘 칸은 바깥에 테두리 호. */
    private static Bitmap drawRing(int[] level, int todayIdx, int size, OunwanWidgetProvider.Palette pal) {
        boolean night = pal.night;
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        int[] colors = pal.grass;
        float t = size * 0.08f;
        float depth = size * 0.028f;
        float r = size / 2f - t / 2f - size * 0.045f;
        float cx = size / 2f, cy = size / 2f - depth / 2f;
        float seg = 360f / 7f, gap = 7f;

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeCap(Paint.Cap.BUTT);
        p.setStrokeWidth(t);
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeCap(Paint.Cap.ROUND);
        ring.setStrokeWidth(Math.max(2f, size * 0.022f));
        ring.setColor(night ? Color.WHITE : pal.text);

        RectF top = new RectF(cx - r, cy - r, cx + r, cy + r);
        RectF low = new RectF(cx - r, cy - r + depth, cx + r, cy + r + depth);
        float ro = r + t / 2f + size * 0.022f;
        RectF outer = new RectF(cx - ro, cy - ro, cx + ro, cy + ro);

        for (int i = 0; i < 7; i++) {
            float start = -90f + i * seg + gap / 2f;
            float sweep = seg - gap;
            int lv = level[i];
            int base = lv < 0 ? pal.track : colors[lv];
            if (lv > 0) {
                p.setColor(shade(base, 0.62f));
                c.drawArc(low, start, sweep, false, p);
            }
            p.setColor(lv > 0 ? shade(base, 1.06f) : base);
            c.drawArc(top, start, sweep, false, p);
            if (i == todayIdx) c.drawArc(outer, start + 3, sweep - 6, false, ring);
        }
        return bmp;
    }

    private static int shade(int color, float f) {
        int r = Math.min(255, (int) (((color >> 16) & 0xFF) * f));
        int g = Math.min(255, (int) (((color >> 8) & 0xFF) * f));
        int b = Math.min(255, (int) ((color & 0xFF) * f));
        return (color & 0xFF000000) | (r << 16) | (g << 8) | b;
    }
}
