package com.ounwan.app;

import androidx.health.connect.client.HealthConnectClient;
import androidx.health.connect.client.aggregate.AggregateMetric;
import androidx.health.connect.client.aggregate.AggregationResult;
import androidx.health.connect.client.records.StepsRecord;
import androidx.health.connect.client.records.metadata.DataOrigin;
import androidx.health.connect.client.request.AggregateRequest;
import androidx.health.connect.client.time.TimeRangeFilter;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.time.Instant;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

import kotlin.coroutines.Continuation;
import kotlin.coroutines.EmptyCoroutineContext;
import kotlinx.coroutines.BuildersKt;
import kotlinx.coroutines.CoroutineScope;

/**
 * 걸음 수 합계(src/lib/health.ts 의 HealthSteps).
 * 기록을 단순 합산하면 폰·워치가 같은 시간대에 각각 쓴 걸음이 중복된다.
 * Health Connect의 aggregate는 앱 우선순위에 따라 겹치는 구간을 걸러 삼성 헬스와 같은 기준의 합계를 준다.
 */
@CapacitorPlugin(name = "HealthSteps")
public class HealthStepsPlugin extends Plugin {

    @PluginMethod
    public void aggregate(PluginCall call) {
        String start = call.getString("startDate");
        String end = call.getString("endDate");
        if (start == null || end == null) {
            call.reject("startDate, endDate가 필요해요");
            return;
        }
        new Thread(() -> {
            try {
                HealthConnectClient client = HealthConnectClient.Companion.getOrCreate(getContext());
                Set<AggregateMetric<?>> metrics = new HashSet<>();
                metrics.add(StepsRecord.COUNT_TOTAL);
                Set<DataOrigin> origins = Collections.emptySet();
                AggregateRequest request = new AggregateRequest(
                        metrics,
                        TimeRangeFilter.Companion.between(Instant.parse(start), Instant.parse(end)),
                        origins);
                // Health Connect API는 코루틴(suspend) 함수라 백그라운드 스레드에서 runBlocking으로 기다린다
                AggregationResult result = BuildersKt.runBlocking(
                        EmptyCoroutineContext.INSTANCE,
                        (CoroutineScope scope, Continuation<? super AggregationResult> cont) ->
                                client.aggregate(request, cont));
                Long steps = result.get(StepsRecord.COUNT_TOTAL);
                JSObject r = new JSObject();
                r.put("steps", steps == null ? 0 : steps);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("걸음 합계를 읽지 못했어요: " + e.getMessage());
            }
        }).start();
    }
}
