package dev.mcsr.icons;

import com.mojang.blaze3d.platform.FramebufferInfo;
import com.mojang.blaze3d.platform.GlStateManager;
import com.mojang.blaze3d.systems.RenderSystem;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gl.Framebuffer;
import net.minecraft.client.render.DiffuseLighting;
import net.minecraft.client.texture.AbstractTexture;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.SpriteAtlasTexture;
import net.minecraft.item.ItemStack;
import net.minecraft.util.Identifier;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL12;
import org.lwjgl.opengl.GL13;
import org.lwjgl.opengl.GL14;
import org.lwjgl.opengl.GL30;

/** Captures the running client's own GUI item render into a transparent 16x16 PNG. */
public final class GuiIconCapture implements IconCapture {
    private static final int ICON_SIZE = 16;

    private final MinecraftClient client;
    private final ExportPaths exportPaths;

    public GuiIconCapture(MinecraftClient client, ExportPaths exportPaths) {
        this.client = Objects.requireNonNull(client, "client");
        this.exportPaths = Objects.requireNonNull(exportPaths, "exportPaths");
    }

    @Override
    public Path capture(Identifier id, ItemStack stack, Path stagingRoot) throws Exception {
        RenderSystem.assertThread(RenderSystem::isOnRenderThread);
        RenderStateSnapshot previous = RenderStateSnapshot.capture(client);
        Framebuffer framebuffer = null;
        try {
            framebuffer = new Framebuffer(ICON_SIZE, ICON_SIZE, true, MinecraftClient.IS_SYSTEM_MAC);
            framebuffer.setClearColor(0.0F, 0.0F, 0.0F, 0.0F);

            RenderSystem.colorMask(true, true, true, true);
            RenderSystem.depthMask(true);
            GL11.glDisable(GL11.GL_SCISSOR_TEST);
            framebuffer.clear(MinecraftClient.IS_SYSTEM_MAC);
            framebuffer.beginWrite(true);

            configureGuiProjection();
            DiffuseLighting.enableGuiDepthLighting();
            flushEntityBuffersAfterRender(stack);

            Path output = exportPaths.iconPath(stagingRoot, id);
            writeColorAttachment(framebuffer, output);
            return output;
        } finally {
            try {
                if (framebuffer != null) {
                    framebuffer.delete();
                }
            } finally {
                previous.restore();
            }
        }
    }

    private void flushEntityBuffersAfterRender(ItemStack stack) {
        net.minecraft.client.render.VertexConsumerProvider.Immediate consumers =
                client.getBufferBuilders().getEntityVertexConsumers();
        Throwable renderFailure = null;
        try {
            client.getItemRenderer().renderGuiItemIcon(stack, 0, 0);
        } catch (RuntimeException exception) {
            renderFailure = exception;
        } catch (Error error) {
            renderFailure = error;
        }

        Throwable flushFailure = null;
        try {
            consumers.draw();
        } catch (RuntimeException exception) {
            flushFailure = exception;
        } catch (Error error) {
            flushFailure = error;
        }
        if (renderFailure != null || flushFailure != null) {
            Throwable cleanupFailure = renderFailure != null ? renderFailure : flushFailure;
            discardEntityBuffers(consumers, cleanupFailure);
        }
        if (renderFailure != null) {
            if (flushFailure != null) {
                renderFailure.addSuppressed(flushFailure);
            }
            rethrow(renderFailure);
        }
        if (flushFailure != null) {
            rethrow(flushFailure);
        }
    }

    private static void discardEntityBuffers(
            net.minecraft.client.render.VertexConsumerProvider.Immediate consumers, Throwable failure) {
        Set<net.minecraft.client.render.BufferBuilder> buffers =
                new HashSet<net.minecraft.client.render.BufferBuilder>(consumers.layerBuffers.values());
        buffers.add(consumers.fallbackBuffer);
        for (net.minecraft.client.render.BufferBuilder buffer : buffers) {
            try {
                if (buffer.isBuilding()) {
                    buffer.end();
                }
                buffer.clear();
            } catch (RuntimeException exception) {
                addSuppressedUnlessSelf(failure, exception);
            } catch (Error error) {
                addSuppressedUnlessSelf(failure, error);
            }
        }
        consumers.activeConsumers.clear();
        consumers.currentLayer = java.util.Optional.empty();
    }

