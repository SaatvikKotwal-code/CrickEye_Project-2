package com.crickeye.pro;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.widget.Toast;

import java.io.InputStream;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "CrickEyePro";
    private static final int PERMISSION_REQ_CODE = 1001;
    private static final int FILE_CHOOSER_REQ_CODE = 2001;

    private WebView mWebView;
    private ValueCallback<Uri[]> mFilePathCallback;
    private Vibrator mVibrator;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Initialize Vibrator service
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            if (vm != null) mVibrator = vm.getDefaultVibrator();
        } else {
            mVibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        }

        // Enable window hardware acceleration for smooth 60fps rendering without CPU fallback
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );

        mWebView = new WebView(this);
        mWebView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null);
        setContentView(mWebView);

        configureWebView();
        checkAndRequestPermissions();

        // Load CrickEye Pro application from bundled assets
        mWebView.loadUrl("file:///android_asset/index.html");
    }

    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(true);
        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // Custom User-Agent tag to identify Android native container
        String defaultUa = settings.getUserAgentString();
        settings.setUserAgentString(defaultUa + " CrickEyeProMobile/1.0 (Android Native)");

        // Expose Native Android Bridge to JavaScript
        mWebView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Keep file and local routes inside WebView; open external schemes via Intent
                if (url.startsWith("file://") || url.contains("localhost") || url.contains("10.") || url.contains("192.168.") || url.contains("172.") || url.contains("trycloudflare.com")) {
                    return false;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    return false;
                }
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if (path != null && (path.endsWith("app.js") || path.endsWith("App.js"))) {
                    try {
                        InputStream stream = getAssets().open("App.js");
                        return new WebResourceResponse("application/javascript", "UTF-8", stream);
                    } catch (Exception e) {
                        Log.e(TAG, "Failed to intercept App.js: " + e.getMessage());
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }
        });

        mWebView.setWebChromeClient(new WebChromeClient() {
            // Auto-grant WebRTC Camera and Microphone permissions to the local web app
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    String[] resources = request.getResources();
                    request.grant(resources);
                    Log.d(TAG, "WebRTC hardware permissions granted to WebView");
                });
            }

            // Native Android video and gallery file chooser
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                if (mFilePathCallback != null) {
                    mFilePathCallback.onReceiveValue(null);
                }
                mFilePathCallback = filePathCallback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("video/*");

                Intent chooser = Intent.createChooser(intent, "Select Cricket Delivery Video");
                try {
                    startActivityForResult(chooser, FILE_CHOOSER_REQ_CODE);
                } catch (Exception e) {
                    mFilePathCallback = null;
                    Toast.makeText(MainActivity.this, "Cannot open file picker", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d(TAG + "-JS", consoleMessage.message() + " -- From line "
                        + consoleMessage.lineNumber() + " of " + consoleMessage.sourceId());
                return true;
            }
        });
    }

    private void checkAndRequestPermissions() {
        List<String> permissionsNeeded = new ArrayList<>();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            permissionsNeeded.add(Manifest.permission.CAMERA);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            permissionsNeeded.add(Manifest.permission.RECORD_AUDIO);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_VIDEO) != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.READ_MEDIA_VIDEO);
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            }
        }

        if (!permissionsNeeded.isEmpty()) {
            ActivityCompat.requestPermissions(this,
                    permissionsNeeded.toArray(new String[0]), PERMISSION_REQ_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQ_CODE) {
            boolean allGranted = true;
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }
            if (allGranted) {
                Log.d(TAG, "All runtime permissions granted");
                mWebView.reload();
            } else {
                Toast.makeText(this, "Camera & storage permissions needed for live capture", Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQ_CODE) {
            if (mFilePathCallback != null) {
                Uri[] results = null;
                if (resultCode == RESULT_OK && data != null) {
                    Uri dataUri = data.getData();
                    if (dataUri != null) {
                        results = new Uri[]{dataUri};
                    }
                }
                mFilePathCallback.onReceiveValue(results);
                mFilePathCallback = null;
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (mWebView != null) {
            mWebView.evaluateJavascript(
                "(function(){ try { if (window.handleAndroidBack && window.handleAndroidBack()) return 'consumed'; } catch(e){} return 'bubble'; })()",
                value -> {
                    if ("\"consumed\"".equals(value)) {
                        return;
                    }
                    runOnUiThread(() -> {
                        if (mWebView != null && mWebView.canGoBack()) {
                            mWebView.goBack();
                        } else {
                            MainActivity.super.onBackPressed();
                        }
                    });
                }
            );
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (mWebView != null) {
            // Signal JS to stop camera feed immediately so hardware releases
            mWebView.evaluateJavascript("if (typeof stopWebcamStream === 'function') stopWebcamStream();", null);
            mWebView.onPause();
            mWebView.pauseTimers();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (mWebView != null) {
            mWebView.onResume();
            mWebView.resumeTimers();
        }
    }

    @Override
    protected void onDestroy() {
        if (mWebView != null) {
            mWebView.loadUrl("about:blank");
            mWebView.stopLoading();
            mWebView.setWebChromeClient(null);
            mWebView.setWebViewClient(null);
            mWebView.destroy();
            mWebView = null;
        }
        super.onDestroy();
    }

    // ── Native JavaScript Interface ──────────────────────────────────────────
    public class AndroidBridge {

        @JavascriptInterface
        public void vibrate(long milliseconds) {
            if (mVibrator == null || !mVibrator.hasVibrator()) return;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    mVibrator.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    mVibrator.vibrate(milliseconds);
                }
            } catch (Exception e) {
                Log.w(TAG, "Vibration failed", e);
            }
        }

        @JavascriptInterface
        public void vibratePattern(final String type) {
            if (mVibrator == null || !mVibrator.hasVibrator()) return;
            try {
                if ("countdown".equalsIgnoreCase(type)) {
                    vibrate(60);
                } else if ("start".equalsIgnoreCase(type)) {
                    vibrate(250);
                } else if ("stop".equalsIgnoreCase(type)) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        long[] timings = new long[]{0, 100, 100, 150};
                        mVibrator.vibrate(VibrationEffect.createWaveform(timings, -1));
                    } else {
                        long[] timings = new long[]{0, 100, 100, 150};
                        mVibrator.vibrate(timings, -1);
                    }
                } else {
                    vibrate(80);
                }
            } catch (Exception e) {
                Log.w(TAG, "vibratePattern error", e);
            }
        }

        @JavascriptInterface
        public void setKeepScreenOn(final boolean keepOn) {
            runOnUiThread(() -> {
                try {
                    if (keepOn) {
                        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    } else {
                        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    }
                } catch (Exception e) {
                    Log.w(TAG, "setKeepScreenOn error", e);
                }
            });
        }

        @JavascriptInterface
        public void showToast(final String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public boolean isNativeApp() {
            return true;
        }

        @JavascriptInterface
        public String getDeviceModel() {
            return Build.MANUFACTURER + " " + Build.MODEL;
        }

        @JavascriptInterface
        public int getAndroidVersion() {
            return Build.VERSION.SDK_INT;
        }
    }
}
