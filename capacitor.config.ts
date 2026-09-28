import type { CapacitorConfig } from "@capacitor/cli";

// 안드로이드 앱(APK) 껍데기 설정.
// 화면은 라이브 주소를 그대로 띄운다 → main 배포가 곧 앱 업데이트(재설치 불필요).
// 네이티브 부분(위젯·백그라운드 GPS·권한)을 바꿀 때만 APK를 새로 빌드한다.
const config: CapacitorConfig = {
  appId: "com.ounwan.app",
  appName: "오운완",
  // server.url을 쓰더라도 필수 항목. 오프라인 첫 실행 대비 정적 빌드본도 함께 담긴다.
  webDir: "out",
  server: {
    url: "https://ounwan-three.vercel.app",
    cleartext: false,
  },
  android: {
    // 백그라운드 위치 업데이트가 5분 후 멈추는 문제 방지(background-geolocation 플러그인 요구사항)
    useLegacyBridge: true,
    // 안드로이드 15+는 화면을 상태바·하단 버튼 뒤까지 강제로 그린다 → 웹 화면을 그 영역만큼 비켜 배치
    // (웹뷰는 상단 safe-area 값을 주지 않아서 CSS만으로는 제목이 시계 줄에 겹침)
    adjustMarginsForEdgeToEdge: "force",
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_ounwan",
      iconColor: "#0F9D63",
    },
  },
};

export default config;
