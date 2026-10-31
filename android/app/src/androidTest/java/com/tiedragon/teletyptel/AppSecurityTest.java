package com.tiedragon.teletyptel;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.security.NetworkSecurityPolicy;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AppSecurityTest {
    @Test
    public void debugAppDisallowsCleartextAndBackups() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.tiedragon.teletyptel.debug", context.getPackageName());
        assertFalse(NetworkSecurityPolicy.getInstance().isCleartextTrafficPermitted());
        assertEquals(0, context.getApplicationInfo().flags & ApplicationInfo.FLAG_ALLOW_BACKUP);
    }
}
