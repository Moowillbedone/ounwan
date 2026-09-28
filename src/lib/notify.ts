"use client";

import { LocalNotifications } from "@capacitor/local-notifications";
import { isNativeApp } from "./native";
import { toDateKey } from "./utils";

// 안드로이드 앱 전용 로컬 알림.
// - 휴식 종료: 앱이 백그라운드로 갈 때 종료 시각에 예약(정확한 알람) → 화면이 꺼져도 제때 울림.
//   앱으로 돌아오면 취소(앱 안에서는 기존 소리·진동이 담당, 이중 알림 방지).
// - 오늘 운동 리마인더: 앞으로 14일치를 하루 1개씩 예약, 운동을 끝낸 날은 건너뛴다.

const REST_ID = 1001;
const REMINDER_BASE = 2000;
const REMINDER_DAYS = 14;
const ICON = "ic_stat_ounwan";

let setupDone: Promise<boolean> | null = null;

/** 알림 채널 생성 + 권한 확인(한 번만) */
function setup(): Promise<boolean> {
  if (!isNativeApp()) return Promise.resolve(false);
  if (!setupDone) {
    setupDone = (async () => {
      try {
        let perm = await LocalNotifications.checkPermissions();
        if (perm.display !== "granted") perm = await LocalNotifications.requestPermissions();
        if (perm.display !== "granted") return false;
        await LocalNotifications.createChannel({
          id: "rest",
          name: "휴식 종료",
          description: "세트 사이 휴식이 끝나면 알려줘요",
          importance: 5,
          vibration: true,
        });
        await LocalNotifications.createChannel({
          id: "reminder",
          name: "오늘 운동 알림",
          description: "운동을 아직 안 한 날, 정한 시간에 알려줘요",
          importance: 4,
          vibration: true,
        });
        return true;
      } catch {
        return false;
      }
    })();
  }
  return setupDone;
}

export async function scheduleRestEnd(endsAt: number) {
  if (endsAt - Date.now() < 2000 || !(await setup())) return;
  await LocalNotifications.cancel({ notifications: [{ id: REST_ID }] }).catch(() => {});
  await LocalNotifications.schedule({
    notifications: [
      {
        id: REST_ID,
        title: "휴식 끝! 💪",
        body: "다음 세트를 시작할 시간이에요",
        channelId: "rest",
        smallIcon: ICON,
        schedule: { at: new Date(endsAt), allowWhileIdle: true },
      },
    ],
  }).catch(() => {});
}

export async function cancelRestEnd() {
  if (!isNativeApp()) return;
  await LocalNotifications.cancel({ notifications: [{ id: REST_ID }] }).catch(() => {});
}

export interface ReminderPlan {
  enabled: boolean;
  time: string; // "HH:MM"
  doneDates: Set<string>;
  streak: number;
}

/** 오늘 운동 리마인더를 앞으로 14일치 다시 예약 */
export async function syncDailyReminders(plan: ReminderPlan) {
  if (!isNativeApp()) return;
  const ids = Array.from({ length: REMINDER_DAYS }, (_, i) => ({ id: REMINDER_BASE + i }));
  await LocalNotifications.cancel({ notifications: ids }).catch(() => {});
  if (!plan.enabled || !(await setup())) return;

  const [hh, mm] = plan.time.split(":").map((n) => parseInt(n, 10));
  const now = new Date();
  const list = [];
  for (let i = 0; i < REMINDER_DAYS; i++) {
    const at = new Date(now);
    at.setDate(now.getDate() + i);
    at.setHours(hh || 0, mm || 0, 0, 0);
    if (at.getTime() <= now.getTime() + 60_000) continue; // 이미 지난 시각
    if (plan.doneDates.has(toDateKey(at))) continue; // 그날 이미 운동 완료
    list.push({
      id: REMINDER_BASE + i,
      title: plan.streak > 0 ? `🔥 연속 ${plan.streak}일째` : "오늘 운동 어때요? 💪",
      body:
        plan.streak > 0
          ? "오늘 운동으로 연속기록을 이어가요"
          : "가볍게라도 기록하면 잔디가 자라요",
      channelId: "reminder",
      smallIcon: ICON,
      schedule: { at, allowWhileIdle: true },
      extra: { path: "/" },
    });
  }
  if (list.length) await LocalNotifications.schedule({ notifications: list }).catch(() => {});
}