    private static void addSuppressedUnlessSelf(Throwable failure, Throwable suppressed) {
        if (failure != suppressed) {
            failure.addSuppressed(suppressed);
        }
    }

    private static void rethrow(Throwable failure) {
        if (failure instanceof RuntimeException) {
            throw (RuntimeException) failure;
        }
        throw (Error) failure;
    }

    private static void configureGuiProjection() {
        RenderSystem.matrixMode(GL11.GL_PROJECTION);
        RenderSystem.loadIdentity();
        RenderSystem.ortho(0.0D, ICON_SIZE, ICON_SIZE, 0.0D, 1000.0D, 3000.0D);
        RenderSystem.matrixMode(GL11.GL_MODELVIEW);
        RenderSystem.loadIdentity();
        RenderSystem.translatef(0.0F, 0.0F, -2000.0F);
        RenderSystem.activeTexture(GL13.GL_TEXTURE0);
        RenderSystem.enableTexture();
        RenderSystem.enableDepthTest();
        RenderSystem.depthMask(true);
    }

    private static void writeColorAttachment(Framebuffer framebuffer, Path output) throws Exception {
        RenderSystem.activeTexture(GL13.GL_TEXTURE0);
        RenderSystem.bindTexture(framebuffer.colorAttachment);
        try (NativeImage image = new NativeImage(NativeImage.Format.ABGR, ICON_SIZE, ICON_SIZE, false)) {
            image.loadFromTextureImage(0, false);
            image.mirrorVertically();
            image.writeFile(output);
        }
    }

    /**
     * The item renderer and built-in entity renderers use legacy global GL state. The attribute
     * stacks restore that entire state, while explicit framebuffer/matrix snapshots cover state
     * outside those stacks and the cache resync keeps GlStateManager consistent afterward.
     */
    private static final class RenderStateSnapshot {
        private final boolean separateFramebufferBindings;
        private final int drawFramebuffer;
        private final int readFramebuffer;
        private final int[] viewport;
        private final MatrixState projection;
        private final MatrixState modelView;
        private final MatrixState texture;
        private final int matrixMode;
        private final int attributeStackDepth;
        private final int clientAttributeStackDepth;
        private final boolean alphaTest;
        private final int alphaFunction;
        private final float alphaReference;
        private final boolean lighting;
        private final boolean light0;
        private final boolean light1;
        private final boolean colorMaterial;
        private final boolean depthTest;
        private final int depthFunction;
        private final boolean depthMask;
        private final boolean blend;
        private final int blendSourceRgb;
        private final int blendDestinationRgb;
        private final int blendSourceAlpha;
        private final int blendDestinationAlpha;
        private final boolean cull;
        private final boolean fog;
        private final boolean texture2d;
        private final boolean rescaleNormal;
        private final int shadeModel;
        private final boolean[] colorMask;
        private final float[] currentColor;
        private final float[] clearColor;
        private final double clearDepth;
        private final int activeTexture;
        private final int texture0Binding;
        private final int cacheSyncTexture;
        private final AbstractTexture blockAtlas;
        private final boolean blockAtlasBilinear;
        private final boolean blockAtlasMipmap;

