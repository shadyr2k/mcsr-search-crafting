package dev.mcsr.icons;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.SortedMap;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.util.Identifier;

/** Advances one immutable item-icon export in bounded client-tick batches. */
public final class ExportCoordinator {
    public static final int DEFAULT_BATCH_SIZE = 4;
    public static final int MAX_FAILURE_MESSAGE_LENGTH = 160;
    public static final String FAILED_TRANSLATION_KEY = "mcsr_item_icons.export.failed";

    private final ExportEnvironment environment;
    private final IconCapture capture;
    private final ExportPaths paths;
    private final ExportManifest manifest;
    private final Instant exportTime;
    private final String exportSuffix;
    private final int batchSize;
    private final List<ExportItem> items = new ArrayList<ExportItem>();

    private ExportState state = ExportState.IDLE;
    private Path staging;
    private int attemptedCount;

    public ExportCoordinator(ExportEnvironment environment, IconCapture capture, ExportPaths paths,
            ExportManifest manifest, Instant exportTime, String exportSuffix) {
        this(environment, capture, paths, manifest, exportTime, exportSuffix, DEFAULT_BATCH_SIZE);
    }

    public ExportCoordinator(ExportEnvironment environment, IconCapture capture, ExportPaths paths,
            ExportManifest manifest, Instant exportTime, String exportSuffix, int batchSize) {
        this.environment = Objects.requireNonNull(environment, "environment");
        this.capture = Objects.requireNonNull(capture, "capture");
        this.paths = Objects.requireNonNull(paths, "paths");
        this.manifest = Objects.requireNonNull(manifest, "manifest");
        this.exportTime = Objects.requireNonNull(exportTime, "exportTime");
        this.exportSuffix = Objects.requireNonNull(exportSuffix, "exportSuffix");
        if (batchSize <= 0) {
            throw new IllegalArgumentException("batchSize must be positive");
        }
        this.batchSize = batchSize;
    }

    public boolean start() {
        if (state != ExportState.IDLE) {
            return false;
        }

        try {
            PreconditionResult result = Objects.requireNonNull(environment.check(), "precondition result");
            if (!result.allowed) {
                environment.notify(Objects.requireNonNull(result.translationKey, "translationKey"));
                return false;
            }

            staging = paths.createStaging(exportTime, exportSuffix);
            addSortedNonAirItems(environment.registeredItems());
            state = ExportState.RUNNING;
            return true;
        } catch (Exception exception) {
            fail();
            return false;
        }
    }

    public void tick() {
        if (state != ExportState.RUNNING) {
            return;
        }

        try {
            int batchEnd = Math.min(items.size(), attemptedCount + batchSize);
            while (attemptedCount < batchEnd) {
                ExportItem item = items.get(attemptedCount);
                attempt(item);
                attemptedCount++;
            }
            if (attemptedCount == items.size()) {
                writeAndPublishManifest();
                state = ExportState.COMPLETE;
            }
        } catch (Exception exception) {
            fail();
        }
    }

    public ExportState state() {
        return state;
    }

    public int attemptedCount() {
        return attemptedCount;
    }

    public ExportManifest manifest() {
        return manifest;
    }

    private void addSortedNonAirItems(SortedMap<Identifier, Item> registeredItems) {
        Objects.requireNonNull(registeredItems, "registeredItems");
        for (Map.Entry<Identifier, Item> entry : registeredItems.entrySet()) {
            Identifier id = Objects.requireNonNull(entry.getKey(), "registered item ID");
            Item item = Objects.requireNonNull(entry.getValue(), "registered item");
            if (item != Items.AIR) {
                items.add(new ExportItem(id, item));
            }
        }
        Collections.sort(items, Comparator.comparing(ExportItem::idString));
    }

    private void attempt(ExportItem item) {
        try {
            Path output = capture.capture(item.id, new ItemStack(item.item), staging);
            Path normalizedStaging = staging.toAbsolutePath().normalize();
            Path normalizedOutput = Objects.requireNonNull(output, "capture output").toAbsolutePath().normalize();
            if (!normalizedOutput.startsWith(normalizedStaging) || normalizedOutput.equals(normalizedStaging)) {
                throw new IOException("Captured icon is outside the staging directory");
            }
            String relativePath = normalizedStaging.relativize(normalizedOutput).toString().replace('\\', '/');
            manifest.addIcon(item.idString(), relativePath, sha256(Files.readAllBytes(normalizedOutput)));
        } catch (Exception exception) {
            Throwable root = rootCause(exception);
            manifest.addFailure(item.idString(), root.getClass().getName(), conciseMessage(root));
        }
    }

    private void writeAndPublishManifest() throws IOException, NoSuchAlgorithmException {
        Path manifestPath = staging.resolve("manifest.json").toAbsolutePath().normalize();
        Files.write(manifestPath, ManifestWriter.toJson(manifest).getBytes(StandardCharsets.UTF_8));
        paths.publish(staging, sha256(Files.readAllBytes(manifestPath)));
    }

    private void fail() {
        state = ExportState.FAILED;
        try {
            environment.notify(FAILED_TRANSLATION_KEY);
        } catch (RuntimeException ignored) {
            // The terminal state is more important than a best-effort UI notification.
        }
    }

    private static String sha256(byte[] bytes) throws NoSuchAlgorithmException {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder hexadecimal = new StringBuilder(digest.length * 2);
        for (byte value : digest) {
            hexadecimal.append(String.format("%02x", value & 0xff));
        }
        return hexadecimal.toString();
    }

    private static Throwable rootCause(Throwable exception) {
        Throwable root = exception;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        return root;
    }

    private static String conciseMessage(Throwable exception) {
        String message = exception.getMessage();
        if (message == null) {
            return "";
        }
        String normalized = message.replaceAll("[\\r\\n]+", " ");
        if (normalized.length() > MAX_FAILURE_MESSAGE_LENGTH) {
            return normalized.substring(0, MAX_FAILURE_MESSAGE_LENGTH);
        }
        return normalized;
    }

    private static final class ExportItem {
        final Identifier id;
        final Item item;

        private ExportItem(Identifier id, Item item) {
            this.id = id;
            this.item = item;
        }

        private String idString() {
            return id.toString();
        }
    }
}

enum ExportState {
    IDLE,
    RUNNING,
    COMPLETE,
    FAILED
}

interface IconCapture {
    Path capture(Identifier itemId, ItemStack stack, Path stagingRoot) throws Exception;
}
