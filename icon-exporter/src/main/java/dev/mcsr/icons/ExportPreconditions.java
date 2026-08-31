package dev.mcsr.icons;

import java.util.Objects;
import java.util.SortedMap;
import net.minecraft.item.Item;
import net.minecraft.util.Identifier;

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
