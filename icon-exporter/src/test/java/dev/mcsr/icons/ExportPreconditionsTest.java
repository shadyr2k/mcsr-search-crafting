package dev.mcsr.icons;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;

import org.junit.jupiter.api.Test;

class ExportPreconditionsTest {
    @Test
    void acceptsLoadedWorldWhenWorldAndPlayerArePresent() {
        assertTrue(ExportPreconditions.loadedWorldAllowed(true, true));
    }

    @Test
    void rejectsLoadedWorldWhenWorldOrPlayerIsMissing() {
        assertFalse(ExportPreconditions.loadedWorldAllowed(false, true));
        assertFalse(ExportPreconditions.loadedWorldAllowed(true, false));
    }

    @Test
    void acceptsOnlyDefaultVanillaResourcePackEntries() {
        assertTrue(ExportPreconditions.resourcePacksAllowed(
                Arrays.asList("vanilla"), Arrays.asList("vanilla")));
        assertTrue(ExportPreconditions.resourcePacksAllowed(
                Arrays.<String>asList(), Arrays.<String>asList()));
    }

    @Test
    void rejectsAnyNonVanillaResourcePackEntry() {
        assertFalse(ExportPreconditions.resourcePacksAllowed(
                Arrays.asList("vanilla", "programmer_art"), Arrays.asList("vanilla")));
        assertFalse(ExportPreconditions.resourcePacksAllowed(
                Arrays.asList("vanilla"), Arrays.asList("vanilla", "custom_pack")));
    }

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
