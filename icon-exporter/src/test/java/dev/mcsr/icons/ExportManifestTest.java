package dev.mcsr.icons;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import org.junit.jupiter.api.Test;

class ExportManifestTest {
    @Test
    void writesSortedStableSchemaOneJson() throws Exception {
        ExportManifest manifest = ExportManifest.create("1.16.1", "1.0.0", Arrays.asList("vanilla"));
        manifest.addIcon("minecraft:stick", "icons/minecraft/stick.png", repeat("a", 64));
        manifest.addIcon("minecraft:apple", "icons/minecraft/apple.png", repeat("b", 64));

        String first = ManifestWriter.toJson(manifest);
        String second = ManifestWriter.toJson(manifest);

        assertEquals(first, second);
        assertTrue(first.indexOf("minecraft:apple") < first.indexOf("minecraft:stick"));
        assertTrue(first.endsWith("\n"));
    }

    private static String repeat(String value, int count) {
        StringBuilder repeated = new StringBuilder(value.length() * count);
        for (int index = 0; index < count; index++) {
            repeated.append(value);
        }
        return repeated.toString();
    }
}
