package com.ounwan.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * 앱 안에서 새 APK를 받아 설치 화면을 여는 플러그인 (src/lib/updater.ts 의 AppUpdater).
 * 브라우저 다운로드를 거치지 않으므로 크롬의 APK 다운로드 멈춤 문제를 피한다.
 * 같은 서명 키로 만든 APK라서 기존 앱 위에 덮어 설치된다(기록 유지).
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    /** '이 출처의 앱 설치 허용'이 켜져 있는지 */
    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < 26
                || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject r = new JSObject();
        r.put("allowed", allowed);
        call.resolve(r);
    }

    /** 오운완의 '출처를 알 수 없는 앱 설치' 설정 화면 열기 */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /** APK를 받아(진행률은 'progress' 이벤트) 설치 화면을 연다 */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith(RELEASE_PREFIX)) {
            // 이 저장소의 릴리스 APK만 받는다(화면 코드가 변조돼도 다른 파일을 설치하게 할 수 없음)
            call.reject("허용되지 않은 업데이트 주소예요");
            return;
        }
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("저장 폴더를 만들 수 없어요");
                File out = new File(dir, "ounwan-update.apk");
                download(url, out);
                // 받은 APK가 '같은 앱 + 같은 서명 키'인지 확인한 뒤에만 설치 화면을 연다
                if (!isSameAppAndSigner(out)) {
                    //noinspection ResultOfMethodCallIgnored
                    out.delete();
                    call.reject("받은 파일의 서명이 설치된 앱과 달라 설치하지 않았어요");
                    return;
                }

                Uri uri = FileProvider.getUriForFile(getContext(),
                        getContext().getPackageName() + ".fileprovider", out);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
            } catch (Exception e) {
                call.reject("업데이트를 받지 못했어요: " + e.getMessage());
            }
        }).start();
    }

    private static final String RELEASE_PREFIX =
            "https://github.com/Moowillbedone/ounwan/releases/download/";

    /** 리다이렉트는 GitHub 다운로드 호스트로만 따라간다 */
    private static boolean isAllowedHost(URL u) {
        String h = u.getHost();
        return "https".equals(u.getProtocol())
                && (h.equals("github.com") || h.endsWith(".githubusercontent.com"));
    }

    /** 받은 APK의 패키지명·서명 인증서가 설치된 오운완과 같은지 */
    private boolean isSameAppAndSigner(File apk) {
        try {
            PackageManager pm = getContext().getPackageManager();
            String me = getContext().getPackageName();
            int flags = Build.VERSION.SDK_INT >= 28
                    ? PackageManager.GET_SIGNING_CERTIFICATES
                    : PackageManager.GET_SIGNATURES;
            PackageInfo downloaded = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
            if (downloaded == null || !me.equals(downloaded.packageName)) return false;
            PackageInfo installed = pm.getPackageInfo(me, flags);
            Set<String> a = certHashes(downloaded);
            Set<String> b = certHashes(installed);
            return !a.isEmpty() && a.equals(b);
        } catch (Exception e) {
            return false;
        }
    }

    @SuppressWarnings("deprecation")
    private static Set<String> certHashes(PackageInfo info) throws Exception {
        Signature[] sigs;
        if (Build.VERSION.SDK_INT >= 28) {
            if (info.signingInfo == null) return Collections.emptySet();
            sigs = info.signingInfo.hasMultipleSigners()
                    ? info.signingInfo.getApkContentsSigners()
                    : info.signingInfo.getSigningCertificateHistory();
        } else {
            sigs = info.signatures;
        }
        Set<String> out = new HashSet<>();
        if (sigs == null) return out;
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        for (Signature s : sigs) {
            byte[] d = md.digest(s.toByteArray());
            StringBuilder sb = new StringBuilder();
            for (byte x : d) sb.append(String.format("%02x", x));
            out.add(sb.toString());
        }
        return out;
    }

    private void download(String url, File out) throws IOException {
        URL current = new URL(url);
        HttpURLConnection c = null;
        // GitHub 릴리스는 다른 호스트로 리다이렉트하므로 직접 따라간다(최대 5번)
        for (int hop = 0; hop < 5; hop++) {
            if (!isAllowedHost(current)) throw new IOException("허용되지 않은 다운로드 주소");
            c = (HttpURLConnection) current.openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) throw new IOException("리다이렉트 주소가 없어요");
                current = new URL(current, loc);
                continue;
            }
            if (code != 200) throw new IOException("HTTP " + code);
            break;
        }
        if (c == null) throw new IOException("연결 실패");

        long total = c.getContentLengthLong();
        try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(out)) {
            byte[] buf = new byte[64 * 1024];
            long done = 0;
            int lastPct = -1;
            int n;
            while ((n = in.read(buf)) > 0) {
                fo.write(buf, 0, n);
                done += n;
                if (total > 0) {
                    int pct = (int) (done * 100 / total);
                    if (pct != lastPct) {
                        lastPct = pct;
                        JSObject p = new JSObject();
                        p.put("percent", pct);
                        notifyListeners("progress", p);
                    }
                }
            }
        } finally {
            c.disconnect();
        }
    }
}
