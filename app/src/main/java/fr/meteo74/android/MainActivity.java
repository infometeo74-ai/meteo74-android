package fr.meteo74.android;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.widget.FrameLayout;
import android.view.ViewGroup;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private WebView web;
    private GeolocationPermissions.Callback pendingGeo;
    private String pendingOrigin;
    private AppUpdater updater;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(),false);
        // WebView does not reliably inset its HTML viewport with View.setPadding.
        // Insets belong to a native parent, so fixed HTML elements also stay safe.
        FrameLayout safeArea = new FrameLayout(this);
        safeArea.setBackgroundColor(0xFFF5F8FB);
        web = new WebView(this);
        web.setBackgroundColor(0xFFF5F8FB);
        safeArea.addView(web,new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
        ViewCompat.setOnApplyWindowInsetsListener(safeArea,(view,insets) -> {
            Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets keyboard=insets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,keyboard.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
        setContentView(safeArea);
        ViewCompat.requestApplyInsets(safeArea);
        WindowInsetsControllerCompat controller=WindowCompat.getInsetsController(getWindow(),safeArea);
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);
        updater=new AppUpdater(this);
        WebSettings settings = web.getSettings();
        settings.setUserAgentString(settings.getUserAgentString() + " Meteo74/" + UpdateConfig.VERSION_NAME + " (fr.meteo74.android)");
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false);
        settings.setUserAgentString(settings.getUserAgentString() + " Meteo74Android/"+UpdateConfig.VERSION_NAME);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request) { return assets.shouldInterceptRequest(request.getUrl()); }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
                Uri uri = request.getUrl();
                if(request.isForMainFrame() && "meteo74".equals(uri.getScheme()) && "updates".equals(uri.getHost()) && web.getUrl()!=null && web.getUrl().startsWith(ORIGIN+"/assets/web/")) {
                    updater.check(); return true;
                }
                if ("appassets.androidplatform.net".equals(uri.getHost()) && "https".equals(uri.getScheme())) return false;
                if ("https".equals(uri.getScheme()) && request.isForMainFrame()) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW,uri)); } catch(Exception e) { Toast.makeText(MainActivity.this,"Aucun navigateur disponible.",Toast.LENGTH_SHORT).show(); }
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!ORIGIN.equals(origin) && !(ORIGIN+"/").equals(origin)) { callback.invoke(origin,false,false); return; }
                if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin,true,false);
                } else {
                    pendingOrigin=origin; pendingGeo=callback;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},74);
                }
            }
            @Override public void onGeolocationPermissionsHidePrompt() { pendingGeo=null; pendingOrigin=null; }
        });
        web.loadUrl(ORIGIN+"/assets/web/index.html");
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results) {
        super.onRequestPermissionsResult(code,permissions,results);
        if(code==74 && pendingGeo!=null) {
            boolean granted=checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED;
            pendingGeo.invoke(pendingOrigin,granted,false);pendingGeo=null;pendingOrigin=null;
        }
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("window.meteoApp && window.meteoApp.back()", result -> { if(!"true".equals(result)) finish(); });
    }
    @Override protected void onPause() { super.onPause(); web.evaluateJavascript("window.meteoApp && window.meteoApp.pause()",null);web.onPause(); }
    @Override protected void onResume() { super.onResume(); if(web!=null){web.onResume();web.evaluateJavascript("window.meteoApp && window.meteoApp.resume()",null);} }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){super.onActivityResult(requestCode,resultCode,data);if(requestCode==AppUpdater.INSTALL_PERMISSION_REQUEST)updater.resumeInstallation();}
    @Override protected void onDestroy(){ if(pendingGeo!=null)pendingGeo.invoke(pendingOrigin,false,false);if(updater!=null)updater.close();web.destroy();super.onDestroy(); }
}
