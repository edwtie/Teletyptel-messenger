package com.tiedragon.teletyptel;

import java.net.URI;
import java.net.URISyntaxException;

public final class OriginPolicy {
    private OriginPolicy() {}

    public static boolean sameHttpsOrigin(String expected, String candidate) {
        if (expected == null || candidate == null) return false;
        try {
            URI trusted = new URI(expected);
            URI requested = new URI(candidate);
            return "https".equalsIgnoreCase(trusted.getScheme())
                && "https".equalsIgnoreCase(requested.getScheme())
                && trusted.getHost() != null
                && trusted.getHost().equalsIgnoreCase(requested.getHost())
                && trusted.getUserInfo() == null && requested.getUserInfo() == null
                && (trusted.getPort() == -1 ? 443 : trusted.getPort())
                    == (requested.getPort() == -1 ? 443 : requested.getPort());
        } catch (URISyntaxException failure) {
            return false;
        }
    }
}
