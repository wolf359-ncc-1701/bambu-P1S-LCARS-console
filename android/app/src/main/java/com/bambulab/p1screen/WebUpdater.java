package com.bambulab.p1screen;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * Updates the console's web build from an update source (any server that serves a build's
 * dist/web, such as the Node backend on the PC).
 *
 * The source's version.json names the build and its bundle (web.zip with size and SHA-256).
 * A new build is installed only as a whole: downloaded, checked, unpacked into
 * files/www/<version>.tmp and renamed into place. The web service then serves that
 * directory instead of the bundled assets. The page confirms each boot; a new build that
 * does not confirm within 20 s is rolled back to the previous good one (or the bundled
 * assets) and remembered as bad, so it is not installed again.
 */
final class WebUpdater {
  private static final String TAG = "WebUpdater";
  private static final String PREF_ORIGIN = "web_origin";
  private static final String PREF_ACTIVE = "web_active";
  private static final String PREF_PREV = "web_prev";
  private static final String PREF_TRIAL = "web_trial";
  private static final String PREF_BAD = "web_bad";
  private static final long MAX_BUNDLE = 64L * 1024 * 1024;
  private static final long BOOT_CONFIRM_MS = 20000;
  private static final long MAX_UNPACKED = 256L * 1024 * 1024;
  private static final int MAX_ENTRIES = 4096;

  interface Listener {
    void onInstalled(String version);
    void onRollback(String version);
  }

