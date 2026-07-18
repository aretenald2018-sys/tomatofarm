package com.lifestreak.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.lifestreak.app.wear.TomatoWearAppUpdatePlugin;
import com.lifestreak.app.wear.TomatoWearWorkoutBridge;
import com.lifestreak.app.running.TomatoRunningLocationPlugin;
import com.lifestreak.app.widget.SeasonWidgetPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(TomatoWearAppUpdatePlugin.class);
        registerPlugin(TomatoRunningLocationPlugin.class);
        registerPlugin(SeasonWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        TomatoWearWorkoutBridge.registerActivity(this);
        handleWidgetIntent(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        TomatoWearWorkoutBridge.drainPendingToWebView(this, 300);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleWidgetIntent(intent);
        TomatoWearWorkoutBridge.drainPendingToWebView(this, 300);
    }

    @Override
    public void onDestroy() {
        TomatoWearWorkoutBridge.unregisterActivity(this);
        super.onDestroy();
    }

    private void handleWidgetIntent(Intent intent) {
        if (intent == null) return;
        String addDate = intent.getStringExtra("addEventDate");
        String tab = intent.getStringExtra("tab");
        String widgetAction = intent.getStringExtra("widgetAction");
        String deepLinkAction = deepLinkAction(intent.getData());
        if (deepLinkAction != null) widgetAction = deepLinkAction;
        if (isAllowedWidgetAction(widgetAction)) {
            final String safeAction = widgetAction;
            getBridge().getWebView().postDelayed(() -> {
                getBridge().getWebView().evaluateJavascript(
                    "(function(){"
                        + "var fire=function(){document.dispatchEvent(new CustomEvent('widget:action',{detail:{action:'" + safeAction + "'}}));};"
                        + "if(window.__tomatoAppReady===true){fire();}"
                        + "else{window.addEventListener('tomato-app-ready',fire,{once:true});}"
                        + "})();",
                    null
                );
            }, 800);
            intent.removeExtra("widgetAction");
            intent.removeExtra("tab");
            intent.setData(null);
        } else if (addDate != null && !addDate.isEmpty()) {
            // 앱 로드 후 캘린더 탭으로 전환 + 일정 등록 모달 오픈
            getBridge().getWebView().postDelayed(() -> {
                getBridge().getWebView().evaluateJavascript(
                    "if(window.switchTab){switchTab('calendar');setTimeout(()=>openCalEventModal('" + addDate + "'),300);}",
                    null
                );
            }, 800);
            // 중복 실행 방지
            intent.removeExtra("addEventDate");
        } else if (isAllowedTab(tab)) {
            getBridge().getWebView().postDelayed(() -> {
                getBridge().getWebView().evaluateJavascript(
                    "if(window.switchTab){switchTab('" + tab + "');}",
                    null
                );
            }, 800);
            intent.removeExtra("tab");
        }
    }

    private String deepLinkAction(Uri uri) {
        if (uri == null || !"tomatofarm".equals(uri.getScheme())) return null;
        String host = uri.getHost();
        String path = uri.getPath();
        if ("diet".equals(host) && "/today".equals(path)) return "diet";
        if ("workout".equals(host) && "/season".equals(path)) return "season";
        if ("workout".equals(host) && "/running".equals(path)) return "running";
        return null;
    }

    private boolean isAllowedWidgetAction(String action) {
        return "diet".equals(action)
            || "season".equals(action)
            || "running".equals(action)
            || "workout".equals(action)
            || "refresh".equals(action);
    }

    private boolean isAllowedTab(String tab) {
        return "home".equals(tab)
            || "diet".equals(tab)
            || "workout".equals(tab)
            || "stats".equals(tab)
            || "calendar".equals(tab)
            || "admin".equals(tab);
    }
}
