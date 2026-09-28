"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, HeartPulse } from "lucide-react";
import { IconButton } from "@/components/ui";

// Health Connect 권한 화면의 '개인정보 처리 안내'로 열리는 페이지(Health Connect 필수 요건)
export default function HealthPrivacyPage() {
  const router = useRouter();
  return (
    <div className="px-4 pt-4 pb-6">
      <header className="mb-4 flex items-center gap-1">
        <IconButton onClick={() => router.push("/settings")} aria-label="뒤로">
          <ChevronLeft size={22} />
        </IconButton>
        <h1 className="text-xl font-black">건강 데이터 사용 안내</h1>
      </header>

      <div className="space-y-4 text-[14px] leading-relaxed text-text-2">
        <div className="flex items-center gap-2 rounded-app bg-brand-soft/60 p-3 text-sm">
          <HeartPulse size={18} className="shrink-0 text-danger" />
          오운완은 Health Connect에서 아래 데이터를 <b>읽기만</b> 해요. 쓰거나 다른 곳에 보내지 않아요.
        </div>
        <section>
          <h2 className="mb-1 font-bold text-text">읽는 데이터와 쓰임</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>체중</b> — 오운완에 체중이 비어 있는 날만 채워 체중 추이·근력 기준 비교에 써요.
              직접 입력한 체중은 덮어쓰지 않아요.
            </li>
            <li>
              <b>걸음 수</b> — 통계 탭에 오늘·최근 7일 걸음 수로 보여줘요(저장하지 않음).
            </li>
            <li>
              <b>심박</b> — 러닝 기록의 평균·최고 심박을 보여줘요(저장하지 않음).
            </li>
          </ul>
        </section>
        <section>
          <h2 className="mb-1 font-bold text-text">보관</h2>
          <p>
            가져온 체중은 다른 운동 기록과 같이 이 기기와, 로그인한 경우 본인 계정의 동기화
            서버(Supabase)에만 저장돼요. 광고·분석 목적의 외부 전송은 없어요.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-bold text-text">연결 끊기</h2>
          <p>
            휴대폰 설정 → Health Connect → 앱 권한 → 오운완에서 언제든 권한을 끌 수 있어요.
            오운완 설정의 &lsquo;연결 해제&rsquo;를 누르면 더 이상 가져오지 않아요.
          </p>
        </section>
      </div>
    </div>
  );
}
