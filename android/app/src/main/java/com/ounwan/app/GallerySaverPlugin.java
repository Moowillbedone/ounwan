package com.ounwan.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * 이미지를 휴대폰 사진첩(Pictures/오운완)에 저장 — 러닝 공유 카드의 [저장] (src/lib/share-card.ts 의 GallerySaver).
 * 안드로이드 10+는 MediaStore로 저장해 권한이 필요 없고, 9 이하만 저장소 쓰기 권한을 묻는다.
 */
@CapacitorPlugin(
        name = "GallerySaver",
        permissions = {
                @Permission(alias = "storage", strings = {Manifest.permission.WRITE_EXTERNAL_STORAGE})
        }
)
public class GallerySaverPlugin extends Plugin {

    /** { data: base64(접두어 없이), fileName, album } → { uri } */
    @PluginMethod
    public void saveImage(PluginCall call) {
        if (call.getString("data") == null) {
            call.reject("저장할 이미지가 없어요");
            return;
        }
        if (Build.VERSION.SDK_INT < 29 && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermissionCallback");
            return;
        }
        save(call);
    }

    @PermissionCallback
    private void storagePermissionCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) save(call);
        else call.reject("사진을 저장하려면 저장공간 권한이 필요해요");
    }

    private void save(PluginCall call) {
        final String data = call.getString("data");
        final String fileName = safeName(call.getString("fileName", "ounwan.jpg"));
        final String album = safeName(call.getString("album", "오운완"));
        final String mime = fileName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
        new Thread(() -> {
            try {
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                Uri uri;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentResolver r = getContext().getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                    v.put(MediaStore.Images.Media.MIME_TYPE, mime);
                    v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + album);
                    v.put(MediaStore.Images.Media.IS_PENDING, 1);
                    uri = r.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
                    if (uri == null) throw new IOException("사진첩에 자리를 만들 수 없어요");
                    try (OutputStream os = r.openOutputStream(uri)) {
                        if (os == null) throw new IOException("사진첩에 쓸 수 없어요");
                        os.write(bytes);
                    } catch (IOException e) {
                        r.delete(uri, null, null);
                        throw e;
                    }
                    v.clear();
                    v.put(MediaStore.Images.Media.IS_PENDING, 0);
                    r.update(uri, v, null, null);
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), album);
                    if (!dir.exists() && !dir.mkdirs()) throw new IOException("사진 폴더를 만들 수 없어요");
                    File f = new File(dir, fileName);
                    try (FileOutputStream fo = new FileOutputStream(f)) {
                        fo.write(bytes);
                    }
                    MediaScannerConnection.scanFile(getContext(), new String[]{f.getAbsolutePath()}, new String[]{mime}, null);
                    uri = Uri.fromFile(f);
                }
                JSObject res = new JSObject();
                res.put("uri", uri.toString());
                call.resolve(res);
            } catch (Exception e) {
                call.reject("이미지를 저장하지 못했어요: " + e.getMessage());
            }
        }).start();
    }

    /** 파일·폴더 이름에서 경로 구분자 등 위험한 글자 제거 */
    private static String safeName(String s) {
        String t = s == null ? "" : s.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return t.isEmpty() ? "ounwan" : t;
    }
}
