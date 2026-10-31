package com.tiedragon.teletyptel;

import org.junit.Test;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class OriginPolicyTest {
    @Test
    public void permitsOnlyConfiguredHttpsOrigin() {
        String server = "https://192.168.0.105/chat.html";
        assertTrue(OriginPolicy.sameHttpsOrigin(server, "https://192.168.0.105/"));
        assertTrue(OriginPolicy.sameHttpsOrigin(server, "https://192.168.0.105:443/api/"));
        assertFalse(OriginPolicy.sameHttpsOrigin(server, "http://192.168.0.105/"));
        assertFalse(OriginPolicy.sameHttpsOrigin(server, "https://192.168.0.105:8443/"));
        assertFalse(OriginPolicy.sameHttpsOrigin(server, "https://192.168.0.105.evil.test/"));
        assertFalse(OriginPolicy.sameHttpsOrigin(server, "https://user@192.168.0.105/"));
        assertFalse(OriginPolicy.sameHttpsOrigin(server, "https://localhost/"));
        assertFalse(OriginPolicy.sameHttpsOrigin(server, "not a url"));
        assertFalse(OriginPolicy.sameHttpsOrigin(server, null));
    }
}
