package com.tiedragon.teletyptel;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (bridge == null) return;
        bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(bridge) {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (!OriginPolicy.sameHttpsOrigin(bridge.getServerUrl(), request.getOrigin().toString())
                    || !OriginPolicy.sameHttpsOrigin(bridge.getServerUrl(), bridge.getWebView().getUrl())) {
                    request.deny();
                    return;
                }
                for (String resource : request.getResources()) {
                    if (!PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                        && !PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                        request.deny();
                        return;
                    }
                }
                super.onPermissionRequest(request);
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!OriginPolicy.sameHttpsOrigin(bridge.getServerUrl(), origin)
                    || !OriginPolicy.sameHttpsOrigin(bridge.getServerUrl(), bridge.getWebView().getUrl())) {
                    callback.invoke(origin, false, false);
                    return;
                }
                super.onGeolocationPermissionsShowPrompt(origin, callback);
            }
        });
    }

    private void notifyLifecycle(String state) {
        if (bridge == null || !OriginPolicy.sameHttpsOrigin(bridge.getServerUrl(), bridge.getWebView().getUrl())) return;
        bridge.getWebView().evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('teletyptel:lifecycle',{detail:{state:'" + state + "'}}));",
            null);
    }

    @Override
    public void onResume() {
        super.onResume();
        notifyLifecycle("active");
    }

    @Override
    public void onPause() {
        notifyLifecycle("inactive");
        super.onPause();
    }
}
