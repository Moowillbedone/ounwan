package com.ounwan.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * 4x2 스타일 위젯 3종(위젯 목록에서 골라 추가):
 *  - 이번 주(OunwanWeekWidgetProvider): 요일별 3D 원기둥 — 높이 = 그날 운동량, 아래에 요일
 *  - 이번 달(OunwanMonthWidgetProvider): 이번 달 달력을 3D 타일로 — 운동한 날은 볼록·진한 색
 *  - 목표 링(OunwanRingWidgetProvider): 이번 달·이번 주 운동일 비율 3D 링 + 숫자
 * 데이터·색은 3D 잔디 위젯(OunwanWidgetProvider)과 같은 요약 JSON·Palette를 쓴다.
 */
final class OunwanStyleWidgets {

    static final int WEEK = 0, MONTH = 1, RING = 2;

    private OunwanStyleWidgets() {
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        for (int id : m.getAppWidgetIds(new ComponentName(ctx, OunwanWeekWidgetProvider.class))) render(ctx, m, id, WEEK);
        for (int id : m.getAppWidgetIds(new ComponentName(ctx, OunwanMonthWidgetProvider.class))) render(ctx, m, id, MONTH);
        for (int id : m.getAppWidgetIds(new ComponentName(ctx, OunwanRingWidgetProvider.class))) render(ctx, m, id, RING);
    }

    /* ---------------- 데이터 ---------------- */

    /** 날짜별 잔디 단계와 이번 주·이번 달 요약 */
    static final class Summary {
        int streak, weekStartsOn;
        boolean hasData, doneToday;
        int[] week = new int[7]; // 이번 주 요일별 단계(-1 = 아직 안 온 날)
        int weekToday, weekDone;
        int month, daysInMonth, today, monthFirstCol, monthDone;
        int[] monthLv; // 1일부터
        String[] weekdayLabels = new String[7];

        Summary(JSONObject data) {
            hasData = data != null;
            JSONObject days = data != null ? data.optJSONObject("days") : null;
            if (days == null) days = new JSONObject();
            streak = data != null ? data.optInt("streak", 0) : 0;
            weekStartsOn = data != null ? data.optInt("weekStartsOn", 1) : 1;
            String[] names = {"일", "월", "화", "수", "목", "금", "토"};
            for (int i = 0; i < 7; i++) weekdayLabels[i] = names[(weekStartsOn + i) % 7];

            SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            Calendar now = Calendar.getInstance();
            String todayKey = fmt.format(now.getTime());
            doneToday = days.optInt(todayKey, 0) > 0;

            Calendar c = (Calendar) now.clone();
            int js = c.get(Calendar.DAY_OF_WEEK) - 1;
            c.add(Calendar.DATE, -((js - weekStartsOn + 7) % 7));
            for (int i = 0; i < 7; i++) {
                String k = fmt.format(c.getTime());
                c.add(Calendar.DATE, 1);
                int cmp = k.compareTo(todayKey);
                if (cmp == 0) weekToday = i;
                week[i] = cmp > 0 ? -1 : clamp(days.optInt(k, 0));
                if (week[i] > 0) weekDone++;
            }

            month = now.get(Calendar.MONTH) + 1;
            daysInMonth = now.getActualMaximum(Calendar.DAY_OF_MONTH);
            today = now.get(Calendar.DAY_OF_MONTH);
            Calendar first = (Calendar) now.clone();
            first.set(Calendar.DAY_OF_MONTH, 1);
            monthFirstCol = (first.get(Calendar.DAY_OF_WEEK) - 1 - weekStartsOn + 7) % 7;
            monthLv = new int[daysInMonth];
            for (int d = 1; d <= daysInMonth; d++) {
                String k = fmt.format(first.getTime());
                first.add(Calendar.DATE, 1);
                monthLv[d - 1] = d > today ? -1 : clamp(days.optInt(k, 0));
                if (monthLv[d - 1] > 0) monthDone++;
            }
        }

        private static int clamp(int v) {
            return Math.max(0, Math.min(4, v));
        }
    }

    /* ---------------- 그리기 ---------------- */