  private final File root;
  private final SharedPreferences prefs;
  private final Listener listener;
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final OkHttpClient http = new OkHttpClient.Builder()
    .connectTimeout(8, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .build();

  private volatile String state = "";
  private volatile String error = "";
  private volatile long at = 0;
  private final AtomicBoolean busy = new AtomicBoolean(false);
  private volatile boolean recheck = false;
  /* bumped when the source changes; an install for an older source does not commit */
  private final AtomicInteger originGen = new AtomicInteger();
  private volatile long bootDeadline = 0;
  private volatile Thread bootWatch;

  WebUpdater(Context context, SharedPreferences prefs, Listener listener) {
    this.root = new File(context.getFilesDir(), "www");
    this.prefs = prefs;
    this.listener = listener;
  }

  /* ---- serving ---- */

  /** The directory to serve the page from, or null for the bundled assets. */
  File activeDir() {
    String v = prefs.getString(PREF_ACTIVE, "");
    if (v.isEmpty()) return null;
    File dir = new File(root, v);
    return new File(dir, "index.html").isFile() ? dir : null;
  }

  String origin() {
    return prefs.getString(PREF_ORIGIN, "");
  }

  void setOrigin(String origin) {
    String o = origin == null ? "" : origin.trim();
    while (o.endsWith("/")) o = o.substring(0, o.length() - 1);
    if (!o.isEmpty() && !o.matches("(?i)^https?://[^\\s/]+(:\\d+)?$")) {
      error = "bad origin";
      return;
    }
    prefs.edit().putString(PREF_ORIGIN, o).apply();
    originGen.incrementAndGet();
    // a download from the old source is abandoned
    http.dispatcher().cancelAll();
    if (o.isEmpty()) {
      // no source: back to the bundled build
      prefs.edit().putString(PREF_ACTIVE, "").putString(PREF_PREV, "").putBoolean(PREF_TRIAL, false).apply();
      state = "";
      error = "";
    } else {
      check();
    }
  }

  String stateJson() {
    try {
      JSONObject o = new JSONObject();
      o.put("origin", origin());
      o.put("active", prefs.getString(PREF_ACTIVE, ""));
      o.put("state", state);
      o.put("error", error);
      o.put("at", at);
      return o.toString();
    } catch (Exception e) {
      return "";
    }
  }

  /* ---- boot confirmation and rollback ---- */

  /** Called when the page finished loading. A build on trial must confirm in time. */
  void onPageLoaded(Runnable rollbackAndReload) {
    if (!prefs.getBoolean(PREF_TRIAL, false)) return;
    final String trial = prefs.getString(PREF_ACTIVE, "");
    final long deadline = System.currentTimeMillis() + BOOT_CONFIRM_MS;
    bootDeadline = deadline;
    Thread old = bootWatch;
    if (old != null) old.interrupt();
    Thread t = new Thread(() -> {
      try {
        Thread.sleep(BOOT_CONFIRM_MS + 500);
      } catch (InterruptedException ignored) {
        return;
      }
      if (bootDeadline == deadline && prefs.getBoolean(PREF_TRIAL, false)
          && trial.equals(prefs.getString(PREF_ACTIVE, ""))) {
        String bad = trial;
        Log.w(TAG, "build " + bad + " did not confirm its boot, rolling back");
        prefs.edit()
          .putString(PREF_ACTIVE, prefs.getString(PREF_PREV, ""))
          .putBoolean(PREF_TRIAL, false)
          .putString(PREF_BAD, bad)
          .apply();
        state = "rolled back";
        error = bad;
        at = System.currentTimeMillis();
        listener.onRollback(bad);
        rollbackAndReload.run();
      }
    }, "web-boot-watch");
    bootWatch = t;
    t.start();
  }

  void confirmBoot(String build) {
    String active = prefs.getString(PREF_ACTIVE, "");
    if (!prefs.getBoolean(PREF_TRIAL, false) || !active.equals(build)) return;
    bootDeadline = 0;
    Thread w = bootWatch;
    if (w != null) w.interrupt();
    prefs.edit().putBoolean(PREF_TRIAL, false).apply();
    state = "running " + build;
    Log.i(TAG, "build " + build + " confirmed");
    worker.execute(this::prune);
  }

  /* ---- checking and installing ---- */

  void check() {
    final String o = origin();
    if (o.isEmpty()) return;
    if (!busy.compareAndSet(false, true)) {
      // one is running (perhaps for an old source): check again when it ends
      recheck = true;
      return;
    }
    recheck = false;
    final int gen = originGen.get();
    try {
      worker.execute(() -> {
        try {
          install(o, gen);
        } catch (Exception e) {
          if (gen == originGen.get()) {
            Log.w(TAG, "update failed", e);
            error = String.valueOf(e.getMessage());
            state = "failed";
          }
        } finally {
          at = System.currentTimeMillis();
          busy.set(false);
          if (recheck) check();
        }
      });
    } catch (java.util.concurrent.RejectedExecutionException e) {
      busy.set(false); // shut down
    }
  }

  private void install(String origin, int gen) throws Exception {
    state = "checking";
    error = "";
    JSONObject v;
    try (Response r = http.newCall(new Request.Builder().url(origin + "/version.json?t=" + System.currentTimeMillis()).build()).execute()) {
      if (!r.isSuccessful() || r.body() == null) throw new IOException("version.json " + r.code());
      v = new JSONObject(r.body().string());
    }
    String version = v.optString("version", "");
    String bundle = v.optString("bundle", "");
    String sha = v.optString("sha256", "").toLowerCase();
    long size = v.optLong("size", -1);
    // a plain name: never "." or "..", which would point at www itself or above it
    if (!version.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,63}") || bundle.isEmpty() || sha.length() != 64) throw new IOException("no bundle offered");
    if (version.equals(prefs.getString(PREF_ACTIVE, ""))) {
      state = "up to date";
      return;
    }
    if (version.equals(prefs.getString(PREF_BAD, ""))) {
      state = "skipped " + version + " (failed before)";
      return;
    }
    if (size <= 0 || size > MAX_BUNDLE) throw new IOException("bundle size " + size);
    // a build waiting for its boot confirmation is not replaced; the next check installs
    if (prefs.getBoolean(PREF_TRIAL, false)) {
      state = "waiting for " + prefs.getString(PREF_ACTIVE, "") + " to confirm";
      return;
    }

    state = "downloading " + version;
    if (!root.isDirectory() && !root.mkdirs()) throw new IOException("cannot create " + root);
    File zip = new File(root, version + ".zip");
    File tmp = new File(root, version + ".tmp");
    try {
      installFiles(origin, gen, version, bundle, sha, size, zip, tmp);
    } finally {
      // partial downloads and unpacked leftovers never stay behind
      zip.delete();
      deleteTree(tmp);
    }
  }

  private void installFiles(String origin, int gen, String version, String bundle, String sha, long size, File zip, File tmp) throws Exception {
    MessageDigest md = MessageDigest.getInstance("SHA-256");
    long got = 0;
    try (Response r = http.newCall(new Request.Builder().url(origin + "/" + bundle).build()).execute()) {
      if (!r.isSuccessful() || r.body() == null) throw new IOException(bundle + " " + r.code());
      try (InputStream in = r.body().byteStream(); OutputStream out = new FileOutputStream(zip)) {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) {
          got += n;
          if (got > MAX_BUNDLE) throw new IOException("bundle too large");
          md.update(buf, 0, n);
          out.write(buf, 0, n);
        }
      }
    }
    if (got != size || !hex(md.digest()).equals(sha)) throw new IOException("checksum mismatch");

    state = "installing " + version;
    deleteTree(tmp);
    unzip(zip, tmp);
    zip.delete();
    if (!new File(tmp, "index.html").isFile()) throw new IOException("bundle has no index.html");
    if (gen != originGen.get()) throw new IOException("source changed");
    File dir = new File(root, version);
    deleteTree(dir);
    if (!tmp.renameTo(dir)) throw new IOException("cannot move build into place");

    String current = prefs.getString(PREF_ACTIVE, "");
    boolean currentGood = !prefs.getBoolean(PREF_TRIAL, false);
    prefs.edit()
      .putString(PREF_PREV, currentGood ? current : prefs.getString(PREF_PREV, ""))
      .putString(PREF_ACTIVE, version)
      .putBoolean(PREF_TRIAL, true)
      .apply();
    state = "installed " + version;
    Log.i(TAG, "installed build " + version);
    listener.onInstalled(version);
  }

