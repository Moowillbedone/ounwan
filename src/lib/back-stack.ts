"use client";

// 안드로이드 뒤로가기 버튼 처리용 '닫을 것' 스택.
// 바텀시트·메뉴가 열려 있으면 뒤로가기가 화면 이동 대신 가장 위에 열린 것부터 닫는다.
// (실제 버튼 연결은 NativeBridge의 App 'backButton' 리스너)

import { useEffect, useRef } from "react";

const stack: Array<() => void> = [];

/** 가장 최근에 열린 것을 닫았으면 true, 닫을 게 없으면 false */
export function closeTopOverlay(): boolean {
  const close = stack[stack.length - 1];
  if (!close) return false;
  close();
  return true;
}

/** open인 동안 뒤로가기를 누르면 onClose가 호출되도록 등록 */
export function useBackClose(open: boolean, onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!open) return;
    const close = () => ref.current();
    stack.push(close);
    return () => {
      const i = stack.lastIndexOf(close);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [open]);
}