    static void render(Context ctx, AppWidgetManager m, int id, int kind) {
        int layout = kind == WEEK ? R.layout.widget_week : kind == MONTH ? R.layout.widget_month : R.layout.widget_ring;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), layout);
        JSONObject data = OunwanWidgetProvider.readData(ctx);
        OunwanWidgetProvider.Palette pal = new OunwanWidgetProvider.Palette(ctx, data);
        Summary s = new Summary(data);

        Bundle opts = m.getAppWidgetOptions(id);
        int wDp = opts != null ? opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) : 0;
        int hDp = opts != null ? opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) : 0;
        if (wDp <= 0) wDp = 320;
        if (hDp <= 0) hDp = 160;
        float scale = Math.min(ctx.getResources().getDisplayMetrics().density, 2.2f);

        v.setInt(R.id.sw_root, "setBackgroundResource", pal.bgRes);
        v.setOnClickPendingIntent(R.id.sw_root, OunwanWidgetProvider.openIntent(ctx, 20 + kind, "/"));
        String streakText = s.streak > 0 ? "🔥 " + s.streak + "일 연속" : "오늘 시작해요 💪";

        if (kind == WEEK) {
            v.setTextColor(R.id.sw_title, pal.text);
            v.setTextViewText(R.id.sw_sub, "· " + s.weekDone + "/7일 운동");
            v.setTextColor(R.id.sw_sub, pal.brand);
            v.setTextViewText(R.id.sw_streak, s.hasData ? streakText : ctx.getString(R.string.widget_loading));
            v.setTextColor(R.id.sw_streak, pal.text);
            int w = Math.round((wDp - 20) * scale), h = Math.round((hDp - 12 - 14 - 26) * scale);
            v.setImageViewBitmap(R.id.sw_chart, drawPillars(s, pal, w, h, scale));
        } else if (kind == MONTH) {
            v.setTextViewText(R.id.sw_title, s.month + "월");
            v.setTextColor(R.id.sw_title, pal.text);
            v.setTextViewText(R.id.sw_sub, s.monthDone + "일 운동");
            v.setTextColor(R.id.sw_sub, pal.brand);
            v.setTextViewText(R.id.sw_streak, s.hasData ? streakText : ctx.getString(R.string.widget_loading));
            v.setTextColor(R.id.sw_streak, pal.sub);
            styleButton(v, R.id.sw_btn_log, pal, true);
            v.setOnClickPendingIntent(R.id.sw_btn_log, OunwanWidgetProvider.openIntent(ctx, 31, "/log"));
            int w = Math.round((wDp - 16 - 100 - 24) * scale), h = Math.round((hDp - 24) * scale);
            v.setImageViewBitmap(R.id.sw_chart, drawTiles(s, pal, w, h, scale));
        } else {
            int outer = pal.grass[3];
            int inner = pal.pink ? (pal.night ? 0xFFC4B5FD : 0xFF8B5CF6) : (pal.night ? 0xFF7CC7FF : 0xFF3B82F6);
            v.setTextViewText(R.id.sw_month_value, s.monthDone + " / " + s.daysInMonth + "일");
            v.setTextViewText(R.id.sw_week_value, s.weekDone + " / 7일");
            v.setTextColor(R.id.sw_month_dot, outer);
            v.setTextColor(R.id.sw_week_dot, inner);
            v.setTextColor(R.id.sw_month_label, pal.sub);
            v.setTextColor(R.id.sw_week_label, pal.sub);
            v.setTextColor(R.id.sw_month_value, pal.text);
            v.setTextColor(R.id.sw_week_value, pal.text);
            v.setTextViewText(R.id.sw_today, !s.hasData ? ctx.getString(R.string.widget_loading)
                    : s.doneToday ? "✓ 오늘 운동 완료" : "오늘은 아직 운동 전");
            v.setTextColor(R.id.sw_today, s.doneToday ? pal.brand : pal.sub);
            styleButton(v, R.id.sw_btn_log, pal, true);
            styleButton(v, R.id.sw_btn_run, pal, false);
            v.setOnClickPendingIntent(R.id.sw_btn_log, OunwanWidgetProvider.openIntent(ctx, 32, "/log"));
            v.setOnClickPendingIntent(R.id.sw_btn_run, OunwanWidgetProvider.openIntent(ctx, 33, "/run"));
            int size = Math.round((hDp - 20) * scale);
            v.setImageViewBitmap(R.id.sw_chart, drawRings(s, pal, size, scale,
                    (float) s.monthDone / s.daysInMonth, s.weekDone / 7f, outer, inner));
        }
        m.updateAppWidget(id, v);
    }

    private static void styleButton(RemoteViews v, int id, OunwanWidgetProvider.Palette pal, boolean primary) {
        v.setInt(id, "setBackgroundResource", primary ? pal.btnPrimaryRes : pal.btnRes);
        v.setTextColor(id, primary ? pal.onBrand : pal.brand);
    }

    private static Paint textPaint(float px, int color, boolean bold) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setTextSize(px);
        p.setColor(color);
        p.setTextAlign(Paint.Align.CENTER);
        p.setTypeface(Typeface.create(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL));
        return p;
    }

    /** 이번 주: 요일별 원기둥(왼쪽 밝고 오른쪽 어두운 측면 + 밝은 윗면 + 바닥 그림자) */
    static Bitmap drawPillars(Summary s, OunwanWidgetProvider.Palette pal, int w, int h, float k) {
        w = Math.max(80, w);
        h = Math.max(60, h);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        float colW = w / 7f, bw = Math.min(colW * 0.52f, 30 * k), ry = bw * 0.2f;
        float labelH = 16 * k, baseY = h - labelH - ry - 2 * k, maxH = h - labelH - ry * 2 - 14 * k;
        float[] hs = {0f, 0.3f, 0.55f, 0.8f, 1f};
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG);
        shadow.setColor(0x1A000000);
        Paint dash = new Paint(Paint.ANTI_ALIAS_FLAG);
        dash.setStyle(Paint.Style.STROKE);
        dash.setStrokeWidth(1.2f * k);
        dash.setColor(pal.night ? 0x2EFFFFFF : 0x26000000);
        dash.setPathEffect(new DashPathEffect(new float[]{3 * k, 3 * k}, 0));
        Paint check = textPaint(10 * k, pal.brand, true);

        for (int i = 0; i < 7; i++) {
            float cx = colW * i + colW / 2f, left = cx - bw / 2f;
            int lv = s.week[i];
            c.drawOval(new RectF(cx - bw * 0.62f, baseY + ry * 0.6f - ry * 0.9f, cx + bw * 0.62f, baseY + ry * 0.6f + ry * 0.9f), shadow);
            if (lv < 0) {
                c.drawOval(new RectF(left, baseY - ry, left + bw, baseY + ry), dash);
            } else {
                float ph = lv == 0 ? 4 * k : Math.max(8 * k, maxH * hs[lv]);
                int col = lv == 0 ? pal.track : pal.grass[lv];
                float top = baseY - ph;
                p.setShader(new LinearGradient(left, 0, left + bw, 0,
                        new int[]{shade(col, 1.12f), col, shade(col, 0.68f)}, new float[]{0f, 0.45f, 1f}, Shader.TileMode.CLAMP));
                Path body = new Path();
                body.moveTo(left, top);
                body.lineTo(left, baseY);
                body.arcTo(new RectF(left, baseY - ry, left + bw, baseY + ry), 180, -180);
                body.lineTo(left + bw, top);
                body.close();
                c.drawPath(body, p);
                p.setShader(null);
                p.setColor(shade(col, lv == 0 ? 0.97f : 1.18f));
                c.drawOval(new RectF(left, top - ry, left + bw, top + ry), p);
                if (lv > 0) c.drawText("✓", cx, top - ry - 3 * k, check);
            }
            boolean isToday = i == s.weekToday;
            Paint lp = textPaint(11 * k, isToday ? pal.brand : pal.sub, isToday);
            c.drawText(s.weekdayLabels[i], cx, h - 2 * k, lp);
            if (isToday) {
                p.setColor(pal.brand);
                c.drawCircle(cx + 9 * k, h - 10 * k, 2 * k, p);
            }
        }
        return bmp;
    }

    /** 이번 달: 달력 타일(운동한 날 = 아래 두께가 있는 볼록한 칸 + 날짜 숫자) */
    static Bitmap drawTiles(Summary s, OunwanWidgetProvider.Palette pal, int w, int h, float k) {
        w = Math.max(80, w);
        h = Math.max(60, h);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        int rows = (int) Math.ceil((s.monthFirstCol + s.daysInMonth) / 7.0);
        float hdr = 14 * k, gap = 3 * k;
        float cw = (w - gap * 6) / 7f, ch = (h - hdr - gap * (rows - 1)) / rows;
        float t = Math.min(cw, ch), dep = Math.max(2 * k, t * 0.12f), r = 5 * k;
        float ox = (w - (t * 7 + gap * 6)) / 2f;
        Paint head = textPaint(9 * k, pal.sub, true);
        for (int i = 0; i < 7; i++) c.drawText(s.weekdayLabels[i], ox + i * (t + gap) + t / 2f, 10 * k, head);

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(1.6f * k);
        ring.setColor(pal.text);
        float numPx = Math.min(9.5f * k, t * 0.42f);
        for (int d = 1; d <= s.daysInMonth; d++) {
            int idx = s.monthFirstCol + d - 1, row = idx / 7, col = idx % 7;
            float tx = ox + col * (t + gap), ty = hdr + row * (t + gap - 0.5f * k);
            int lv = s.monthLv[d - 1];
            String num = String.valueOf(d);
            if (lv > 0) {
                int base = pal.grass[lv];
                p.setShader(null);
                p.setColor(shade(base, 0.62f));
                c.drawRoundRect(new RectF(tx, ty + dep, tx + t, ty + t), r, r, p);
                p.setShader(new LinearGradient(0, ty, 0, ty + t - dep, shade(base, 1.15f), shade(base, 0.95f), Shader.TileMode.CLAMP));
                c.drawRoundRect(new RectF(tx, ty, tx + t, ty + t - dep), r, r, p);
                p.setShader(null);
                int nc = (lv >= 3 || pal.night) ? Color.WHITE : pal.text;
                c.drawText(num, tx + t / 2f, ty + (t - dep) / 2f + numPx * 0.36f, textPaint(numPx, nc, true));
            } else if (lv == 0) {
                p.setShader(null);
                p.setColor(pal.track);
                c.drawRoundRect(new RectF(tx, ty + dep * 0.5f, tx + t, ty + t - dep * 0.5f), r, r, p);
                c.drawText(num, tx + t / 2f, ty + dep * 0.5f + (t - dep) / 2f + numPx * 0.36f, textPaint(numPx, pal.sub, false));
            } else {
                int faint = pal.night ? 0x47FFFFFF : 0x40000000;
                c.drawText(num, tx + t / 2f, ty + (t - dep) / 2f + numPx * 0.36f, textPaint(numPx, faint, false));
            }
            if (d == s.today) {
                float bottom = lv > 0 ? ty + t : ty + t - dep;
                c.drawRoundRect(new RectF(tx - 1.5f * k, ty - 1.5f * k, tx + t + 1.5f * k, bottom + 1.5f * k), r + 1, r + 1, ring);
            }
        }
        return bmp;
    }

    /** 목표 링: 바깥 = 이번 달, 안쪽 = 이번 주. 둥근 끝 + 그림자 + 윗면 하이라이트, 가운데 연속 일수 */
    static Bitmap drawRings(Summary s, OunwanWidgetProvider.Palette pal, int size, float k,
                            float outerFrac, float innerFrac, int outerCol, int innerCol) {
        size = Math.max(80, size);
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        float cx = size / 2f, cy = size / 2f;
        float R = size / 2f - 4 * k, t = R * 0.2f;
        float[] fracs = {outerFrac, innerFrac};
        int[] cols = {outerCol, innerCol};
        for (int i = 0; i < 2; i++) {
            float r = R - t / 2f - i * (t + 4 * k);
            RectF o = new RectF(cx - r, cy - r, cx + r, cy + r);
            Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
            track.setStyle(Paint.Style.STROKE);
            track.setStrokeWidth(t);
            track.setColor(pal.night ? 0x14FFFFFF : 0x12000000);
            c.drawOval(o, track);
            float sweep = 360f * Math.max(0.002f, Math.min(1f, fracs[i]));
            Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
            arc.setStyle(Paint.Style.STROKE);
            arc.setStrokeWidth(t);
            arc.setStrokeCap(Paint.Cap.ROUND);
            arc.setColor(shade(cols[i], 0.8f));
            arc.setShadowLayer(6 * k, 0, 2 * k, 0x40000000);
            c.drawArc(o, -90, sweep, false, arc);
            arc.clearShadowLayer();
            arc.setShader(new LinearGradient(cx - r, cy - r, cx + r, cy + r,
                    shade(cols[i], 1.2f), shade(cols[i], 0.85f), Shader.TileMode.CLAMP));
            c.drawArc(o, -90, sweep, false, arc);
            Paint hi = new Paint(Paint.ANTI_ALIAS_FLAG);
            hi.setStyle(Paint.Style.STROKE);
            hi.setStrokeWidth(t * 0.28f);
            hi.setStrokeCap(Paint.Cap.ROUND);
            hi.setColor(0x59FFFFFF);
            float rh = r - t * 0.18f;
            c.drawArc(new RectF(cx - rh, cy - rh, cx + rh, cy + rh), -90, sweep, false, hi);
        }
        Paint num = textPaint(26 * k, pal.text, true);
        num.setTypeface(Typeface.create("sans-serif-black", Typeface.NORMAL));
        c.drawText(String.valueOf(s.streak), cx, cy + 5 * k, num);
        c.drawText("일 연속", cx, cy + 20 * k, textPaint(9.5f * k, pal.sub, true));
        return bmp;
    }

    static int shade(int color, float f) {
        int r = Math.min(255, (int) (((color >> 16) & 0xFF) * f));
        int g = Math.min(255, (int) (((color >> 8) & 0xFF) * f));
        int b = Math.min(255, (int) ((color & 0xFF) * f));
        return (color & 0xFF000000) | (r << 16) | (g << 8) | b;
    }
}
