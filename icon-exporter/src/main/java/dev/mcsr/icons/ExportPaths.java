package dev.mcsr.icons;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.CopyOption;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Objects;
import java.util.regex.Pattern;
import net.minecraft.util.Identifier;

public final class ExportPaths {
    private static final Pattern SAFE_SEGMENT = Pattern.compile("[a-z0-9_.-]+");
    private static final Pattern STAGING_NAME = Pattern.compile("[0-9]{8}T[0-9]{6}Z-[a-z0-9_.-]+");
    private static final Pattern SHA256 = Pattern.compile("[0-9a-f]{64}");
    private static final DateTimeFormatter STAGING_TIMESTAMP = DateTimeFormatter
            .ofPattern("yyyyMMdd'T'HHmmss'Z'")
            .withZone(ZoneOffset.UTC);

    private final Path exportRoot;
    private final Path stagingRoot;
    private final Path exportsRoot;
    private final Path latestPointer;
    private final MoveOperation moveOperation;

    public ExportPaths(Path exportRoot) {
        this(exportRoot, Files::move);
    }

    ExportPaths(Path exportRoot, MoveOperation moveOperation) {
        this.exportRoot = normalizeAbsolute(exportRoot, "exportRoot");
        this.stagingRoot = childOf(this.exportRoot, "staging");
        this.exportsRoot = childOf(this.exportRoot, "exports");
        this.latestPointer = childOf(this.exportRoot, "latest.json");
        this.moveOperation = Objects.requireNonNull(moveOperation, "moveOperation");
    }

    public Path createStaging(Instant now, String randomSuffix) throws IOException {
        Objects.requireNonNull(now, "now");
        requireSafeSegment(randomSuffix, "randomSuffix");

        Files.createDirectories(stagingRoot);
        Path staging = childOf(stagingRoot, STAGING_TIMESTAMP.format(now) + "-" + randomSuffix);
        return Files.createDirectory(staging);
    }

    public Path iconPath(Path staging, Identifier id) throws IOException {
        Path safeStaging = stagingPath(staging);
        Objects.requireNonNull(id, "id");

        Path icon = childOf(safeStaging, "icons");
        icon = childOf(icon, requireSafeSegment(id.getNamespace(), "identifier namespace"));
        String[] pathSegments = id.getPath().split("/", -1);
        for (int index = 0; index < pathSegments.length; index++) {
            String segment = requireSafeSegment(pathSegments[index], "identifier path segment");
            icon = childOf(icon, index == pathSegments.length - 1 ? segment + ".png" : segment);
        }

        Files.createDirectories(icon.getParent());
        return icon;
    }

    public Path publish(Path staging, String manifestSha256) throws IOException {
        Path safeStaging = stagingPath(staging);
        if (!Files.isDirectory(safeStaging)) {
            throw new IOException("Staging directory does not exist: " + safeStaging);
        }
        Path manifest = childOf(safeStaging, "manifest.json");
        if (!Files.isRegularFile(manifest)) {
            throw new IOException("Staging directory has no manifest.json: " + safeStaging);
        }
        if (!SHA256.matcher(Objects.requireNonNull(manifestSha256, "manifestSha256")).matches()) {
            throw new IllegalArgumentException("manifestSha256 must be a lowercase SHA-256 hex digest");
        }

        Files.createDirectories(exportsRoot);
        Path destination = childOf(exportsRoot, safeStaging.getFileName().toString());
        if (Files.exists(destination, LinkOption.NOFOLLOW_LINKS)) {
            throw new FileAlreadyExistsException(destination.toString());
        }

        moveOperation.move(safeStaging, destination, StandardCopyOption.ATOMIC_MOVE);

        Path temporaryPointer = childOf(exportRoot, "latest.json.tmp");
        Files.write(temporaryPointer,
                ManifestWriter.toLatestJson("exports/" + destination.getFileName(), manifestSha256)
                        .getBytes(StandardCharsets.UTF_8));
        moveOperation.move(temporaryPointer, latestPointer,
                StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        return destination;
    }

    public Path resolveRelative(String posixPath) {
        if (posixPath == null || posixPath.isEmpty() || posixPath.indexOf('\\') >= 0) {
            throw new IllegalArgumentException("Path must be a non-empty relative POSIX path");
        }

        Path parsed;
        try {
            parsed = Paths.get(posixPath);
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("Invalid relative POSIX path: " + posixPath, exception);
        }
        if (parsed.isAbsolute()) {
            throw new IllegalArgumentException("Path must be relative: " + posixPath);
        }

        Path resolved = exportRoot;
        String[] segments = posixPath.split("/", -1);
        for (String segment : segments) {
            resolved = childOf(resolved, requireSafeSegment(segment, "path segment"));
        }
        return resolved;
    }

    private Path stagingPath(Path staging) {
        Path normalized = normalizeAbsolute(staging, "staging");
        if (!normalized.startsWith(stagingRoot)
                || normalized.equals(stagingRoot)
                || !stagingRoot.equals(normalized.getParent())) {
            throw new IllegalArgumentException("Staging path is outside the staging root: " + normalized);
        }
        if (!STAGING_NAME.matcher(normalized.getFileName().toString()).matches()) {
            throw new IllegalArgumentException("Unsafe staging directory: " + normalized.getFileName());
        }
        return normalized;
    }

    private static Path normalizeAbsolute(Path path, String name) {
        return Objects.requireNonNull(path, name).toAbsolutePath().normalize();
    }

    private static Path childOf(Path parent, String child) {
        Path resolved = parent.resolve(child).toAbsolutePath().normalize();
        if (!resolved.startsWith(parent)) {
            throw new IllegalArgumentException("Path escapes its root: " + child);
        }
        return resolved;
    }

    private static String requireSafeSegment(String segment, String name) {
        if (segment == null || !SAFE_SEGMENT.matcher(segment).matches()
                || ".".equals(segment) || "..".equals(segment)) {
            throw new IllegalArgumentException("Unsafe " + name + ": " + segment);
        }
        return segment;
    }

    @FunctionalInterface
    interface MoveOperation {
        Path move(Path source, Path target, CopyOption... options) throws IOException;
    }
}
