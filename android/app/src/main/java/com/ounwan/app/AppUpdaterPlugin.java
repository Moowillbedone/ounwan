package com.ounwan.app;

import android.content.Intent;
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
        if (url == null) {
            call.reject("url이 필요해요");
            return;
        }
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("저장 폴더를 만들 수 없어요");
                File out = new File(dir, "ounwan-update.apk");
                download(url, out);

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

    private void download(String url, File out) throws IOException {
        URL current = new URL(url);
        HttpURLConnection c = null;
        // GitHub 릴리스는 다른 호스트로 리다이렉트하므로 직접 따라간다(최대 5번)
        for (int hop = 0; hop < 5; hop++) {
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
