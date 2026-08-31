package dev.mcsr.icons;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

public final class ManifestWriter {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private ManifestWriter() {
    }

    public static String toJson(ExportManifest manifest) {
        return GSON.toJson(ExportManifest.snapshotOf(manifest)) + "\n";
    }
}
