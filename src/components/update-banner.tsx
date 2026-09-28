"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { isNativeApp } from "@/lib/native";
import { checkForUpdate, installUpdate, type UpdateInfo } from "@/lib/updater";
import { useToast } from "./ui";

const CHECK_KEY = "ounwan-update-check";
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000; // 6시간에 한 번만 확인(GitHub API 호출 절약)

/** 앱(APK)에 새 버전이 있으면 화면 위쪽에 알려주고, 누르면 앱 안에서 받아 설치 화면을 연다 */
export function UpdateBanner() {
  const toast = useToast();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    try {
      const last = Number(localStorage.getItem(CHECK_KEY) || 0);
      if (Date.now() - last < CHECK_EVERY_MS) return;
      localStorage.setItem(CHECK_KEY, String(Date.now()));
    } catch {
      /* noop */
    }
    void checkForUpdate().then((r) => r?.available && setInfo(r));
  }, []);

  if (!info || hidden) return null;

  const onUpdate = async () => {
    try {
      setPct(0);
      const r = await installUpdate(info.url, setPct);
      if (r === "needs-permission")
        toast("설정에서 '이 출처 허용'을 켠 뒤 다시 눌러 주세요");
    } catch (e) {
      toast(String((e as Error)?.message ?? "업데이트를 받지 못했어요"), "error");
    } finally {
      setPct(null);
    }
  };

  return (
    <div className="mx-4 mt-3 flex items-center gap-2 rounded-app border border-brand/30 bg-brand-soft/60 px-3 py-2.5">
      <Download size={16} className="shrink-0 text-brand" />
      <span className="flex-1 text-[13px] leading-snug text-text-2">
        새 버전 <b className="text-text">v{info.latest}</b>이 있어요
        <span className="text-text-3"> (지금 v{info.current})</span>
      </span>
      <button
        onClick={onUpdate}
        disabled={pct != null}
        className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white active:scale-95 disabled:opacity-70"
      >
        {pct != null ? `받는 중 ${pct}%` : "업데이트"}
      </button>
      <button onClick={() => setHidden(true)} aria-label="닫기" className="shrink-0 text-text-3">
        <X size={16} />
      </button>
    </div>
  );
}
