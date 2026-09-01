package dev.mcsr.icons;

import java.nio.file.Path;
import java.time.Instant;
import java.util.Collections;
import java.util.UUID;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.options.KeyBinding;
import net.minecraft.client.util.InputUtil;
import org.lwjgl.glfw.GLFW;

/** Client-only key binding and end-tick driver for bounded icon exports. */
public final class McsrItemIconsClient implements ClientModInitializer {
    private static final String EXPORT_KEY = "key.mcsr_item_icons.export";
    private static final String KEY_CATEGORY = "key.categories.mcsr_item_icons";

    private KeyBinding exportKey;
    private ExportCoordinator coordinator;

    @Override
    public void onInitializeClient() {
        MinecraftClient client = MinecraftClient.getInstance();
        coordinator = createCoordinator(client);
        exportKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                EXPORT_KEY, InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_F8, KEY_CATEGORY));
        ClientTickEvents.END_CLIENT_TICK.register(this::onEndClientTick);
    }

    static ExportCoordinator createCoordinator(final MinecraftClient client) {
        Path exportRoot = client.runDirectory.toPath().resolve("mcsr-item-icons").toAbsolutePath().normalize();
        ExportPaths paths = new ExportPaths(exportRoot);
        return new ExportCoordinator(
                ExportPreconditions.forClient(client, exportRoot),
                new GuiIconCapture(client, paths),
                paths,
                ExportManifest.create("1.16.1", "1.0.0", Collections.singletonList("vanilla")),
                new RunIdentitySource() {
                    @Override
                    public RunIdentity next() {
                        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
                        return new RunIdentity(Instant.now(), suffix);
                    }
                });
    }

    private void onEndClientTick(MinecraftClient client) {
        boolean startedThisTick = false;
        if (exportKey.wasPressed()) {
            if (coordinator.state() == ExportState.RUNNING) {
                ExportPreconditions.notify(client, "mcsr_item_icons.export.already_running");
            } else if (coordinator.start()) {
                startedThisTick = true;
                ExportPreconditions.notify(client, "mcsr_item_icons.export.started", coordinator.totalCount());
            }
        }

        if (!startedThisTick && coordinator.state() == ExportState.RUNNING) {
            int before = coordinator.attemptedCount();
            coordinator.tick();
            if (coordinator.state() == ExportState.RUNNING && coordinator.attemptedCount() != before) {
                ExportPreconditions.notify(client, "mcsr_item_icons.export.progress",
                        coordinator.attemptedCount(), coordinator.totalCount());
            } else if (coordinator.state() == ExportState.COMPLETE) {
                Path export = coordinator.completedExport();
                int failureCount = coordinator.manifest().failures.size();
                if (failureCount == 0) {
                    ExportPreconditions.notify(client, "mcsr_item_icons.export.completed", export);
                } else {
                    ExportPreconditions.notify(client, "mcsr_item_icons.export.completed_with_failures",
                            failureCount, export);
                }
            }
        }
    }
}
