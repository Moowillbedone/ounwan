import { Capacitor, registerPlugin } from "@capacitor/core";

// 안드로이드 앱(APK) 안에서 실행 중인지. 앱은 라이브 주소를 그대로 띄우므로
// 같은 웹 코드가 브라우저/PWA/앱 모두에서 돈다 → 네이티브 기능은 이 값으로 분기.
export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

/** 홈 화면 위젯에 요약 데이터를 넘기는 자체 플러그인(android/…/WidgetBridgePlugin.java) */
export interface WidgetBridgePlugin {
  update(options: { data: string }): Promise<void>;
}
export const WidgetBridge = registerPlugin<WidgetBridgePlugin>("WidgetBridge");

/** 앱이 다른 곳(위젯 버튼·로그인 메일)에서 URL로 열렸을 때 받는 매직링크 콜백 주소 */
export const NATIVE_AUTH_REDIRECT = "com.ounwan.app://login-callback";
