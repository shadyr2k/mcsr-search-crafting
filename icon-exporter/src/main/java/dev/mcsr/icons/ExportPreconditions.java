package dev.mcsr.icons;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Objects;
import java.util.SortedMap;
import java.util.TreeMap;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.toast.SystemToast;
import net.minecraft.item.Item;
import net.minecraft.text.TranslatableText;
import net.minecraft.util.Identifier;
import net.minecraft.util.registry.Registry;

/** Pure precondition results and the environment seam used by an export run. */
public final class ExportPreconditions {
    private ExportPreconditions() {
    }

    public static PreconditionResult allowed() {
        return new PreconditionResult(true, null);
    }

    public static PreconditionResult denied(String translationKey) {
        return new PreconditionResult(false, Objects.requireNonNull(translationKey, "translationKey"));
    }

    static boolean resourcePacksAllowed(List<String> resourcePacks, List<String> incompatibleResourcePacks) {
        return onlyVanilla(resourcePacks) && onlyVanilla(incompatibleResourcePacks);
    }

    static boolean loadedWorldAllowed(boolean hasWorld, boolean hasPlayer) {
        return hasWorld && hasPlayer;
    }

    private static boolean onlyVanilla(List<String> resourcePacks) {
        for (String resourcePack : resourcePacks) {
            if (!"vanilla".equals(resourcePack)) {
                return false;
            }
        }
        return true;
    }

    static ExportEnvironment forClient(MinecraftClient client, Path exportRoot) {
        return new MinecraftExportEnvironment(client, exportRoot);
    }

    static void notify(MinecraftClient client, String translationKey, Object... args) {
        SystemToast.show(client.getToastManager(), SystemToast.Type.TUTORIAL_HINT,
                new TranslatableText("mcsr_item_icons.export.title"),
                new TranslatableText(translationKey, args));
    }

    private static final class MinecraftExportEnvironment implements ExportEnvironment {
        private final MinecraftClient client;
        private final Path exportRoot;

        private MinecraftExportEnvironment(MinecraftClient client, Path exportRoot) {
            this.client = Objects.requireNonNull(client, "client");
            this.exportRoot = Objects.requireNonNull(exportRoot, "exportRoot").toAbsolutePath().normalize();
        }

        @Override
        public PreconditionResult check() {
            if (!"1.16.1".equals(client.getGameVersion())) {
                return denied("mcsr_item_icons.export.blocked.version");
            }
            if (client.getOverlay() != null) {
                return denied("mcsr_item_icons.export.blocked.reload");
            }
            if (!loadedWorldAllowed(client.world != null, client.player != null)) {
                return denied("mcsr_item_icons.export.blocked.screen");
            }
            if (!resourcePacksAllowed(client.options.resourcePacks, client.options.incompatibleResourcePacks)) {
                return denied("mcsr_item_icons.export.blocked.resource_packs");
            }
            Path writableParent = Files.exists(exportRoot) ? exportRoot : exportRoot.getParent();
            if (writableParent == null || !Files.isDirectory(writableParent) || !Files.isWritable(writableParent)) {
                return denied("mcsr_item_icons.export.blocked.output");
            }
            return allowed();
        }

        @Override
        public SortedMap<Identifier, Item> registeredItems() {
            SortedMap<Identifier, Item> items = new TreeMap<Identifier, Item>();
            for (Identifier id : Registry.ITEM.getIds()) {
                items.put(id, Registry.ITEM.get(id));
            }
            return items;
        }

        @Override
        public void notify(String translationKey, Object... args) {
            ExportPreconditions.notify(client, translationKey, args);
        }
    }
}

final class PreconditionResult {
    public final boolean allowed;
    public final String translationKey;

    PreconditionResult(boolean allowed, String translationKey) {
        this.allowed = allowed;
        this.translationKey = translationKey;
    }
}

interface ExportEnvironment {
    PreconditionResult check();

    SortedMap<Identifier, Item> registeredItems();

    void notify(String translationKey, Object... args);
}
