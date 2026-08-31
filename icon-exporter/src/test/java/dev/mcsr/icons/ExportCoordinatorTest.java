package dev.mcsr.icons;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.SortedMap;
import java.util.TreeMap;
import net.minecraft.Bootstrap;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.util.Identifier;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ExportCoordinatorTest {
    private static final Instant EXPORT_TIME = Instant.parse("2026-08-31T12:34:56Z");
    private static final String EXPORT_SUFFIX = "test-run";

    @TempDir
    Path tempDir;

    @BeforeAll
    static void initializeMinecraftRegistries() {
        Bootstrap.initialize();
    }

    @Test
    void rejectsDeniedPreconditionWithoutCreatingAStage() {
        RecordingEnvironment environment = new RecordingEnvironment(
                ExportPreconditions.denied("mcsr_item_icons.export.blocked.resource_packs"));
        ExportCoordinator coordinator = coordinator(environment, new RecordingCapture(), 2);

        assertFalse(coordinator.start());

        assertEquals(ExportState.IDLE, coordinator.state());
        assertEquals(Collections.singletonList("mcsr_item_icons.export.blocked.resource_packs"), environment.notifications);
        assertFalse(Files.exists(tempDir.resolve("staging")));
    }

    @Test
    void rejectsReentryAndAdvancesOnlyConfiguredBatchInLexicalOrder() throws Exception {
        RecordingEnvironment environment = allowedEnvironment(
                entry("minecraft:stick", Items.STICK),
                entry("minecraft:air", Items.AIR),
                entry("minecraft:apple", Items.APPLE),
                entry("minecraft:bread", Items.BREAD));
        RecordingCapture capture = new RecordingCapture();
        ExportCoordinator coordinator = coordinator(environment, capture, 2);

        assertTrue(coordinator.start());
        assertFalse(coordinator.start());

        coordinator.tick();

        assertEquals(ExportState.RUNNING, coordinator.state());
        assertEquals(2, coordinator.attemptedCount());
        assertEquals(Arrays.asList("minecraft:apple", "minecraft:bread"), capture.attemptedIds());
        assertEquals(Collections.emptyList(), environment.notifications);
    }

    @Test
    void excludesOnlyTheAirItemRatherThanEveryAirNamedRegistryEntry() throws Exception {
        RecordingEnvironment environment = allowedEnvironment(
                entry("minecraft:air", Items.STICK),
                entry("minecraft:surrogate_air", Items.AIR),
                entry("minecraft:stick", Items.STICK));
        RecordingCapture capture = new RecordingCapture();
        ExportCoordinator coordinator = coordinator(environment, capture, 3);

        assertTrue(coordinator.start());
        coordinator.tick();

        assertEquals(Arrays.asList("minecraft:air", "minecraft:stick"), capture.attemptedIds());
        assertEquals(ExportState.COMPLETE, coordinator.state());
    }

    @Test
    void usesDefaultBatchSizeOfFour() throws Exception {
        RecordingEnvironment environment = allowedEnvironment(
                entry("minecraft:apple", Items.APPLE),
                entry("minecraft:bread", Items.BREAD),
                entry("minecraft:bowl", Items.BOWL),
                entry("minecraft:stick", Items.STICK),
                entry("minecraft:arrow", Items.ARROW));
        RecordingCapture capture = new RecordingCapture();
        ExportCoordinator coordinator = coordinator(environment, capture);

        assertEquals(4, ExportCoordinator.DEFAULT_BATCH_SIZE);
        assertTrue(coordinator.start());
        coordinator.tick();

        assertEquals(4, coordinator.attemptedCount());
        assertEquals(Arrays.asList("minecraft:apple", "minecraft:arrow", "minecraft:bowl", "minecraft:bread"),
                capture.attemptedIds());
    }

    @Test
    void recordsRootItemFailureAndContinuesWithLaterItems() throws Exception {
        RecordingEnvironment environment = allowedEnvironment(
                entry("minecraft:apple", Items.APPLE),
                entry("minecraft:stick", Items.STICK));
        RecordingCapture capture = new RecordingCapture("minecraft:apple");
        ExportCoordinator coordinator = coordinator(environment, capture, 1);

        assertTrue(coordinator.start());
        runToCompletion(coordinator);

        assertEquals(ExportState.COMPLETE, coordinator.state());
        assertEquals(Arrays.asList("minecraft:apple", "minecraft:stick"), capture.attemptedIds());
        assertEquals(1, coordinator.manifest().failures.size());
        ExportManifest.FailureRecord failure = coordinator.manifest().failures.get(0);
        assertEquals("minecraft:apple", failure.item_id);
        assertEquals(IllegalStateException.class.getName(), failure.exception_class);
        assertEquals("capture failed here", failure.message);
        assertTrue(coordinator.manifest().icons.containsKey("minecraft:stick"));
    }

    @Test
    void writesAndPublishesOnlyAfterEveryItemHasBeenAttempted() throws Exception {
        RecordingEnvironment environment = allowedEnvironment(
                entry("minecraft:apple", Items.APPLE),
                entry("minecraft:stick", Items.STICK));
        RecordingCapture capture = new RecordingCapture();
        ExportCoordinator coordinator = coordinator(environment, capture, 1);

        assertTrue(coordinator.start());
        coordinator.tick();

        assertEquals(ExportState.RUNNING, coordinator.state());
        assertFalse(Files.exists(tempDir.resolve("latest.json")));
        assertFalse(Files.exists(tempDir.resolve("exports")));

        coordinator.tick();

        assertEquals(ExportState.COMPLETE, coordinator.state());
        assertEquals(Arrays.asList("minecraft:apple", "minecraft:stick"), capture.attemptedIds());
        assertTrue(Files.isRegularFile(tempDir.resolve("latest.json")));
        assertTrue(Files.isRegularFile(tempDir.resolve("exports/20260831T123456Z-test-run/manifest.json")));
    }

    @Test
    void setupFailureTransitionsToFailedAndNotifies() throws Exception {
        Path fileRoot = tempDir.resolve("not-a-directory");
        Files.write(fileRoot, "blocked".getBytes(UTF_8));
        RecordingEnvironment environment = allowedEnvironment(entry("minecraft:apple", Items.APPLE));
        ExportCoordinator coordinator = coordinator(environment, new RecordingCapture(), 1, new ExportPaths(fileRoot));

        assertFalse(coordinator.start());

        assertEquals(ExportState.FAILED, coordinator.state());
        assertEquals(Collections.singletonList(ExportCoordinator.FAILED_TRANSLATION_KEY), environment.notifications);
    }

    @Test
    void publicationFailureTransitionsToFailedAndNotifies() throws Exception {
        Files.createDirectories(tempDir.resolve("exports/20260831T123456Z-test-run"));
        RecordingEnvironment environment = allowedEnvironment(entry("minecraft:apple", Items.APPLE));
        ExportCoordinator coordinator = coordinator(environment, new RecordingCapture(), 1);

        assertTrue(coordinator.start());
        coordinator.tick();

        assertEquals(ExportState.FAILED, coordinator.state());
        assertEquals(Collections.singletonList(ExportCoordinator.FAILED_TRANSLATION_KEY), environment.notifications);
        assertFalse(Files.exists(tempDir.resolve("latest.json")));
    }

    @Test
    void startsAnIndependentFreshRunAfterCompletion() throws Exception {
        RecordingEnvironment environment = allowedEnvironment(entry("minecraft:apple", Items.APPLE));
        RecordingCapture capture = new RecordingCapture("minecraft:apple");
        ExportCoordinator coordinator = coordinator(environment, capture, 1,
                identities("first-run", "second-run"));

        assertTrue(coordinator.start());
        runToCompletion(coordinator);
        ExportManifest firstManifest = coordinator.manifest();
        assertEquals(1, firstManifest.failures.size());
        assertTrue(Files.isRegularFile(exportPath("first-run").resolve("manifest.json")));

        assertTrue(coordinator.start());

        assertEquals(ExportState.RUNNING, coordinator.state());
        assertEquals(0, coordinator.attemptedCount());
        assertNotSame(firstManifest, coordinator.manifest());
        assertTrue(coordinator.manifest().icons.isEmpty());
        assertTrue(coordinator.manifest().failures.isEmpty());
        runToCompletion(coordinator);

        assertEquals(ExportState.COMPLETE, coordinator.state());
        assertTrue(Files.isRegularFile(exportPath("second-run").resolve("manifest.json")));
        assertEquals(Arrays.asList("minecraft:apple", "minecraft:apple"), capture.attemptedIds());
        assertTrue(coordinator.manifest().failures.isEmpty());
        assertTrue(coordinator.manifest().icons.containsKey("minecraft:apple"));
    }

    @Test
    void startsFreshRunAfterTechnicalFailureAndLeavesFailedStageForDiagnostics() throws Exception {
        Files.createDirectories(exportPath("first-failure"));
        RecordingEnvironment environment = allowedEnvironment(entry("minecraft:apple", Items.APPLE));
        ExportCoordinator coordinator = coordinator(environment, new RecordingCapture(), 1,
                identities("first-failure", "second-success"));

        assertTrue(coordinator.start());
        coordinator.tick();

        Path failedStage = tempDir.resolve("staging/20260831T123456Z-first-failure");
        assertEquals(ExportState.FAILED, coordinator.state());
        assertTrue(Files.isDirectory(failedStage));
        Files.delete(exportPath("first-failure"));

        assertTrue(coordinator.start());
        assertEquals(ExportState.RUNNING, coordinator.state());
        assertEquals(0, coordinator.attemptedCount());
        runToCompletion(coordinator);

        assertEquals(ExportState.COMPLETE, coordinator.state());
        assertTrue(Files.isDirectory(failedStage));
        assertTrue(Files.isRegularFile(exportPath("second-success").resolve("manifest.json")));
    }

    @Test
    void deniedRestartKeepsCompletedResultUntilAnAcceptedRestart() throws Exception {
        RecordingEnvironment environment = allowedEnvironment(entry("minecraft:apple", Items.APPLE));
        ExportCoordinator coordinator = coordinator(environment, new RecordingCapture(), 1,
                identities("completed", "accepted-retry"));

        assertTrue(coordinator.start());
        runToCompletion(coordinator);
        ExportManifest completedManifest = coordinator.manifest();
        String previousPointer = new String(Files.readAllBytes(tempDir.resolve("latest.json")), UTF_8);
        environment.result = ExportPreconditions.denied("mcsr_item_icons.export.blocked.resource_packs");

        assertFalse(coordinator.start());

        assertEquals(ExportState.COMPLETE, coordinator.state());
        assertSame(completedManifest, coordinator.manifest());
        assertEquals(previousPointer, new String(Files.readAllBytes(tempDir.resolve("latest.json")), UTF_8));
        assertTrue(Files.isRegularFile(exportPath("completed").resolve("manifest.json")));

        environment.result = ExportPreconditions.allowed();
        assertTrue(coordinator.start());

        assertEquals(ExportState.RUNNING, coordinator.state());
        assertNotSame(completedManifest, coordinator.manifest());
        assertEquals(0, coordinator.attemptedCount());
        assertTrue(coordinator.manifest().icons.isEmpty());
    }

    private ExportCoordinator coordinator(RecordingEnvironment environment, RecordingCapture capture) {
        return coordinator(environment, capture, ExportCoordinator.DEFAULT_BATCH_SIZE);
    }

    private ExportCoordinator coordinator(RecordingEnvironment environment, RecordingCapture capture, int batchSize) {
        return coordinator(environment, capture, batchSize, new ExportPaths(tempDir), identities(EXPORT_SUFFIX));
    }

    private ExportCoordinator coordinator(RecordingEnvironment environment, RecordingCapture capture, int batchSize,
            ExportPaths paths) {
        return coordinator(environment, capture, batchSize, paths, identities(EXPORT_SUFFIX));
    }

    private ExportCoordinator coordinator(RecordingEnvironment environment, RecordingCapture capture, int batchSize,
            RunIdentitySource identities) {
        return coordinator(environment, capture, batchSize, new ExportPaths(tempDir), identities);
    }

    private ExportCoordinator coordinator(RecordingEnvironment environment, RecordingCapture capture, int batchSize,
            ExportPaths paths, RunIdentitySource identities) {
        return new ExportCoordinator(environment, capture, paths,
                ExportManifest.create("1.16.1", "1.0.0", Collections.singletonList("vanilla")),
                identities, batchSize);
    }

    private RunIdentitySource identities(final String... suffixes) {
        return new RunIdentitySource() {
            private int index;

            @Override
            public RunIdentity next() {
                String suffix = suffixes[index];
                Instant time = EXPORT_TIME.plusSeconds(index);
                index++;
                return new RunIdentity(time, suffix);
            }
        };
    }

    private Path exportPath(String suffix) {
        int seconds = "first-run".equals(suffix) || "first-failure".equals(suffix) || "completed".equals(suffix)
                ? 0 : 1;
        return tempDir.resolve("exports/20260831T1234" + (seconds == 0 ? "56" : "57") + "Z-" + suffix);
    }

    private static RecordingEnvironment allowedEnvironment(ItemEntry... entries) {
        RecordingEnvironment environment = new RecordingEnvironment(ExportPreconditions.allowed());
        for (ItemEntry entry : entries) {
            environment.items.put(new Identifier(entry.id), entry.item);
        }
        return environment;
    }

    private static ItemEntry entry(String id, Item item) {
        return new ItemEntry(id, item);
    }

    private static void runToCompletion(ExportCoordinator coordinator) {
        while (coordinator.state() == ExportState.RUNNING) {
            coordinator.tick();
        }
    }

    private static final class ItemEntry {
        final String id;
        final Item item;

        private ItemEntry(String id, Item item) {
            this.id = id;
            this.item = item;
        }
    }

    private static final class RecordingEnvironment implements ExportEnvironment {
        PreconditionResult result;
        final SortedMap<Identifier, Item> items = new TreeMap<Identifier, Item>();
        final List<String> notifications = new ArrayList<String>();

        private RecordingEnvironment(PreconditionResult result) {
            this.result = result;
        }

        @Override
        public PreconditionResult check() {
            return result;
        }

        @Override
        public SortedMap<Identifier, Item> registeredItems() {
            return items;
        }

        @Override
        public void notify(String translationKey, Object... args) {
            notifications.add(translationKey);
        }
    }

    private static final class RecordingCapture implements IconCapture {
        final List<String> attempts = new ArrayList<String>();
        final Set<String> failingIds;

        private RecordingCapture(String... failingIds) {
            this.failingIds = new HashSet<String>(Arrays.asList(failingIds));
        }

        @Override
        public Path capture(Identifier itemId, ItemStack stack, Path stagingRoot) throws Exception {
            attempts.add(itemId.toString());
            assertEquals(1, stack.getCount());
            if (failingIds.remove(itemId.toString())) {
                throw new IOException("outer", new IllegalStateException("capture failed\r\nhere"));
            }
            Path icon = stagingRoot.resolve("icons").resolve(itemId.getNamespace())
                    .resolve(itemId.getPath() + ".png");
            Files.createDirectories(icon.getParent());
            Files.write(icon, itemId.toString().getBytes(UTF_8));
            return icon;
        }

        private List<String> attemptedIds() {
            return attempts;
        }
    }
}
