package dev.mcsr.icons;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.util.Objects;

public final class ManifestWriter {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private ManifestWriter() {
    }

    public static String toJson(ExportManifest manifest) {
        return GSON.toJson(ExportManifest.snapshotOf(manifest)) + "\n";
    }

    public static String toLatestJson(String exportPath, String manifestSha256) {
        return GSON.toJson(new LatestPointer(exportPath, manifestSha256)) + "\n";
    }

    private static final class LatestPointer {
        final String export_path;
        final String manifest_sha256;

        private LatestPointer(String exportPath, String manifestSha256) {
            this.export_path = Objects.requireNonNull(exportPath, "exportPath");
            this.manifest_sha256 = Objects.requireNonNull(manifestSha256, "manifestSha256");
        }
    }
}
