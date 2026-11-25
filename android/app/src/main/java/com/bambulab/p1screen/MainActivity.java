package com.bambulab.p1screen;

import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Build;
import android.os.PowerManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.webkit.RenderProcessGoneDetail;
import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.graphics.Bitmap;
import android.view.WindowManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.splashscreen.SplashScreen;

import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

import org.json.JSONObject;
import org.json.JSONTokener;

public final class MainActivity extends Activity {
  private static final String WEB_CONSOLE_TAG = "WebConsole";
  private static final String APP_INFO_TAG = "AppInfo";
  private static final int PORT = 8888;
  private static final long EXIT_INTERVAL_MS = 2000L;
  private static final String APP_LIFECYCLE_FOREGROUND = "foreground";
  private static final String APP_LIFECYCLE_BACKGROUND = "background";
  private static final String PREF_LANDSCAPE_HIDE_STATUS_BAR = "landscape_hide_status_bar";
  private static final String PREF_FORCE_LANDSCAPE = "force_landscape";
  private static final String PREF_KEEP_SCREEN_ON = "keep_screen_on";
  private static final String GET_DEVICE_INFO_SCRIPT =
      "(function(){"
    + "try{"
    + "var getInfo=window.__P1ScreenGetDeviceInfo;"
    + "if(typeof getInfo!=='function')return '';"
    + "var info=getInfo();"
    + "return info==null?'':JSON.stringify(info,null,2);"
    + "}catch(e){return '';}"
    + "})()";

  private WebView webView;
  private WebService webService;
  private long lastBackPressedAt;
  private Toast exitToast;
  private SharedPreferences prefs;
  private NativeBridge nativeBridge;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private WebUpdater webUpdater;
  private PowerManager powerManager;
  private PowerManager.WakeLock cpuLock;
  private volatile boolean sleepAllowed = false;
  private SensorManager sensorManager;
  private Sensor proximity;
  // proximity wave: far -> near -> far within this window counts as a hand wave
  private static final long WAVE_MIN_MS = 80;
  private static final long WAVE_MAX_MS = 1500;
  private static final long WAVE_COOLDOWN_MS = 2500;
  private long nearSince = 0;
  private boolean proximityRegistered = false;
  private boolean inBackground = false;
  private long lastWave = 0;
  private final SensorEventListener proximityListener = new SensorEventListener() {
    @Override
    public void onSensorChanged(SensorEvent event) {
      if (proximity == null) return;
      boolean near = event.values[0] < Math.min(5f, proximity.getMaximumRange());
      long now = SystemClock.elapsedRealtime();
      if (near) {
        if (nearSince == 0) nearSince = now;
        return;
      }
      long held = nearSince == 0 ? -1 : now - nearSince;
      nearSince = 0;
      // a phone face down or a covered sensor stays near: not a wave
      if (held < WAVE_MIN_MS || held > WAVE_MAX_MS || now - lastWave < WAVE_COOLDOWN_MS) return;
      lastWave = now;
      onWave();
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
    }
  };

