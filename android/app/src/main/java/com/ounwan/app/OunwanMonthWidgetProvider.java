package com.ounwan.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** 4x2 스타일 위젯 — 그리기는 OunwanStyleWidgets */
public class OunwanMonthWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) OunwanStyleWidgets.render(ctx, m, id, OunwanStyleWidgets.MONTH);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager m, int id, Bundle newOptions) {
        OunwanStyleWidgets.render(ctx, m, id, OunwanStyleWidgets.MONTH);
    }
}