        private RenderStateSnapshot(MinecraftClient client) {
            separateFramebufferBindings = GlStateManager.supportsGl30();
            if (separateFramebufferBindings) {
                drawFramebuffer = GL11.glGetInteger(GL30.GL_DRAW_FRAMEBUFFER_BINDING);
                readFramebuffer = GL11.glGetInteger(GL30.GL_READ_FRAMEBUFFER_BINDING);
            } else {
                drawFramebuffer = GL11.glGetInteger(GL30.GL_FRAMEBUFFER_BINDING);
                readFramebuffer = drawFramebuffer;
            }
            viewport = integers(GL11.GL_VIEWPORT, 4);
            matrixMode = GL11.glGetInteger(GL11.GL_MATRIX_MODE);
            projection = MatrixState.capture(GL11.GL_PROJECTION, GL11.GL_PROJECTION_MATRIX,
                    GL11.GL_PROJECTION_STACK_DEPTH);
            modelView = MatrixState.capture(GL11.GL_MODELVIEW, GL11.GL_MODELVIEW_MATRIX,
                    GL11.GL_MODELVIEW_STACK_DEPTH);
            texture = MatrixState.capture(GL11.GL_TEXTURE, GL11.GL_TEXTURE_MATRIX,
                    GL11.GL_TEXTURE_STACK_DEPTH);
            RenderSystem.matrixMode(matrixMode);

            attributeStackDepth = GL11.glGetInteger(GL11.GL_ATTRIB_STACK_DEPTH);
            clientAttributeStackDepth = GL11.glGetInteger(GL11.GL_CLIENT_ATTRIB_STACK_DEPTH);
            alphaTest = GL11.glIsEnabled(GL11.GL_ALPHA_TEST);
            alphaFunction = GL11.glGetInteger(GL11.GL_ALPHA_TEST_FUNC);
            alphaReference = GL11.glGetFloat(GL11.GL_ALPHA_TEST_REF);
            lighting = GL11.glIsEnabled(GL11.GL_LIGHTING);
            light0 = GL11.glIsEnabled(GL11.GL_LIGHT0);
            light1 = GL11.glIsEnabled(GL11.GL_LIGHT1);
            colorMaterial = GL11.glIsEnabled(GL11.GL_COLOR_MATERIAL);
            depthTest = GL11.glIsEnabled(GL11.GL_DEPTH_TEST);
            depthFunction = GL11.glGetInteger(GL11.GL_DEPTH_FUNC);
            depthMask = GL11.glGetBoolean(GL11.GL_DEPTH_WRITEMASK);
            blend = GL11.glIsEnabled(GL11.GL_BLEND);
            blendSourceRgb = GL11.glGetInteger(GL14.GL_BLEND_SRC_RGB);
            blendDestinationRgb = GL11.glGetInteger(GL14.GL_BLEND_DST_RGB);
            blendSourceAlpha = GL11.glGetInteger(GL14.GL_BLEND_SRC_ALPHA);
            blendDestinationAlpha = GL11.glGetInteger(GL14.GL_BLEND_DST_ALPHA);
            cull = GL11.glIsEnabled(GL11.GL_CULL_FACE);
            fog = GL11.glIsEnabled(GL11.GL_FOG);
            rescaleNormal = GL11.glIsEnabled(GL12.GL_RESCALE_NORMAL);
            shadeModel = GL11.glGetInteger(GL11.GL_SHADE_MODEL);
            colorMask = booleans(GL11.GL_COLOR_WRITEMASK, 4);
            currentColor = floats(GL11.GL_CURRENT_COLOR, 4);
            clearColor = floats(GL11.GL_COLOR_CLEAR_VALUE, 4);
            clearDepth = GL11.glGetDouble(GL11.GL_DEPTH_CLEAR_VALUE);

            activeTexture = GL11.glGetInteger(GL13.GL_ACTIVE_TEXTURE);
            GL13.glActiveTexture(GL13.GL_TEXTURE0);
            texture2d = GL11.glIsEnabled(GL11.GL_TEXTURE_2D);
            texture0Binding = GL11.glGetInteger(GL11.GL_TEXTURE_BINDING_2D);
            blockAtlas = client.getTextureManager().getTexture(SpriteAtlasTexture.BLOCK_ATLAS_TEX);
            cacheSyncTexture = blockAtlas.getGlId();
            GL11.glBindTexture(GL11.GL_TEXTURE_2D, cacheSyncTexture);
            int atlasMinFilter = GL11.glGetTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MIN_FILTER);
            int atlasMagFilter = GL11.glGetTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MAG_FILTER);
            blockAtlasBilinear = atlasMagFilter == GL11.GL_LINEAR;
            blockAtlasMipmap = atlasMinFilter == GL11.GL_LINEAR_MIPMAP_LINEAR
                    || atlasMinFilter == GL11.GL_NEAREST_MIPMAP_LINEAR;
            GL11.glBindTexture(GL11.GL_TEXTURE_2D, texture0Binding);
            GL13.glActiveTexture(activeTexture);

