package dev.mcsr.icons;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.SortedMap;
import java.util.TreeMap;

public final class ExportManifest {
    public final int schema_version = 1;
    public final String minecraft_version;
    public final String exporter_version;
    public final int icon_width = 16;
    public final int icon_height = 16;
    public final List<String> resource_packs;
    public final SortedMap<String, IconRecord> icons;
    public final List<FailureRecord> failures;
    private final SortedMap<String, IconRecord> mutableIcons;

    private ExportManifest(String minecraftVersion, String exporterVersion, List<String> resourcePacks) {
        minecraft_version = Objects.requireNonNull(minecraftVersion, "minecraftVersion");
        exporter_version = Objects.requireNonNull(exporterVersion, "exporterVersion");
        resource_packs = Collections.unmodifiableList(new ArrayList<String>(resourcePacks));
        mutableIcons = new TreeMap<String, IconRecord>();
        icons = Collections.unmodifiableSortedMap(mutableIcons);
        failures = new ArrayList<FailureRecord>();
    }

    public static ExportManifest create(String minecraftVersion, String exporterVersion, List<String> resourcePacks) {
        return new ExportManifest(minecraftVersion, exporterVersion, resourcePacks);
    }

    public void addIcon(String itemId, String path, String sha256) {
        if (mutableIcons.containsKey(itemId)) {
            throw new IllegalArgumentException("Duplicate icon item ID: " + itemId);
        }
        for (IconRecord icon : mutableIcons.values()) {
            if (icon.path.equals(path)) {
                throw new IllegalArgumentException("Duplicate icon path: " + path);
            }
        }
        mutableIcons.put(itemId, new IconRecord(path, sha256));
    }

    public void addFailure(String itemId, String exceptionClass, String message) {
        failures.add(new FailureRecord(itemId, exceptionClass, message));
    }

    static ManifestSnapshot snapshotOf(ExportManifest manifest) {
        return new ManifestSnapshot(
                manifest.schema_version,
                manifest.minecraft_version,
                manifest.exporter_version,
                manifest.icon_width,
                manifest.icon_height,
                new ArrayList<String>(manifest.resource_packs),
                new TreeMap<String, IconRecord>(manifest.mutableIcons),
                new ArrayList<FailureRecord>(manifest.failures)
        );
    }

    public static final class IconRecord {
        public final String path;
        public final String sha256;

        private IconRecord(String path, String sha256) {
            this.path = Objects.requireNonNull(path, "path");
            this.sha256 = Objects.requireNonNull(sha256, "sha256");
        }
    }

    public static final class FailureRecord {
        public final String item_id;
        public final String exception_class;
        public final String message;

        private FailureRecord(String itemId, String exceptionClass, String message) {
            this.item_id = Objects.requireNonNull(itemId, "itemId");
            this.exception_class = Objects.requireNonNull(exceptionClass, "exceptionClass");
            this.message = Objects.requireNonNull(message, "message");
        }
    }

    static final class ManifestSnapshot {
        final int schema_version;
        final String minecraft_version;
        final String exporter_version;
        final int icon_width;
        final int icon_height;
        final List<String> resource_packs;
        final SortedMap<String, IconRecord> icons;
        final List<FailureRecord> failures;

        private ManifestSnapshot(
                int schemaVersion,
                String minecraftVersion,
                String exporterVersion,
                int iconWidth,
                int iconHeight,
                List<String> resourcePacks,
                SortedMap<String, IconRecord> icons,
                List<FailureRecord> failures) {
            this.schema_version = schemaVersion;
            this.minecraft_version = minecraftVersion;
            this.exporter_version = exporterVersion;
            this.icon_width = iconWidth;
            this.icon_height = iconHeight;
            this.resource_packs = resourcePacks;
            this.icons = icons;
            this.failures = failures;
        }
    }
}
