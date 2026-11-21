package si.ceyo.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import si.ceyo.app.assistant.CeyoChannels;
import si.ceyo.app.assistant.CeyoIntents;
import si.ceyo.app.assistant.MegsyBridge;

public class MainActivity extends BridgeActivity {
    /** Longest the ghost splash waits for the web app before showing whatever has loaded. */
    private static final long SPLASH_MAX_MS = 12000;
    private static volatile boolean webReady = false;
    private long splashDeadline;

    /** Called by MegsyBridge.appReady() once the web app has painted its first real screen. */
    public static void markWebReady() { webReady = true; }

    @Override public void onCreate(Bundle savedInstanceState) {
        // The ghost launch screen stays up until the web app says it is ready, so the
        // icon → second loader → app jump no longer happens.
        androidx.core.splashscreen.SplashScreen splash = androidx.core.splashscreen.SplashScreen.installSplashScreen(this);
        webReady = false;
        splashDeadline = android.os.SystemClock.uptimeMillis() + SPLASH_MAX_MS;
        splash.setKeepOnScreenCondition(() -> !webReady && android.os.SystemClock.uptimeMillis() < splashDeadline);
        splash.setOnExitAnimationListener(view -> view.getView().animate().alpha(0f).setDuration(220)
            .withEndAction(view::remove).start());
        registerPlugin(CeyoPlayBillingPlugin.class);
        super.onCreate(savedInstanceState);
        CeyoChannels.ensure(this);
        WebView web = getBridge().getWebView();
        MegsyBridge assistant = new MegsyBridge(this, web);
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                assistant.pageChanged(url); super.onPageStarted(view, url, favicon);
            }
            @Override public void onPageFinished(WebView view, String url) {
                assistant.pageChanged(url); super.onPageFinished(view, url);
            }
            @Override public void doUpdateVisitedHistory(WebView view, String url, boolean reload) {
                assistant.pageChanged(url); super.doUpdateVisitedHistory(view, url, reload);
            }
        });
        web.addJavascriptInterface(assistant, "MegsyAndroid");
        web.getSettings().setMediaPlaybackRequiresUserGesture(false);
        handleLaunch(getIntent());
    }

    /** True while Ceyo is on screen: message pushes are then not shown, like WhatsApp. */
    public static volatile boolean onScreen;

    @Override public void onResume() { super.onResume(); onScreen = true; si.ceyo.app.assistant.Routines.restoreAll(this); }
    @Override public void onPause() { onScreen = false; super.onPause(); }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == 53 && res.length > 0 && res[0] == android.content.pm.PackageManager.PERMISSION_GRANTED)
        if ((code == 53 || code == 52) && (res.length == 0 || res[0] != android.content.pm.PackageManager.PERMISSION_GRANTED)) {
            getSharedPreferences("ceyo_assistant", MODE_PRIVATE).edit().putBoolean(code == 53 ? "wake_on" : "car_on", false).commit();
        }
    }

    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); handleLaunch(intent); }

    /** Opens a notification/widget/assistant path, or a shared text/link from another app, inside the trusted origin only. */
    private void handleLaunch(Intent in) {
        if (in == null) return;
        String path = null;
        Bundle typed = androidx.core.app.RemoteInput.getResultsFromIntent(in);
        CharSequence reply = typed == null ? null : typed.getCharSequence(si.ceyo.app.assistant.CeyoMessage.REPLY_KEY);
        if (reply != null && reply.toString().trim().length() > 0) {
            getSystemService(android.app.NotificationManager.class).cancel(in.getIntExtra("reply_nid", 0));
            String base = CeyoIntents.safePath(in.getStringExtra(CeyoIntents.EXTRA_PATH));
            String t = reply.toString().trim(); if (t.length() > 1200) t = t.substring(0, 1200);
            path = base + (base.contains("?") ? "&" : "?") + "ceyoSend=1&ceyoPrompt=" + Uri.encode(t);
        } else if (in.hasExtra(CeyoIntents.EXTRA_PATH)) path = CeyoIntents.safePath(in.getStringExtra(CeyoIntents.EXTRA_PATH));
        else if (Intent.ACTION_SEND.equals(in.getAction())) {
            CharSequence shared = in.getCharSequenceExtra(Intent.EXTRA_TEXT);
            String subject = in.getStringExtra(Intent.EXTRA_SUBJECT);
            if (shared != null && shared.length() > 0) {
                String t = shared.toString(); if (t.length() > 1200) t = t.substring(0, 1200);
                path = "/?ceyoSend=0&ceyoPrompt=" + Uri.encode((subject != null ? subject + "\n" : "") + t + "\n\nلخّصلي ده أو قولي رأيك:");
            } else path = "/?ceyoSend=0&ceyoPrompt=" + Uri.encode("بعتلك صورة/ملف من تطبيق تاني، ارفعه هنا من زر +");
        }
        in.removeExtra(CeyoIntents.EXTRA_PATH);
        if (path == null || "/".equals(path) && getBridge().getWebView().getUrl() != null) return;
        final String target = "https://" + MegsyBridge.TRUSTED_HOST + path;
        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(target));
    }
}
