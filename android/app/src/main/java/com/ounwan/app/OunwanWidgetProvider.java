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
import android.graphics.Path;
import android.net.Uri;
import android.os.Bundle;
import android.util.TypedValue;

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

    // 웹 globals.css 잔디 색(--grass-0 ~ --grass-4)과 동일 — 그린 / 연핑크
    static final int[] GRASS_LIGHT = {0xFFE6E9ED, 0xFF9FE2BF, 0xFF3FC98A, 0xFF12915D, 0xFF084027};
    static final int[] GRASS_DARK = {0xFF2A3440, 0xFF15693F, 0xFF26A668, 0xFF3FD189, 0xFF83F0C6};
    static final int[] PINK_LIGHT = {0xFFF1E6EA, 0xFFF8BBD0, 0xFFF48FB1, 0xFFE0578A, 0xFF9E2459};
    static final int[] PINK_DARK = {0xFF3F333A, 0xFF6B2744, 0xFFB23A6A, 0xFFF06A9B, 0xFFFFB3CF};

    /** 테마 색상(웹 설정의 그린/연핑크 — 요약 JSON의 accent)과 라이트/다크에 따른 위젯 색 */
    static final class Palette {
        final boolean night;
        final int[] grass;
        final int plate, track, brand, text, sub, onBrand;
        final int bgRes, btnPrimaryRes, btnRes;

        Palette(Context ctx, JSONObject data) {
            boolean pink = data != null && "pink".equals(data.optString("accent"));
            night = (ctx.getResources().getConfiguration().uiMode
                    & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
            if (pink) {
                grass = night ? PINK_DARK : PINK_LIGHT;
                plate = night ? 0xFF241820 : 0xFFFBF1F4;
                track = night ? 0xFF2E2028 : 0xFFF6E6EC;
                brand = ctx.getColor(R.color.widget_pink_brand);
                text = ctx.getColor(R.color.widget_pink_text);
                sub = ctx.getColor(R.color.widget_pink_text_sub);
                onBrand = ctx.getColor(R.color.widget_pink_on_brand);
                bgRes = R.drawable.widget_bg_pink;
                btnPrimaryRes = R.drawable.widget_btn_primary_pink;
                btnRes = R.drawable.widget_btn_bg_pink;
            } else {
                grass = night ? GRASS_DARK : GRASS_LIGHT;
                plate = night ? 0xFF18222B : 0xFFF4F7F5;
                track = night ? 0xFF1E2A33 : 0xFFE9EEEB;
                brand = ctx.getColor(R.color.widget_brand);
                text = ctx.getColor(R.color.widget_text);
                sub = ctx.getColor(R.color.widget_text_sub);
                onBrand = ctx.getColor(R.color.widget_on_brand);
                bgRes = R.drawable.widget_bg;
                btnPrimaryRes = R.drawable.widget_btn_primary;
                btnRes = R.drawable.widget_btn_bg;
            }
        }
    }

    /** 앱이 저장한 요약 JSON(없으면 null) */
    static JSONObject readData(Context ctx) {
        try {
            String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
            return raw != null ? new JSONObject(raw) : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** 앱에서 데이터가 바뀌었을 때 모든 위젯을 즉시 다시 그린다. */
    public static void refreshAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] ids = m.getAppWidgetIds(new ComponentName(ctx, OunwanWidgetProvider.class));
        for (int id : ids) render(ctx, m, id);
        OunwanStreakWidgetProvider.refreshAll(ctx); // 1x1 위젯도 같이 갱신
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

        // 위젯 실제 크기(세로 화면 기준: 최소 너비 × 최대 높이)
        Bundle opts = m.getAppWidgetOptions(id);
        int widthDp = opts != null ? opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) : 0;
        int heightDp = opts != null ? opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) : 0;
        if (widthDp <= 0) widthDp = 320;
        if (heightDp <= 0) heightDp = 160;
        boolean compact = heightDp < 140;
        v.setTextViewTextSize(R.id.widget_streak, TypedValue.COMPLEX_UNIT_SP, compact ? 34 : 42);

        JSONObject data = readData(ctx);
        Palette pal = new Palette(ctx, data);
        v.setInt(R.id.widget_root, "setBackgroundResource", pal.bgRes);
        v.setInt(R.id.widget_btn_log, "setBackgroundResource", pal.btnPrimaryRes);
        v.setInt(R.id.widget_btn_run, "setBackgroundResource", pal.btnRes);
        v.setTextColor(R.id.widget_btn_log, pal.onBrand);
        v.setTextColor(R.id.widget_btn_run, pal.brand);
        v.setTextColor(R.id.widget_title, pal.brand);
        v.setTextColor(R.id.widget_streak, pal.text);
        v.setTextColor(R.id.widget_streak_unit, pal.text);
        v.setTextColor(R.id.widget_month, pal.sub);
        v.setTextColor(R.id.widget_caption, pal.sub);
        JSONObject days = data != null ? data.optJSONObject("days") : null;
        if (days == null) days = new JSONObject();
        int weekStartsOn = data != null ? data.optInt("weekStartsOn", 1) : 1;
        int streak = data != null ? data.optInt("streak", 0) : 0;

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
        boolean doneToday = days.optInt(todayKey, 0) > 0;
        int brand = pal.brand;
        int sub = pal.sub;

        v.setTextViewText(R.id.widget_streak, String.valueOf(streak));
        v.setTextViewText(R.id.widget_streak_unit, streak > 0 ? "일 연속 🔥" : "일 연속");
        v.setTextViewText(R.id.widget_month,
                "· " + (today.get(Calendar.MONTH) + 1) + "월 " + monthDays + "일 운동");
        if (data == null) {
            v.setTextViewText(R.id.widget_today, ctx.getString(R.string.widget_loading));
            v.setTextColor(R.id.widget_today, sub);
        } else {
            v.setTextViewText(R.id.widget_today, doneToday ? "✓ 오늘 운동 완료" : "오늘은 아직 운동 전");
            v.setTextColor(R.id.widget_today, doneToday ? brand : sub);
        }

        // 오른쪽 3D 잔디: 위젯 오른쪽 칸 크기에 맞춰 그린다(여백 없이 꽉 차게)
        float chartWdp = (widthDp - 24) * 0.56f - 6;
        float chartHdp = heightDp - 28;
        int weeks = chartWdp < 150 ? 6 : chartWdp < 190 ? 8 : 10;
        float scale = Math.min(ctx.getResources().getDisplayMetrics().density, 2.2f);
        v.setImageViewBitmap(R.id.widget_grass, drawIsoGrass(days, weekStartsOn, weeks, todayKey, fmt,
                Math.round(chartWdp * scale), Math.round(chartHdp * scale), pal));
        v.setTextViewText(R.id.widget_caption, "최근 " + weeks + "주");

        m.updateAppWidget(id, v);
    }

    // 블록 높이(칸 크기 대비): 잔디 0단계는 얇은 타일, 4단계가 가장 높다
    private static final float[] LEVEL_H = {0.14f, 0.55f, 1.0f, 1.5f, 2.1f};
    private static final float MAX_H = 2.1f;
    private static final float PLATE_T = 0.32f; // 받침판 두께

    /**
     * 최근 weeks주를 아이소메트릭 3D 블록으로(열=주, 행=요일, 오른쪽 아래가 이번 주).
     * 운동한 날일수록 높고 진한 블록, 오늘은 윗면 테두리로 표시. 미래 칸은 비운다.
     */
    private static Bitmap drawIsoGrass(JSONObject days, int weekStartsOn, int weeks, String todayKey,
                                       SimpleDateFormat fmt, int wPx, int hPx, Palette pal) {
        boolean night = pal.night;
        wPx = Math.max(40, wPx);
        hPx = Math.max(40, hPx);
        Bitmap bmp = Bitmap.createBitmap(wPx, hPx, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        int[] colors = pal.grass;

        int n = weeks + 7;
        float s = Math.min(wPx / (n * 0.866f), (hPx - 4) / (n * 0.5f + MAX_H + PLATE_T * 1.2f));
        final float cx = 0.866f * s, cy = 0.5f * s;
        final float ox = (wPx - n * cx) / 2f + 7 * cx;
        final float oy = (hPx - (n * cy + MAX_H * s + PLATE_T * s)) / 2f + MAX_H * s;
        Iso iso = new Iso(ox, oy, cx, cy, s);

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.FILL_AND_STROKE); // 면 사이 틈 방지
        p.setStrokeWidth(0.6f);
        p.setStrokeJoin(Paint.Join.ROUND);

        // 받침판
        float m = 0.35f, a0 = -m, b0 = -m, a1 = weeks + m, b1 = 7 + m;
        int plate = pal.plate;
        iso.face(c, p, shade(plate, night ? 0.8f : 0.86f), a0, b1, a1, b1, 0, -PLATE_T);
        iso.face(c, p, shade(plate, night ? 0.62f : 0.74f), a1, b0, a1, b1, 0, -PLATE_T);
        iso.top(c, p, plate, a0, b0, a1, b1, 0);

        // 날짜 → 칸: 격자 끝 = 이번 주 마지막 요일
        Calendar cur = Calendar.getInstance();
        int jsDay = cur.get(Calendar.DAY_OF_WEEK) - 1; // 0=일
        cur.add(Calendar.DATE, (weekStartsOn + 6 - jsDay + 7) % 7);
        cur.add(Calendar.DATE, -(weeks * 7 - 1));
        int[] level = new int[weeks * 7];
        int todayIdx = -1;
        for (int i = 0; i < weeks * 7; i++) {
            String key = fmt.format(cur.getTime());
            cur.add(Calendar.DATE, 1);
            int cmp = key.compareTo(todayKey);
            if (cmp == 0) todayIdx = i;
            level[i] = cmp > 0 ? -1 : Math.max(0, Math.min(4, days.optInt(key, 0)));
        }

        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeJoin(Paint.Join.ROUND);
        ring.setStrokeWidth(Math.max(2f, s * 0.14f));
        ring.setColor(night ? Color.WHITE : pal.text);

        // 뒤(위)에서 앞(아래)으로: a+b가 작은 칸부터
        final float g = 0.12f;
        for (int sum = 0; sum <= weeks - 1 + 6; sum++) {
            for (int w = 0; w < weeks; w++) {
                int d = sum - w;
                if (d < 0 || d > 6) continue;
                int i = w * 7 + d;
                int lv = level[i];
                if (lv < 0) continue; // 미래
                float h = LEVEL_H[lv];
                int col = colors[lv];
                float A0 = w + g, B0 = d + g, A1 = w + 1 - g, B1 = d + 1 - g;
                iso.face(c, p, shade(col, 0.80f), A0, B1, A1, B1, 0, h);
                iso.face(c, p, shade(col, 0.64f), A1, B0, A1, B1, 0, h);
                iso.top(c, p, lv > 0 ? shade(col, 1.08f) : col, A0, B0, A1, B1, h);
                if (i == todayIdx) c.drawPath(iso.topPath(A0, B0, A1, B1, h), ring);
            }
        }
        return bmp;
    }

    private static int shade(int color, float f) {
        int r = Math.min(255, (int) (((color >> 16) & 0xFF) * f));
        int g = Math.min(255, (int) (((color >> 8) & 0xFF) * f));
        int b = Math.min(255, (int) ((color & 0xFF) * f));
        return (color & 0xFF000000) | (r << 16) | (g << 8) | b;
    }

    /** 아이소메트릭 좌표 변환: (a=주, b=요일, h=높이) → 화면 */
    private static final class Iso {
        final float ox, oy, cx, cy, s;

        Iso(float ox, float oy, float cx, float cy, float s) {
            this.ox = ox;
            this.oy = oy;
            this.cx = cx;
            this.cy = cy;
            this.s = s;
        }

        float x(float a, float b) {
            return ox + (a - b) * cx;
        }

        float y(float a, float b, float h) {
            return oy + (a + b) * cy - h * s;
        }

        /** 세로 면: 바닥 선 (a0,b0)-(a1,b1)을 높이 hLow~hHigh로 세운 사각형 */
        void face(Canvas c, Paint p, int color, float a0, float b0, float a1, float b1, float hHigh, float hLowOrTop) {
            float lo = Math.min(hHigh, hLowOrTop), hi = Math.max(hHigh, hLowOrTop);
            Path path = new Path();
            path.moveTo(x(a0, b0), y(a0, b0, lo));
            path.lineTo(x(a1, b1), y(a1, b1, lo));
            path.lineTo(x(a1, b1), y(a1, b1, hi));
            path.lineTo(x(a0, b0), y(a0, b0, hi));
            path.close();
            p.setColor(color);
            c.drawPath(path, p);
        }

        Path topPath(float a0, float b0, float a1, float b1, float h) {
            Path path = new Path();
            path.moveTo(x(a0, b0), y(a0, b0, h));
            path.lineTo(x(a1, b0), y(a1, b0, h));
            path.lineTo(x(a1, b1), y(a1, b1, h));
            path.lineTo(x(a0, b1), y(a0, b1, h));
            path.close();
            return path;
        }

        void top(Canvas c, Paint p, int color, float a0, float b0, float a1, float b1, float h) {
            p.setColor(color);
            c.drawPath(topPath(a0, b0, a1, b1, h), p);
        }
    }

    /** 앱을 열고 웹의 해당 경로로 이동(NativeBridge가 appUrlOpen으로 처리). */
    static PendingIntent openIntent(Context ctx, int requestCode, String path) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(OPEN_URL + path), ctx, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, requestCode, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