  private static void unzip(File zip, File dir) throws IOException {
    String base = dir.getCanonicalPath() + File.separator;
    try (ZipInputStream in = new ZipInputStream(new BufferedInputStream(new FileInputStream(zip)))) {
      ZipEntry e;
      byte[] buf = new byte[64 * 1024];
      long total = 0;
      int entries = 0;
      while ((e = in.getNextEntry()) != null) {
        if (++entries > MAX_ENTRIES) throw new IOException("too many entries");
        File f = new File(dir, e.getName());
        // never write outside the build directory
        if (!f.getCanonicalPath().startsWith(base)) throw new IOException("bad entry " + e.getName());
        if (e.isDirectory()) {
          f.mkdirs();
          continue;
        }
        File parent = f.getParentFile();
        if (parent != null) parent.mkdirs();
        try (OutputStream out = new FileOutputStream(f)) {
          int n;
          while ((n = in.read(buf)) > 0) {
            total += n;
            if (total > MAX_UNPACKED) throw new IOException("unpacked bundle too large");
            out.write(buf, 0, n);
          }
        }
      }
    }
  }

  /* keeps the running build and the one before it */
  private void prune() {
    String keepA = prefs.getString(PREF_ACTIVE, "");
    String keepB = prefs.getString(PREF_PREV, "");
    File[] list = root.listFiles();
    if (list == null) return;
    for (File f : list) {
      String n = f.getName();
      if (n.equals(keepA) || n.equals(keepB)) continue;
      deleteTree(f);
    }
  }

  private static void deleteTree(File f) {
    if (f == null || !f.exists()) return;
    File[] kids = f.listFiles();
    if (kids != null) for (File k : kids) deleteTree(k);
    f.delete();
  }

  private static String hex(byte[] b) {
    StringBuilder sb = new StringBuilder();
    for (byte x : b) sb.append(String.format(java.util.Locale.US, "%02x", x));
    return sb.toString();
  }

  void shutdown() {
    bootDeadline = 0;
    Thread t = bootWatch;
    if (t != null) t.interrupt();
    worker.shutdownNow();
  }
}