            GL11.glPushAttrib(GL11.GL_ALL_ATTRIB_BITS);
            GL11.glPushClientAttrib(GL11.GL_CLIENT_ALL_ATTRIB_BITS);
        }

        static RenderStateSnapshot capture(MinecraftClient client) {
            return new RenderStateSnapshot(client);
        }

        void restore() {
            restoreBlockAtlasFilter();
            restoreAttributeStacks();
            projection.restore();
            modelView.restore();
            texture.restore();
            RenderSystem.matrixMode(matrixMode);

            if (separateFramebufferBindings) {
                GlStateManager.bindFramebuffer(GL30.GL_DRAW_FRAMEBUFFER, drawFramebuffer);
                GlStateManager.bindFramebuffer(GL30.GL_READ_FRAMEBUFFER, readFramebuffer);
            } else {
                GlStateManager.bindFramebuffer(FramebufferInfo.FRAME_BUFFER, drawFramebuffer);
            }
            forceViewport();
            resynchronizeTrackedState();
        }

        private void restoreBlockAtlasFilter() {
            RenderSystem.activeTexture(GL13.GL_TEXTURE0);
            RenderSystem.bindTexture(cacheSyncTexture);
            blockAtlas.setFilter(blockAtlasBilinear, blockAtlasMipmap);
        }

        private void restoreAttributeStacks() {
            while (GL11.glGetInteger(GL11.GL_CLIENT_ATTRIB_STACK_DEPTH) > clientAttributeStackDepth) {
                GL11.glPopClientAttrib();
            }
            while (GL11.glGetInteger(GL11.GL_ATTRIB_STACK_DEPTH) > attributeStackDepth) {
                GL11.glPopAttrib();
            }
        }

        private void forceViewport() {
            RenderSystem.viewport(viewport[0] + 1, viewport[1], viewport[2], viewport[3]);
            RenderSystem.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
        }

        private void resynchronizeTrackedState() {
            forceCapability(alphaTest, RenderSystem::enableAlphaTest, RenderSystem::disableAlphaTest);
            RenderSystem.alphaFunc(alphaFunction == GL11.GL_ALWAYS ? GL11.GL_LESS : GL11.GL_ALWAYS,
                    alphaReference == 0.0F ? 1.0F : 0.0F);
            RenderSystem.alphaFunc(alphaFunction, alphaReference);
            forceCapability(lighting, RenderSystem::enableLighting, RenderSystem::disableLighting);
            forceLight(light0, 0);
            forceLight(light1, 1);
            forceCapability(colorMaterial, RenderSystem::enableColorMaterial, RenderSystem::disableColorMaterial);
            forceCapability(depthTest, RenderSystem::enableDepthTest, RenderSystem::disableDepthTest);
            RenderSystem.depthFunc(depthFunction == GL11.GL_ALWAYS ? GL11.GL_LESS : GL11.GL_ALWAYS);
            RenderSystem.depthFunc(depthFunction);
            RenderSystem.depthMask(!depthMask);
            RenderSystem.depthMask(depthMask);
            forceCapability(blend, RenderSystem::enableBlend, RenderSystem::disableBlend);
            RenderSystem.blendFuncSeparate(GL11.GL_ONE, GL11.GL_ZERO, GL11.GL_ONE, GL11.GL_ZERO);
            RenderSystem.blendFuncSeparate(blendSourceRgb, blendDestinationRgb,
                    blendSourceAlpha, blendDestinationAlpha);
            forceCapability(cull, RenderSystem::enableCull, RenderSystem::disableCull);
            forceCapability(fog, RenderSystem::enableFog, RenderSystem::disableFog);
            forceCapability(rescaleNormal, RenderSystem::enableRescaleNormal, RenderSystem::disableRescaleNormal);
            RenderSystem.shadeModel(shadeModel == GL11.GL_FLAT ? GL11.GL_SMOOTH : GL11.GL_FLAT);
            RenderSystem.shadeModel(shadeModel);
            RenderSystem.colorMask(!colorMask[0], !colorMask[1], !colorMask[2], !colorMask[3]);
            RenderSystem.colorMask(colorMask[0], colorMask[1], colorMask[2], colorMask[3]);
            RenderSystem.color4f(currentColor[0] == 0.0F ? 1.0F : 0.0F,
                    currentColor[1], currentColor[2], currentColor[3]);
            RenderSystem.color4f(currentColor[0], currentColor[1], currentColor[2], currentColor[3]);
            RenderSystem.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
            RenderSystem.clearDepth(clearDepth);

            forceActiveTexture(GL13.GL_TEXTURE0);
            forceTextureBinding(texture0Binding);
            forceCapability(texture2d, RenderSystem::enableTexture, RenderSystem::disableTexture);
            forceActiveTexture(activeTexture);
        }

        private void forceActiveTexture(int desired) {
            int alternate = desired == GL13.GL_TEXTURE0 ? GL13.GL_TEXTURE1 : GL13.GL_TEXTURE0;
            RenderSystem.activeTexture(alternate);
            RenderSystem.activeTexture(desired);
        }

        private void forceTextureBinding(int desired) {
            int alternate = desired == 0 ? cacheSyncTexture : 0;
            RenderSystem.bindTexture(alternate);
            RenderSystem.bindTexture(desired);
        }

        private static void forceCapability(boolean enabled, Runnable enable, Runnable disable) {
            if (enabled) {
                disable.run();
                enable.run();
            } else {
                enable.run();
                disable.run();
            }
        }

        private static void forceLight(boolean enabled, int light) {
            GlStateManager.LIGHT_ENABLE[light].setState(!enabled);
            GlStateManager.LIGHT_ENABLE[light].setState(enabled);
        }

        private static int[] integers(int parameter, int length) {
            int[] values = new int[length];
            GL11.glGetIntegerv(parameter, values);
            return values;
        }

        private static boolean[] booleans(int parameter, int length) {
            byte[] bytes = new byte[length];
            java.nio.ByteBuffer buffer = org.lwjgl.BufferUtils.createByteBuffer(length);
            GL11.glGetBooleanv(parameter, buffer);
            boolean[] values = new boolean[length];
            for (int index = 0; index < length; index++) {
                bytes[index] = buffer.get(index);
                values[index] = bytes[index] != 0;
            }
            return values;
        }

        private static float[] floats(int parameter, int length) {
            float[] values = new float[length];
            GL11.glGetFloatv(parameter, values);
            return values;
        }
    }

    private static final class MatrixState {
        private final int mode;
        private final int stackDepthParameter;
        private final int stackDepth;
        private final float[] matrix;

        private MatrixState(int mode, int matrixParameter, int stackDepthParameter) {
            this.mode = mode;
            this.stackDepthParameter = stackDepthParameter;
            RenderSystem.matrixMode(mode);
            stackDepth = GL11.glGetInteger(stackDepthParameter);
            matrix = new float[16];
            GL11.glGetFloatv(matrixParameter, matrix);
        }

        static MatrixState capture(int mode, int matrixParameter, int stackDepthParameter) {
            return new MatrixState(mode, matrixParameter, stackDepthParameter);
        }

        void restore() {
            RenderSystem.matrixMode(mode);
            int currentDepth = GL11.glGetInteger(stackDepthParameter);
            while (currentDepth > stackDepth) {
                GL11.glPopMatrix();
                currentDepth--;
            }
            while (currentDepth < stackDepth) {
                GL11.glPushMatrix();
                currentDepth++;
            }
            GL11.glLoadMatrixf(matrix);
        }
    }
}