  @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    prefs = getPreferences(MODE_PRIVATE);
    nativeBridge = new NativeBridge();
    if (nativeBridge.getForceLandscape()) {
      setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
    }
    if (nativeBridge.getKeepScreenOn()) {
      getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    powerManager = (PowerManager) getSystemService(POWER_SERVICE);
    webUpdater = new WebUpdater(getApplicationContext(), prefs, new WebUpdater.Listener() {
      @Override
      public void onInstalled(String version) {
        mainHandler.post(() -> dispatchWebUpdate());
      }

      @Override
      public void onRollback(String version) {
        mainHandler.post(() -> dispatchWebUpdate());
      }
    });
    applyWebOriginExtra(getIntent());

    startWebService();

    SplashScreen.installSplashScreen(this);

    // the console may switch the screen back on by itself (a job starts, an alert, a wave)
    if (Build.VERSION.SDK_INT >= 27) {
      setShowWhenLocked(true);
    } else {
      getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
    }
    sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
    if (sensorManager != null) {
      proximity = Build.VERSION.SDK_INT >= 21 ? sensorManager.getDefaultSensor(Sensor.TYPE_PROXIMITY, true) : null;
      if (proximity == null) proximity = sensorManager.getDefaultSensor(Sensor.TYPE_PROXIMITY);
      // registered while the console is in front, and through its own idle sleep, so a
      // wave also works with the screen off; not while another app is in front
      registerProximity();
    }

    setContentView(R.layout.activity_main);

    webView = findViewById(R.id.web_view);
    webView.setPadding(0, 0, 0, 0);
    webView.setBackgroundColor(0xFF2C2C2C);
    webView.setHapticFeedbackEnabled(false);
    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onConsoleMessage(ConsoleMessage message) {
        switch (message.messageLevel()) {
          case TIP:
            Log.v(WEB_CONSOLE_TAG, message.message());
            break;
          case LOG:
            Log.d(WEB_CONSOLE_TAG, message.message());
            break;
          case WARNING:
            Log.w(WEB_CONSOLE_TAG, message.message());
            break;
          case ERROR:
            Log.e(WEB_CONSOLE_TAG, message.message());
            break;
          case DEBUG:
          default:
            Log.i(WEB_CONSOLE_TAG, message.message());
            break;
        }
        return true;
      }
    });

    webView.setWebViewClient(new WebViewClient() {
      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return openExternalBrowserIfNeeded(request.getUrl());
      }

      @Override
      public boolean shouldOverrideUrlLoading(WebView view, String url) {
        return openExternalBrowserIfNeeded(Uri.parse(url));
      }

      @Override
      public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
        lastBackPressedAt = 0;
      }

      @Override
      public void onPageStarted(WebView view, String url, Bitmap favicon) {
        // a freshly installed build must confirm its boot, or it is rolled back; the clock
        // starts with the navigation, so a build that never finishes loading is caught too
        webUpdater.onPageLoaded(() -> mainHandler.post(() -> {
          if (webView != null) {
            webView.clearCache(true);
            webView.reload();
          }
        }));
      }

      @Override
      public void onPageFinished(WebView view, String url) {
        view.postDelayed(() -> view.setVisibility(View.VISIBLE), 800);
      }

      /* A console that runs for weeks will eventually lose its renderer (OOM kill, GPU
         driver reset). Without this the activity would crash or show a dead page; instead
         rebuild the activity, which reloads the console. */
      @TargetApi(26)
      @Override
      public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        Log.e(APP_INFO_TAG, "WebView renderer gone (crashed=" + detail.didCrash() + "), recreating");
        if (view == webView) {
          webView = null;
        }
        ViewGroup parent = (ViewGroup) view.getParent();
        if (parent != null) {
          parent.removeView(view);
        }
        view.destroy();
        mainHandler.postDelayed(() -> {
          if (!isFinishing() && !isDestroyed()) {
            recreate();
          }
        }, 1000);
        return true;
      }
    });

    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setLoadsImagesAutomatically(true);
    webView.addJavascriptInterface(nativeBridge, "P1ScreenBridge");
    logRuntimeInfo(settings);

    WebView.setWebContentsDebuggingEnabled(true);

    applyWindowInsets();
    applyFullscreen();

    webView.loadUrl(getBaseUrl());
  }

  @Override
  protected void onResume() {
    super.onResume();
    inBackground = false;
    registerProximity();
    if (sleepAllowed) applySleepAllowed(true);
    applyFullscreen();
    dispatchAppLifecycleEvent(APP_LIFECYCLE_FOREGROUND);
  }

  @Override
  protected void onPause() {
    super.onPause();
    // the screen went off by the console's own idle sleep: stay connected, so a new job
    // or an alert can switch it back on
    if (sleepAllowed && !isFinishing() && powerManager != null && !powerManager.isInteractive()) {
      return;
    }
    // really in the background: no waves, and the CPU may sleep
    inBackground = true;
    unregisterProximity();
    if (cpuLock != null && cpuLock.isHeld()) cpuLock.release();
    dispatchAppLifecycleEvent(APP_LIFECYCLE_BACKGROUND);
  }

  private void registerProximity() {
    if (proximityRegistered || sensorManager == null || proximity == null) return;
    nearSince = 0;
    proximityRegistered = sensorManager.registerListener(proximityListener, proximity, SensorManager.SENSOR_DELAY_NORMAL);
  }

  private void unregisterProximity() {
    if (!proximityRegistered || sensorManager == null) return;
    sensorManager.unregisterListener(proximityListener);
    proximityRegistered = false;
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    applyWebOriginExtra(intent);
  }

  /* adb shell am start -n com.bambulab.p1screen/.MainActivity --es webOrigin http://pc:8889 */
  private void applyWebOriginExtra(Intent intent) {
    if (intent == null || !intent.hasExtra("webOrigin")) return;
    // any app on the phone can send this intent: only debug builds accept it (a release
    // build takes its update source from the settings page)
    if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) {
      Log.w(APP_INFO_TAG, "webOrigin extra ignored: not a debug build");
      return;
    }
    webUpdater.setOrigin(intent.getStringExtra("webOrigin"));
  }

  private void dispatchWebUpdate() {
    if (webView == null) return;
    webView.evaluateJavascript("(function(){var h=window.__P1ScreenOnWebUpdate;if(typeof h==='function')h();})()", null);
  }

  private void onWave() {
    mainHandler.post(() -> {
      if (powerManager != null && !powerManager.isInteractive()) {
        wakeScreenNow();
      }
      if (webView != null) {
        webView.evaluateJavascript("(function(){var h=window.__P1ScreenOnWave;if(typeof h==='function')h();})()", null);
      }
    });
  }

  @SuppressWarnings("deprecation")
  private void wakeScreenNow() {
    if (powerManager == null || powerManager.isInteractive()) return;
    PowerManager.WakeLock lock = powerManager.newWakeLock(
      PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
      "p1screen:wake");
    lock.acquire(3000);
  }

  private void applySleepAllowed(boolean allowed) {
    sleepAllowed = allowed;
    if (allowed) {
      // the system's screen timeout may now switch the screen off; the CPU stays awake
      // (the phone is on a charger) so the console keeps following the printer
      getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      if (cpuLock == null && powerManager != null) {
        cpuLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "p1screen:follow");
        cpuLock.setReferenceCounted(false);
      }
      if (cpuLock != null && !cpuLock.isHeld() && !inBackground) cpuLock.acquire();
    } else {
      if (nativeBridge.getKeepScreenOn()) {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      }
      if (cpuLock != null && cpuLock.isHeld()) cpuLock.release();
    }
  }

  @Override
  public void onConfigurationChanged(Configuration newConfig) {
    super.onConfigurationChanged(newConfig);
    applyFullscreen();
    View decorView = getWindow().getDecorView();
    decorView.requestApplyInsets();
  }

  @Override
  public void onBackPressed() {
    if (webView != null && webView.canGoBack()) {
      webView.goBack();
      return;
    }
    long now = SystemClock.elapsedRealtime();
    if (now - lastBackPressedAt < EXIT_INTERVAL_MS) {
      finishAndRemoveTask();
      return;
    }
    lastBackPressedAt = now;
    if (exitToast != null) {
      exitToast.cancel();
    }
    exitToast = Toast.makeText(this, R.string.exit_toast, Toast.LENGTH_SHORT);
    exitToast.show();
  }

  private boolean openExternalBrowserIfNeeded(Uri uri) {
    if (uri == null || shouldHandleInWebView(uri)) {
      return false;
    }

    try {
      Intent intent = new Intent(Intent.ACTION_VIEW, uri);
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      startActivity(intent);
      return true;
    } catch (Exception e) {
      Log.e(APP_INFO_TAG, "Failed to open external url", e);
      return false;
    }
  }

  private static boolean shouldHandleInWebView(Uri uri) {
    String scheme = uri.getScheme();
    if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
      return true;
    }

    String host = uri.getHost();
    boolean isLocalHost = "127.0.0.1".equals(host) || "localhost".equalsIgnoreCase(host);
    return isLocalHost && !"/api/getDeviceInfo".equals(uri.getPath());
  }

  public final class NativeBridge {
    @JavascriptInterface
    public boolean isAvailable() {
      return true;
    }

    @JavascriptInterface
    public boolean getLandscapeHideStatusBar() {
      return prefs.getBoolean(PREF_LANDSCAPE_HIDE_STATUS_BAR, false);
    }

    @JavascriptInterface
    public void setLandscapeHideStatusBar(boolean hide) {
      prefs.edit().putBoolean(PREF_LANDSCAPE_HIDE_STATUS_BAR, hide).apply();
      mainHandler.post(() -> {
        applyFullscreen();
        getWindow().getDecorView().requestApplyInsets();
      });
    }

    @JavascriptInterface
    public boolean getForceLandscape() {
      return prefs.getBoolean(PREF_FORCE_LANDSCAPE, false);
    }

    @JavascriptInterface
    public void setForceLandscape(boolean force) {
      prefs.edit().putBoolean(PREF_FORCE_LANDSCAPE, force).apply();
      mainHandler.post(() -> {
        if (force) {
          setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        } else {
          setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
      });
    }

    /* Window brightness for this activity only (no system permission needed).
       A value below zero hands brightness back to the system setting. */
    @JavascriptInterface
    public void setBrightness(float level) {
      mainHandler.post(() -> {
        if (isFinishing() || isDestroyed()) {
          return;
        }
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.screenBrightness = level < 0
          ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
          : Math.max(0.01f, Math.min(1f, level));
        getWindow().setAttributes(lp);
      });
    }

    /* Battery state from the sticky ACTION_BATTERY_CHANGED broadcast: level (%),
       temperature (deg C), whether it is plugged in. Used to back off effects when hot. */
    @JavascriptInterface
    public String getBattery() {
      try {
        Intent i = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (i == null) {
          return "";
        }
        int level = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = i.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        int temp = i.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1);
        int plugged = i.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
        JSONObject o = new JSONObject();
        o.put("level", scale > 0 && level >= 0 ? level * 100 / scale : -1);
        o.put("temp", temp >= 0 ? temp / 10.0 : -1);
        o.put("plugged", plugged != 0);
        return o.toString();
      } catch (Exception e) {
        return "";
      }
    }

    /* Idle sleep: true lets the system screen timeout switch the screen off. */
    @JavascriptInterface
    public void setSleepAllowed(boolean allowed) {
      mainHandler.post(() -> {
        if (!isFinishing() && !isDestroyed()) applySleepAllowed(allowed);
      });
    }

    /* Switches a sleeping screen back on; does nothing when it is on. */
    @JavascriptInterface
    public void wakeScreen() {
      mainHandler.post(() -> wakeScreenNow());
    }

    @JavascriptInterface
    public void confirmBoot(String build) {
      webUpdater.confirmBoot(build);
    }

    @JavascriptInterface
    public void checkWebUpdate() {
      webUpdater.check();
    }

    @JavascriptInterface
    public String getWebUpdateState() {
      return webUpdater.stateJson();
    }

    @JavascriptInterface
    public void setWebOrigin(String origin) {
      webUpdater.setOrigin(origin);
    }

    @JavascriptInterface
    public boolean getKeepScreenOn() {
      return prefs.getBoolean(PREF_KEEP_SCREEN_ON, false);
    }

    @JavascriptInterface
    public void setKeepScreenOn(boolean keepOn) {
      prefs.edit().putBoolean(PREF_KEEP_SCREEN_ON, keepOn).apply();
      mainHandler.post(() -> {
        if (keepOn) {
          getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
          getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
      });
    }
  }

  private String getDeviceInfoJsonFromWebView() throws IOException {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      throw new IOException("Cannot request device info from the main thread");
    }

    if (webView == null) {
      throw new IOException("WebView is not available");
    }

    CountDownLatch latch = new CountDownLatch(1);
    AtomicReference<String> result = new AtomicReference<>();
    AtomicReference<Exception> error = new AtomicReference<>();

    mainHandler.post(() -> {
      if (webView == null) {
        error.set(new IOException("WebView is not available"));
        latch.countDown();
        return;
      }

      webView.evaluateJavascript(GET_DEVICE_INFO_SCRIPT, value -> {
        try {
          result.set(decodeJavascriptStringResult(value));
        } catch (Exception e) {
          error.set(e);
        } finally {
          latch.countDown();
        }
      });
    });

    try {
      latch.await();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IOException("Interrupted while requesting device info", e);
    }

    if (error.get() != null) {
      throw new IOException("Failed to request device info", error.get());
    }

    String deviceInfoJson = result.get();
    return deviceInfoJson == null ? "" : deviceInfoJson;
  }

  private static String decodeJavascriptStringResult(String value) throws Exception {
    if (value == null || "null".equals(value)) {
      return "";
    }
    Object decodedValue = new JSONTokener(value).nextValue();
    if (decodedValue == null || decodedValue == JSONObject.NULL) {
      return "";
    }
    return String.valueOf(decodedValue);
  }

  private void dispatchAppLifecycleEvent(String state) {
    if (webView == null) {
      return;
    }
    String script = "(function(){"
      + "var handler=window.__P1ScreenOnAppLifecycle;"
      + "if(typeof handler==='function'){handler(" + JSONObject.quote(state) + ");}"
      + "})()";
    webView.evaluateJavascript(script, null);
  }

  private void applyFullscreen() {
    int orientation = getResources().getConfiguration().orientation;
    View decorView = getWindow().getDecorView();
    if (orientation == Configuration.ORIENTATION_LANDSCAPE) {
      int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
      if (nativeBridge.getLandscapeHideStatusBar()) {
        flags |= View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
               | View.SYSTEM_UI_FLAG_FULLSCREEN;
      }
      decorView.setSystemUiVisibility(flags);
    } else {
      int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
      decorView.setSystemUiVisibility(flags);
    }
  }

  private void applyWindowInsets() {
    View decorView = getWindow().getDecorView();
    decorView.setOnApplyWindowInsetsListener((v, insets) -> {
      int orientation = getResources().getConfiguration().orientation;
      if (orientation == Configuration.ORIENTATION_LANDSCAPE) {
//        v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), 0);
//        return insets.consumeSystemWindowInsets();
        boolean hideStatusBar = nativeBridge.getLandscapeHideStatusBar();
        int topPadding = hideStatusBar ? 0 : insets.getSystemWindowInsetTop();
        v.setPadding(0, topPadding, 0, 0);
      } else {
        v.setPadding(0, 0, 0, 0);
      }
      return insets;
    });
  }

  private void startWebService() {
    if (webService != null && webService.isAlive()) {
      return;
    }
    try {
      if (webService == null) {
        webService = new WebService(PORT, getApplicationContext(), this::getDeviceInfoJsonFromWebView, () -> webUpdater.activeDir());
      }
      webService.start();
    } catch (IOException e) {
      throw new IllegalStateException("Failed to start local web service", e);
    }
  }

  private void stopWebService() {
    if (webService == null) {
      return;
    }
    webService.stop();
    webService = null;
  }

  private static String getBaseUrl() {
    return "http://127.0.0.1:" + PORT + "/";
  }

  private void logRuntimeInfo(WebSettings settings) {
    String appVersion = "unknown";
    try {
      appVersion = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
    } catch (Exception ignored) {
    }
    Log.i(APP_INFO_TAG, "appVersion=" + appVersion);
    Log.i(APP_INFO_TAG, "userAgentString=" + settings.getUserAgentString());
  }

  @Override
  protected void onDestroy() {
    mainHandler.removeCallbacksAndMessages(null);
    unregisterProximity();
    if (cpuLock != null && cpuLock.isHeld()) cpuLock.release();
    if (webUpdater != null) webUpdater.shutdown();
    stopWebService();
    if (webView != null) {
      ViewGroup parent = (ViewGroup) webView.getParent();
      if (parent != null) {
        parent.removeView(webView);
      }
      webView.stopLoading();
      webView.destroy();
      webView = null;
    }
    super.onDestroy();
  }
}
