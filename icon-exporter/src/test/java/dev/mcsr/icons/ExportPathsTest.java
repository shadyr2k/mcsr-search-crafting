package dev.mcsr.icons;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import net.minecraft.util.Identifier;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ExportPathsTest {
    private static final Instant EXPORT_TIME = Instant.parse("2026-08-31T12:34:56Z");
    private static final String MANIFEST_SHA256 = repeat("a", 64);

    @TempDir
    Path tempDir;

    @Test
    void rejectsTraversalAndPathsOutsideExportRoot() {
        ExportPaths paths = new ExportPaths(tempDir);

        assertThrows(IllegalArgumentException.class, () -> paths.resolveRelative("../world"));
        assertThrows(IllegalArgumentException.class, () -> paths.resolveRelative("exports/../world"));
        assertThrows(IllegalArgumentException.class, () -> paths.resolveRelative("C:/outside"));
        assertThrows(IllegalArgumentException.class, () -> paths.resolveRelative("/outside"));
    }

    @Test
    void createsStagingDirectoriesOnlyInsideTheStagingRoot() throws Exception {
        ExportPaths paths = new ExportPaths(tempDir);

        Path staging = paths.createStaging(EXPORT_TIME, "safe-suffix");

        assertEquals(tempDir.resolve("staging/20260831T123456Z-safe-suffix").toAbsolutePath().normalize(), staging);
        assertTrue(Files.isDirectory(staging));
        assertFalse(Files.exists(tempDir.resolve("20260831T123456Z-safe-suffix")));
    }

    @Test
    void rejectsIconPathsOutsideTheSuppliedStagingDirectory() throws Exception {
        ExportPaths paths = new ExportPaths(tempDir);
        Path staging = paths.createStaging(EXPORT_TIME, "safe-suffix");

        assertThrows(IllegalArgumentException.class, () ->
                paths.iconPath(tempDir.resolve("outside"), new Identifier("minecraft", "stick")));
        assertEquals(staging.resolve("icons/minecraft/stick.png"),
                paths.iconPath(staging, new Identifier("minecraft", "stick")));
    }

    @Test
    void publishMovesStagingToAnImmutableExportAndWritesTheExactPointer() throws Exception {
        ExportPaths paths = new ExportPaths(tempDir);
        Path staging = stagingWithManifest(paths, "first");

        Path published = paths.publish(staging, MANIFEST_SHA256);

        assertEquals(tempDir.resolve("exports/20260831T123456Z-first").toAbsolutePath().normalize(), published);
        assertFalse(Files.exists(staging));
        assertTrue(Files.isRegularFile(published.resolve("manifest.json")));
        assertEquals("{\n"
                        + "  \"export_path\": \"exports/20260831T123456Z-first\",\n"
                        + "  \"manifest_sha256\": \"" + MANIFEST_SHA256 + "\"\n"
                        + "}\n",
                new String(Files.readAllBytes(tempDir.resolve("latest.json")), UTF_8));
    }

    @Test
    void rejectsDuplicateImmutableDestinationWithoutChangingThePointer() throws Exception {
        ExportPaths paths = new ExportPaths(tempDir);
        Path firstStaging = stagingWithManifest(paths, "same-id");
        Path firstPublished = paths.publish(firstStaging, MANIFEST_SHA256);
        String oldPointer = new String(Files.readAllBytes(tempDir.resolve("latest.json")), UTF_8);
        Path duplicateStaging = stagingWithManifest(paths, "same-id");

        assertThrows(IOException.class, () -> paths.publish(duplicateStaging, MANIFEST_SHA256));

        assertTrue(Files.isDirectory(firstPublished));
        assertTrue(Files.isDirectory(duplicateStaging));
        assertEquals(oldPointer, new String(Files.readAllBytes(tempDir.resolve("latest.json")), UTF_8));
    }

    @Test
    void failedAtomicPointerReplacementPreservesPreviousPointerAndExports() throws Exception {
        Files.write(tempDir.resolve("latest.json"), "old".getBytes(UTF_8));
        Path oldExport = Files.createDirectories(tempDir.resolve("exports/old"));
        ExportPaths paths = new ExportPaths(tempDir, moveThatFailsOnPointerReplacement());
        Path staging = stagingWithManifest(paths, "pointer-failure");

        assertThrows(AtomicMoveNotSupportedException.class, () -> paths.publish(staging, MANIFEST_SHA256));

        assertEquals("old", new String(Files.readAllBytes(tempDir.resolve("latest.json")), UTF_8));
        assertTrue(Files.isDirectory(oldExport));
        assertTrue(Files.isDirectory(tempDir.resolve("exports/20260831T123456Z-pointer-failure")));
    }

    private Path stagingWithManifest(ExportPaths paths, String suffix) throws IOException {
        Path staging = paths.createStaging(EXPORT_TIME, suffix);
        Files.write(staging.resolve("manifest.json"), "{}\n".getBytes(UTF_8));
        return staging;
    }

    private static ExportPaths.MoveOperation moveThatFailsOnPointerReplacement() {
        return (source, target, options) -> {
            if (target.getFileName().toString().equals("latest.json")) {
                throw new AtomicMoveNotSupportedException(source.toString(), target.toString(), "simulated failure");
            }
            return Files.move(source, target, options);
        };
    }

    private static String repeat(String value, int count) {
        StringBuilder repeated = new StringBuilder(value.length() * count);
        for (int index = 0; index < count; index++) {
            repeated.append(value);
        }
        return repeated.toString();
    }
}
