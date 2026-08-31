package dev.mcsr.icons;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ExportPreconditionsTest {
    @Test
    void createsExplicitAllowedAndDeniedResults() {
        PreconditionResult allowed = ExportPreconditions.allowed();
        PreconditionResult denied = ExportPreconditions.denied("mcsr_item_icons.export.blocked.resource_packs");

        assertTrue(allowed.allowed);
        assertNull(allowed.translationKey);
        assertFalse(denied.allowed);
        org.junit.jupiter.api.Assertions.assertEquals("mcsr_item_icons.export.blocked.resource_packs",
                denied.translationKey);
    }
}
