package com.bambulab.p1screen;

import android.content.Context;
import android.content.res.AssetManager;
import android.text.TextUtils;
import android.util.Log;

import fi.iki.elonen.NanoHTTPD;
import fi.iki.elonen.NanoWSD;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;

import org.json.JSONObject;
import org.json.JSONTokener;
import java.util.Map;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public final class WebService extends NanoWSD {
  private static final String TAG = "WebService";

  private final Context appContext;
  private final HttpProxyHandler httpProxyHandler;
  private final DeviceInfoProvider deviceInfoProvider;
  private final WebRootProvider webRootProvider;
  private final File logFile;
  private static final long LOG_MAX_BYTES = 1024 * 1024;

  public WebService(int port, Context context, DeviceInfoProvider deviceInfoProvider, WebRootProvider webRootProvider) {
    super(port);
    appContext = context;
    httpProxyHandler = new HttpProxyHandler();
    this.deviceInfoProvider = deviceInfoProvider;
    this.webRootProvider = webRootProvider;
    this.logFile = new File(new File(context.getFilesDir(), "logs"), "frontend.log");
  }

  @Override
  public void start() throws IOException {
    start(0, false);
    Log.i(TAG, "started on port " + getListeningPort());
  }

  @Override
  public void stop() {
    super.stop();
    Log.i(TAG, "stopped");
  }

  @Override
  protected Response serveHttp(IHTTPSession session) {
    Log.d(TAG, "http " + session.getMethod() + " " + session.getUri());

    String uri = session.getUri();
    if (uri.startsWith("/api/https/")) {
      return httpProxyHandler.handle(session);
    }

    if ("/api/log".equals(uri)) {
      return Method.POST == session.getMethod() ? appendLog(session) : readLog();
    }

    if (Method.GET != session.getMethod()) {
      return NanoHTTPD.newFixedLengthResponse(Response.Status.METHOD_NOT_ALLOWED, "text/plain", "Method Not Allowed");
    }

    if ("/api/getDeviceInfo".equals(uri)) {
      try {
        Response response = NanoHTTPD.newFixedLengthResponse(
          Response.Status.OK,
          "text/plain; charset=utf-8",
          deviceInfoProvider.getDeviceInfoJson()
        );
        response.addHeader(
          "Content-Disposition",
          "attachment; filename=\"deviceInfo-" + new SimpleDateFormat("yyyyMMddHHmm", Locale.US).format(new Date()) + ".json\""
        );
        response.addHeader("Cache-Control", "no-store");
        return response;
      } catch (IOException e) {
        Log.e(TAG, "failed to serve device info", e);
        return NanoHTTPD.newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "Failed to export device info");
      }
    }

    return serveStatic(session);
  }

  @Override
  protected WebSocket openWebSocket(IHTTPSession handshake) {
    Log.d(TAG, "ws handshake " + handshake.getUri());
    return new WsTlsBridge(handshake);
  }

  private Response serveStatic(IHTTPSession session) {
    String uri = session.getUri();
    if (TextUtils.isEmpty(uri) || "/".equals(uri)) {
      uri = "/index.html";
    }
    if (uri.contains("..")) {
      return NanoHTTPD.newFixedLengthResponse(Response.Status.FORBIDDEN, "text/plain", "Forbidden");
    }

    AssetResult asset = null;
    // an installed update is served as a whole; the bundled assets otherwise
    File root = webRootProvider.activeWebRoot();
    if (root != null) {
      File f = new File(root, uri.startsWith("/") ? uri.substring(1) : uri);
      try {
        if (f.isFile() && f.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator)) {
          asset = new AssetResult(f.getPath(), new FileInputStream(f));
        }
      } catch (IOException ignored) {
      }
    } else {
      asset = openAsset(uri);
    }
    if (asset == null) {
      Log.w(TAG, "static miss " + uri);
      return NanoHTTPD.newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not Found");
    }

    Log.d(TAG, "static hit " + uri + " -> " + asset.path);
    Response response = NanoHTTPD.newChunkedResponse(Response.Status.OK, guessMimeType(asset.path), asset.inputStream);
    // the page polls these to notice a new build: never from a cache
    if (uri.endsWith("/index.html") || uri.endsWith("/version.json")) {
      response.addHeader("Cache-Control", "no-store");
    }
    return response;
  }

  /* Front-end errors posted by the console, one JSON object per line, rolled at 1 MB.
     Readable from a PC on the LAN at http://<phone>:8888/api/log. */
  private Response appendLog(IHTTPSession session) {
    try {
      // check the size before reading: parseBody would hold the whole body in memory
      String cl = session.getHeaders().get("content-length");
      long len;
      try {
        len = cl == null ? 0 : Long.parseLong(cl.trim());
      } catch (NumberFormatException e) {
        return NanoHTTPD.newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "bad length");
      }
      if (len <= 0) {
        return NanoHTTPD.newFixedLengthResponse(Response.Status.NO_CONTENT, "text/plain", "");
      }
      if (len > 64 * 1024) {
        Response r = NanoHTTPD.newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "too large");
        r.closeConnection(true);
        return r;
      }
      Map<String, String> files = new HashMap<>();
      session.parseBody(files);
      String body = files.get("postData");
      if (body == null || body.isEmpty()) {
        return NanoHTTPD.newFixedLengthResponse(Response.Status.NO_CONTENT, "text/plain", "");
      }
      // one valid JSON value per line: the batch as sent, or the raw text as a string
      String batch;
      try {
        Object v = new JSONTokener(body).nextValue();
        batch = v instanceof JSONObject ? v.toString() : JSONObject.quote(body);
      } catch (Exception e) {
        batch = JSONObject.quote(body);
      }
      File dir = logFile.getParentFile();
      if (dir != null && !dir.isDirectory()) dir.mkdirs();
      synchronized (this) {
        if (logFile.length() > LOG_MAX_BYTES) {
          File old = new File(logFile.getPath() + ".1");
          old.delete();
          logFile.renameTo(old);
        }
        try (OutputStream out = new FileOutputStream(logFile, true)) {
          String line = "{\"at\":" + System.currentTimeMillis() + ",\"batch\":" + batch + "}\n";
          out.write(line.getBytes(StandardCharsets.UTF_8));
        }
      }
      return NanoHTTPD.newFixedLengthResponse(Response.Status.NO_CONTENT, "text/plain", "");
    } catch (Exception e) {
      Log.e(TAG, "failed to write front-end log", e);
      return NanoHTTPD.newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "log write failed");
    }
  }

  private Response readLog() {
    try {
      InputStream in;
      // not while the file is being rolled over
      synchronized (this) {
        if (!logFile.isFile()) {
          return NanoHTTPD.newFixedLengthResponse(Response.Status.OK, "text/plain; charset=utf-8", "");
        }
        in = new FileInputStream(logFile);
      }
      Response r = NanoHTTPD.newChunkedResponse(Response.Status.OK, "text/plain; charset=utf-8", in);
      r.addHeader("Cache-Control", "no-store");
      return r;
    } catch (IOException e) {
      return NanoHTTPD.newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "log read failed");
    }
  }

  private AssetResult openAsset(String uri) {
    AssetManager assets = appContext.getAssets();
    String normalized = uri.startsWith("/") ? uri.substring(1) : uri;
    String[] candidates = new String[]{
      "web/" + normalized,
      normalized,
    };

    for (String path : candidates) {
      try {
        return new AssetResult(path, assets.open(path));
      } catch (IOException ignored) {
      }
    }
    return null;
  }

  private static String guessMimeType(String path) {
    String lower = path.toLowerCase(Locale.US);
    if (lower.endsWith(".html")) return "text/html; charset=utf-8";
    if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (lower.endsWith(".css")) return "text/css; charset=utf-8";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".json")) return "application/json; charset=utf-8";
    if (lower.endsWith(".ico")) return "image/x-icon";
    return "application/octet-stream";
  }

  public interface DeviceInfoProvider {
    String getDeviceInfoJson() throws IOException;
  }

  public interface WebRootProvider {
    /** The installed update to serve, or null for the bundled assets. */
    File activeWebRoot();
  }

  private static final class AssetResult {
    final String path;
    final InputStream inputStream;

    AssetResult(String path, InputStream inputStream) {
      this.path = path;
      this.inputStream = inputStream;
    }
  }
}
