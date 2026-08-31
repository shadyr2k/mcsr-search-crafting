# Minecraft 1.16.1 Item-Icon Exporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Export Minecraft 1.16.1's own native 16x16 inventory renders from a vanilla-resource Fabric client, validate them in Python, and publish only the icons required by the MCSR Search Crafting website.

**Architecture:** A small Java 8 Fabric client mod owns registry enumeration, render-thread capture, bounded tick scheduling, immutable export publication, and the game-side manifest. A separate Python command treats that export as untrusted input, validates every required PNG and hash, atomically publishes the browser subset, and produces a deterministic development contact sheet. The React application consumes only the validated static manifest and exposes an accessible fallback for an isolated image-load failure.

**Tech Stack:** Minecraft Java Edition 1.16.1; Fabric Loader `0.9.3+build.207`; Yarn `1.16.1+build.21:v2`; Fabric API `0.18.0+build.387-1.16.1`; Fabric Loom `0.5.15`; Gradle `6.6.1`; Java 8; JUnit 5; Python 3.11+, pytest, Pillow; TypeScript, React 19, Vitest 3, Testing Library, Vite 7

**Spec:** `docs/superpowers/specs/2026-08-31-minecraft-item-icon-exporter-design.md`

## Global Constraints

- The mod is client-only and runs only in Minecraft 1.16.1 with vanilla resources enabled.
- Render through Minecraft's `ItemRenderer`; do not reconstruct item models or special built-in entity renders outside the game.
- Export every sorted registered non-air item as a count-one default `ItemStack`, without count, durability, or text overlays.
- Capture transparent native 16x16 PNGs and restore framebuffer, viewport, matrix, lighting, blend, depth, and texture state in all paths.
- Process a bounded batch per client tick. Per-item failure is recorded and does not stop later items.
- Use `mcsr-item-icons/staging/<timestamp>-<suffix>/`, rename one complete run into immutable `exports/<timestamp>-<suffix>/`, then atomically replace only `latest.json`.
- Never delete an earlier export. Normalize and contain every move, manifest path, and pointer below the resolved `mcsr-item-icons` root.
- Accept only schema version 1, Minecraft 1.16.1, `resource_packs: ["vanilla"]`, 16x16 RGBA PNGs, safe unique paths, and matching SHA-256 values.
- Required website IDs are the exact sorted union of generated search items and selectable inventory items. Unexpected exported IDs are allowed but are not published.
- A failed import leaves the existing `web/public/item-icons/` tree byte-for-byte unchanged.
- The website ships neither the mod JAR nor the Minecraft client JAR.
- Searchable tooltip and language extraction remain outside this implementation.
- Every code task follows red-green-refactor: add a focused failing test, run it and observe the intended failure, implement the smallest behavior, rerun the focused gate, then commit only that task's files.

---

## File Map

```text
icon-exporter/settings.gradle
icon-exporter/build.gradle
icon-exporter/gradle.properties
icon-exporter/gradlew
icon-exporter/gradlew.bat
icon-exporter/gradle/wrapper/gradle-wrapper.jar
icon-exporter/gradle/wrapper/gradle-wrapper.properties
  Pin the reproducible Java 8 Fabric/Gradle build.

icon-exporter/src/main/resources/fabric.mod.json
icon-exporter/src/main/resources/assets/mcsr_item_icons/lang/en_us.json
  Declare a client-only mod and localize the key binding/messages.

icon-exporter/src/main/java/dev/mcsr/icons/McsrItemIconsClient.java
  Register the key and end-client-tick driver.
icon-exporter/src/main/java/dev/mcsr/icons/ExportPreconditions.java
  Verify version, screen, resource reload, resource packs, and output access.
icon-exporter/src/main/java/dev/mcsr/icons/ExportCoordinator.java
  Own the single-run state machine, sorted queue, bounded batches, and feedback.
icon-exporter/src/main/java/dev/mcsr/icons/GuiIconCapture.java
  Render and read one item through Minecraft's framebuffer and ItemRenderer.
icon-exporter/src/main/java/dev/mcsr/icons/ExportPaths.java
  Create safe staging/exports paths and publish latest.json without deletion.
icon-exporter/src/main/java/dev/mcsr/icons/ExportManifest.java
icon-exporter/src/main/java/dev/mcsr/icons/ManifestWriter.java
  Model and deterministically serialize schema-version-1 manifests.

icon-exporter/src/test/java/dev/mcsr/icons/ExportPathsTest.java
icon-exporter/src/test/java/dev/mcsr/icons/ExportManifestTest.java
icon-exporter/src/test/java/dev/mcsr/icons/ExportCoordinatorTest.java
icon-exporter/src/test/java/dev/mcsr/icons/ExportPreconditionsTest.java
  Cover pure game-independent safety and state behavior. Rendering is verified in-game.

generator/src/mcsr_data/icon_import.py
  Validate one game export and atomically publish the required browser subset.
generator/src/mcsr_data/icon_manifest.py
  Parse strict manifests, safe paths, PNG metadata, and deterministic hashes.
generator/src/mcsr_data/icon_contact_sheet.py
  Generate the labeled representative development contact sheet.
generator/tests/test_icon_manifest.py
generator/tests/test_icon_import.py
generator/tests/test_icon_contact_sheet.py
  Cover validation, atomicity, determinism, exact required unions, and diagnostics.
generator/tests/fixtures/icon_export/
  Store tiny generated fixture manifests and 16x16 RGBA PNGs only.
pyproject.toml
  Add Pillow test/runtime dependency and the `mcsr-import-icons` console command.

web/public/item-icons/manifest.json
web/public/item-icons/minecraft/*.png
  Hold the validated runtime subset after the real game export is accepted.
web/src/data/iconManifest.ts
web/src/data/iconManifest.test.ts
  Strictly load the browser icon manifest and verify complete generated-data coverage.
web/src/components/ItemIcon.tsx
web/src/components/ItemIcon.test.tsx
  Render crisp icons with English tooltips/ARIA and an accessible failure fallback.

docs/icon-exporter.md
  Explain build, Prism installation, vanilla-resource export, import, and acceptance.
README.md
  Link the exporter/importer workflow and state that no Minecraft JAR is shipped.
```

## Shared Interfaces

### Java export contract

```java
public final class ExportManifest {
    public final int schema_version = 1;
    public final String minecraft_version;
    public final String exporter_version;
    public final int icon_width = 16;
    public final int icon_height = 16;
    public final List<String> resource_packs;
    public final SortedMap<String, IconRecord> icons;
    public final List<FailureRecord> failures;
}

public final class IconRecord {
    public final String path;
    public final String sha256;
}

public final class FailureRecord {
    public final String item_id;
    public final String exception_class;
    public final String message;
}

public interface IconCapture {
    Path capture(Identifier itemId, ItemStack stack, Path stagingRoot) throws Exception;
}

public enum ExportState { IDLE, RUNNING, COMPLETE, FAILED }
```

### Python importer contract

```python
@dataclass(frozen=True)
class ExportIcon:
    item_id: str
    relative_path: PurePosixPath
    sha256: str

@dataclass(frozen=True)
class ValidatedExport:
    root: Path
    minecraft_version: str
    width: int
    height: int
    icons: Mapping[str, ExportIcon]
    failed_item_ids: frozenset[str]

def load_export_manifest(export_root: Path) -> ValidatedExport: ...

def required_item_ids(search_items_path: Path, inventory_items_path: Path) -> tuple[str, ...]: ...

def import_icons(
    export_root: Path,
    search_items_path: Path,
    inventory_items_path: Path,
    output_root: Path,
    contact_sheet_path: Path,
) -> None: ...
```

### Browser icon contract

```ts
export interface IconManifest {
  schemaVersion: 1
  minecraftVersion: '1.16.1'
  width: 16
  height: 16
  icons: Map<string, string>
}

export interface ItemIconProps {
  itemId: string
  name: string
  manifest: IconManifest
  size?: 'compact' | 'picker' | 'detail'
  className?: string
}
```

---

### Task 1: Scaffold the pinned client-only Fabric project and strict manifest model

**Files:**
- Create: `icon-exporter/settings.gradle`
- Create: `icon-exporter/build.gradle`
- Create: `icon-exporter/gradle.properties`
- Create: `icon-exporter/gradlew`
- Create: `icon-exporter/gradlew.bat`
- Create: `icon-exporter/gradle/wrapper/gradle-wrapper.jar`
- Create: `icon-exporter/gradle/wrapper/gradle-wrapper.properties`
- Create: `icon-exporter/src/main/resources/fabric.mod.json`
- Create: `icon-exporter/src/main/resources/assets/mcsr_item_icons/lang/en_us.json`
- Create: `icon-exporter/src/main/java/dev/mcsr/icons/ExportManifest.java`
- Create: `icon-exporter/src/main/java/dev/mcsr/icons/ManifestWriter.java`
- Create: `icon-exporter/src/test/java/dev/mcsr/icons/ExportManifestTest.java`

- [ ] **Step 1: Add the minimal pinned build and client-only metadata**

Use these exact pins in `gradle.properties`:

```properties
minecraft_version=1.16.1
yarn_mappings=1.16.1+build.21
loader_version=0.9.3+build.207
fabric_version=0.18.0+build.387-1.16.1
loom_version=0.5.15
mod_version=1.0.0
maven_group=dev.mcsr
archives_base_name=mcsr-item-icons
org.gradle.jvmargs=-Xmx1G
```

Use Gradle 6.6.1, Java source/target 8, JUnit Jupiter 5.6.2, `mappings "net.fabricmc:yarn:${project.yarn_mappings}:v2"`, and the pinned Fabric API. `fabric.mod.json` must contain only a `client` entrypoint, `"environment": "client"`, and exact Minecraft `1.16.1` dependency.

- [ ] **Step 2: Write a failing deterministic-manifest test**

```java
@Test
void writesSortedStableSchemaOneJson() throws Exception {
    ExportManifest manifest = ExportManifest.create("1.16.1", "1.0.0", Arrays.asList("vanilla"));
    manifest.addIcon("minecraft:stick", "icons/minecraft/stick.png", repeat("a", 64));
    manifest.addIcon("minecraft:apple", "icons/minecraft/apple.png", repeat("b", 64));

    String first = ManifestWriter.toJson(manifest);
    String second = ManifestWriter.toJson(manifest);

    assertEquals(first, second);
    assertTrue(first.indexOf("minecraft:apple") < first.indexOf("minecraft:stick"));
    assertTrue(first.endsWith("\n"));
}
```

- [ ] **Step 3: Run the test and confirm the missing model/writer failure**

Run: `cd icon-exporter; .\gradlew.bat test --tests dev.mcsr.icons.ExportManifestTest`

Expected: compilation fails because `ExportManifest` and `ManifestWriter` do not exist.

- [ ] **Step 4: Implement immutable records and deterministic Gson serialization**

Use `TreeMap` for icon records, copy resource packs and failure records before serialization, reject duplicate IDs/paths, and configure Gson with pretty printing plus one terminal newline. Keep every manifest field named exactly as the schema specifies.

- [ ] **Step 5: Rerun the focused test and build the remapped JAR**

Run:

```powershell
cd icon-exporter
.\gradlew.bat test --tests dev.mcsr.icons.ExportManifestTest
.\gradlew.bat build
```

Expected: both commands exit 0 and `build/libs/mcsr-item-icons-1.0.0.jar` is produced.

- [ ] **Step 6: Commit the scaffold and manifest contract**

```powershell
git add -- icon-exporter
git commit -m "feat: scaffold Minecraft icon exporter"
```

---

### Task 2: Implement safe immutable export publication

**Files:**
- Create: `icon-exporter/src/main/java/dev/mcsr/icons/ExportPaths.java`
- Create: `icon-exporter/src/test/java/dev/mcsr/icons/ExportPathsTest.java`
- Modify: `icon-exporter/src/main/java/dev/mcsr/icons/ManifestWriter.java`

- [ ] **Step 1: Write failing path-containment and prior-pointer preservation tests**

```java
@Test
void rejectsTraversalAndPathsOutsideExportRoot() {
    ExportPaths paths = new ExportPaths(tempDir);
    assertThrows(IllegalArgumentException.class, () -> paths.resolveRelative("../world"));
    assertThrows(IllegalArgumentException.class, () -> paths.resolveRelative("C:/outside"));
}

@Test
void failedPublishLeavesLatestAndCompletedExportsUntouched() throws Exception {
    Files.write(tempDir.resolve("latest.json"), "old".getBytes(UTF_8));
    Path oldExport = Files.createDirectories(tempDir.resolve("exports/old"));
    ExportPaths paths = new ExportPaths(tempDir, moveThatFailsOnFinalRename());

    assertThrows(IOException.class, () -> paths.publish(stagingWithManifest()));
    assertEquals("old", new String(Files.readAllBytes(tempDir.resolve("latest.json")), UTF_8));
    assertTrue(Files.isDirectory(oldExport));
}
```

- [ ] **Step 2: Run the focused test and confirm `ExportPaths` is missing**

Run: `cd icon-exporter; .\gradlew.bat test --tests dev.mcsr.icons.ExportPathsTest`

Expected: compilation fails on the missing class.

- [ ] **Step 3: Implement normalized safe paths and two-stage publication**

`ExportPaths` must expose:

```java
public Path createStaging(Instant now, String randomSuffix) throws IOException;
public Path iconPath(Path staging, Identifier id) throws IOException;
public Path publish(Path staging, String manifestSha256) throws IOException;
public Path resolveRelative(String posixPath);
```

The implementation must:

- normalize absolute root, staging, destination, and pointer paths before mutation;
- ensure every resolved child starts with the intended root;
- permit only `[a-z0-9_.-]+` namespace/path segments derived from registry IDs;
- create `latest.json.tmp` beside `latest.json`;
- use `ATOMIC_MOVE, REPLACE_EXISTING` for the pointer and fail closed if unavailable;
- never recursively delete or overwrite an existing immutable export directory.

- [ ] **Step 4: Rerun the focused tests**

Run: `cd icon-exporter; .\gradlew.bat test --tests dev.mcsr.icons.ExportPathsTest`

Expected: all path and publication tests pass.

- [ ] **Step 5: Commit safe export publication**

```powershell
git add -- icon-exporter/src/main/java/dev/mcsr/icons/ExportPaths.java icon-exporter/src/main/java/dev/mcsr/icons/ManifestWriter.java icon-exporter/src/test/java/dev/mcsr/icons/ExportPathsTest.java
git commit -m "feat: publish immutable item icon exports"
```

---

### Task 3: Add preconditions and the bounded export coordinator

**Files:**
- Create: `icon-exporter/src/main/java/dev/mcsr/icons/ExportPreconditions.java`
- Create: `icon-exporter/src/main/java/dev/mcsr/icons/ExportCoordinator.java`
- Create: `icon-exporter/src/test/java/dev/mcsr/icons/ExportPreconditionsTest.java`
- Create: `icon-exporter/src/test/java/dev/mcsr/icons/ExportCoordinatorTest.java`

- [ ] **Step 1: Write failing pure-state tests**

```java
@Test
void rejectsReentryAndAdvancesOnlyConfiguredBatch() throws Exception {
    ExportCoordinator coordinator = fixtureCoordinator(2, "minecraft:air", "minecraft:apple", "minecraft:stick");
    assertTrue(coordinator.start());
    assertFalse(coordinator.start());

    coordinator.tick();

    assertEquals(ExportState.RUNNING, coordinator.state());
    assertEquals(2, coordinator.attemptedCount());
    assertEquals(Arrays.asList("minecraft:apple", "minecraft:stick"), capture.attemptedIds());
}

@Test
void recordsOneItemFailureAndContinues() throws Exception {
    ExportCoordinator coordinator = fixtureCoordinatorWithFailure("minecraft:apple");
    runToCompletion(coordinator);
    assertEquals(ExportState.COMPLETE, coordinator.state());
    assertEquals(Collections.singletonList("minecraft:apple"), coordinator.manifest().failedIds());
    assertTrue(coordinator.manifest().icons.containsKey("minecraft:stick"));
}
```

- [ ] **Step 2: Run tests and observe missing coordinator/preconditions failures**

Run: `cd icon-exporter; .\gradlew.bat test --tests 'dev.mcsr.icons.Export*Test'`

Expected: compilation fails for the new state interfaces.

- [ ] **Step 3: Implement precondition results and a dependency-injected coordinator**

Use a pure result type rather than throwing for user-correctable preconditions:

```java
public final class PreconditionResult {
    public final boolean allowed;
    public final String translationKey;
}

public interface ExportEnvironment {
    PreconditionResult check();
    SortedMap<Identifier, Item> registeredItems();
    void notify(String translationKey, Object... args);
}
```

Sort IDs lexically, exclude only `Items.AIR`, create one default count-one stack per ID, process `4` items per tick by default, record the concise root exception class/message, and call publication only after all IDs have been attempted and the manifest is written.

- [ ] **Step 4: Verify state, ordering, batching, and failure continuation**

Run: `cd icon-exporter; .\gradlew.bat test --tests 'dev.mcsr.icons.Export*Test'`

Expected: all pure Java tests pass.

- [ ] **Step 5: Commit the coordinator**

```powershell
git add -- icon-exporter/src/main/java/dev/mcsr/icons/ExportPreconditions.java icon-exporter/src/main/java/dev/mcsr/icons/ExportCoordinator.java icon-exporter/src/test/java/dev/mcsr/icons/ExportPreconditionsTest.java icon-exporter/src/test/java/dev/mcsr/icons/ExportCoordinatorTest.java
git commit -m "feat: coordinate bounded icon exports"
```

---

### Task 4: Wire the client key and native GUI render capture

**Files:**
- Create: `icon-exporter/src/main/java/dev/mcsr/icons/McsrItemIconsClient.java`
- Create: `icon-exporter/src/main/java/dev/mcsr/icons/GuiIconCapture.java`
- Modify: `icon-exporter/src/main/resources/assets/mcsr_item_icons/lang/en_us.json`
- Modify: `icon-exporter/src/main/resources/fabric.mod.json`
- Modify: `icon-exporter/src/main/java/dev/mcsr/icons/ExportPreconditions.java`

- [ ] **Step 1: Add a compile-time client smoke contract**

Add a package-visible factory in `McsrItemIconsClient` and a test assertion in `ExportCoordinatorTest` that the default batch size is `4`. This creates a stable seam while leaving actual OpenGL rendering to in-game acceptance.

- [ ] **Step 2: Run the build and observe the missing entrypoint/capture implementation**

Run: `cd icon-exporter; .\gradlew.bat build`

Expected: compilation fails until the client entrypoint and capture class exist.

- [ ] **Step 3: Implement key registration and end-tick progression**

Register one Fabric key binding in category `key.categories.mcsr_item_icons`. On `ClientTickEvents.END_CLIENT_TICK`, consume the key press once and call `start`; on every later tick call `tick` only while running. User messages must cover blocked preconditions, already running, progress, completed export path, and completed-with-failures.

- [ ] **Step 4: Implement render-thread framebuffer capture with guaranteed restoration**

The core must follow this shape:

```java
public Path capture(Identifier id, ItemStack stack, Path stagingRoot) throws Exception {
    RenderSystem.assertThread(RenderSystem::isOnRenderThread);
    RenderStateSnapshot previous = RenderStateSnapshot.capture(client);
    Framebuffer framebuffer = new Framebuffer(16, 16, true, MinecraftClient.IS_SYSTEM_MAC);
    try {
        framebuffer.setClearColor(0F, 0F, 0F, 0F);
        framebuffer.clear(MinecraftClient.IS_SYSTEM_MAC);
        framebuffer.beginWrite(true);
        configureGuiProjection();
        client.getItemRenderer().renderGuiItemIcon(stack, 0, 0);
        flushRenderBuffers();
        NativeImage image = readColorAttachment(framebuffer);
        image.mirrorVertically();
        Path output = exportPaths.iconPath(stagingRoot, id);
        image.writeTo(output);
        image.close();
        return output;
    } finally {
        framebuffer.delete();
        previous.restore(client);
    }
}
```

Audit mapped 1.16.1 method names against Yarn build 21 during implementation. The restoration snapshot must include the prior main framebuffer binding and viewport plus every GL state changed by the capture. Do not use `renderGuiItemOverlay`.

- [ ] **Step 5: Build the remapped client JAR**

Run:

```powershell
cd icon-exporter
.\gradlew.bat test
.\gradlew.bat build
```

Expected: tests and remap/build exit 0.

- [ ] **Step 6: Perform the first in-game smoke test before importer work**

In a dedicated Prism 1.16.1 Fabric instance:

1. Install the remapped exporter JAR and Fabric API `0.18.0+build.387-1.16.1`.
2. Disable every non-vanilla resource pack.
3. Start at the title screen and press the configured export key.
4. Confirm a second press does not start another run and progress remains responsive.
5. Confirm `latest.json`, `manifest.json`, and representative PNGs exist.
6. Enable a non-vanilla resource pack, press the key again, and confirm the prior pointer is unchanged.

- [ ] **Step 7: Commit the game integration**

```powershell
git add -- icon-exporter/src/main icon-exporter/src/test
git commit -m "feat: render item icons in Minecraft"
```

---

### Task 5: Build the strict Python manifest and PNG validator

**Files:**
- Modify: `pyproject.toml`
- Create: `generator/src/mcsr_data/icon_manifest.py`
- Create: `generator/tests/test_icon_manifest.py`
- Create: `generator/tests/fixtures/icon_export/manifest.json`
- Create: `generator/tests/fixtures/icon_export/icons/minecraft/stick.png`

- [ ] **Step 1: Add Pillow and the importer entry point**

Add `Pillow>=10,<13` to the project dependencies and:

```toml
[project.scripts]
mcsr-generate = "mcsr_data.generate:main"
mcsr-import-icons = "mcsr_data.icon_import:main"
```

- [ ] **Step 2: Write failing strict-manifest table tests**

```python
@pytest.mark.parametrize((mutation, message), [
    (lambda raw: raw.update(schema_version=2), "schema_version: expected 1"),
    (lambda raw: raw.update(minecraft_version="1.16.2"), "minecraft_version: expected 1.16.1"),
    (lambda raw: raw.update(resource_packs=["vanilla", "custom"]), "resource_packs: expected exactly vanilla"),
    (lambda raw: raw["icons"]["minecraft:stick"].update(path="../stick.png"), "path escapes export root"),
])
def test_rejects_invalid_export_manifest(valid_manifest, mutation, message, tmp_path):
    mutation(valid_manifest)
    write_manifest(tmp_path, valid_manifest)
    with pytest.raises(IconManifestError, match=message):
        load_export_manifest(tmp_path)
```

Add separate cases for duplicate paths, non-lowercase/malformed SHA-256, missing files, wrong hashes, bad PNG signatures, non-16x16 images, no alpha channel, and an item present in both successes and failures.

- [ ] **Step 3: Run tests and confirm the parser is missing**

Run: `.\.venv\Scripts\python.exe -m pytest generator/tests/test_icon_manifest.py -q`

Expected: import/collection failure because `icon_manifest.py` does not exist.

- [ ] **Step 4: Implement strict parsing and image validation**

Reject booleans where integers are required, unknown manifest fields, absolute/drive/UNC paths, empty or dot segments, backslashes, symlinks, duplicate normalized paths, and paths outside the export root. Verify raw PNG signature before Pillow, open with Pillow, require `format == "PNG"`, `size == (16, 16)`, and `mode == "RGBA"`, then hash the exact source bytes with SHA-256.

Collect all diagnostics in lexical path order and raise one `IconManifestError` so the user can correct all export problems in one pass.

- [ ] **Step 5: Rerun the validator suite**

Run: `.\.venv\Scripts\python.exe -m pytest generator/tests/test_icon_manifest.py -q`

Expected: all strict-manifest tests pass.

- [ ] **Step 6: Commit the validator**

```powershell
git add -- pyproject.toml generator/src/mcsr_data/icon_manifest.py generator/tests/test_icon_manifest.py generator/tests/fixtures/icon_export
git commit -m "feat: validate Minecraft icon exports"
```

---

### Task 6: Atomically import the exact website subset and generate a contact sheet

**Files:**
- Create: `generator/src/mcsr_data/icon_import.py`
- Create: `generator/src/mcsr_data/icon_contact_sheet.py`
- Create: `generator/tests/test_icon_import.py`
- Create: `generator/tests/test_icon_contact_sheet.py`

- [ ] **Step 1: Write failing required-union and atomic-publication tests**

```python
def test_required_ids_are_sorted_search_inventory_union(tmp_path):
    search = write_items(tmp_path / "search.json", ["minecraft:bed", "minecraft:stick"])
    inventory = write_items(tmp_path / "inventory.json", ["minecraft:bucket", "minecraft:stick"])
    assert required_item_ids(search, inventory) == (
        "minecraft:bed", "minecraft:bucket", "minecraft:stick",
    )

def test_failed_import_preserves_existing_output(valid_export, generated_data, tmp_path):
    output = tmp_path / "item-icons"
    write_existing_output(output, marker="accepted")
    corrupt_required_hash(valid_export, "minecraft:stick")
    with pytest.raises(IconImportError):
        import_icons(valid_export, *generated_data, output, tmp_path / "contact.png")
    assert (output / "marker.txt").read_text() == "accepted"
```

Add deterministic-byte, missing-required-ID, required-failure-record, unexpected-extra-ID, safe destination, and repeated-import cases.

- [ ] **Step 2: Write a failing representative contact-sheet test**

```python
def test_contact_sheet_has_stable_dimensions_and_labels(validated_required_icons, tmp_path):
    output = tmp_path / "contact.png"
    write_contact_sheet(validated_required_icons, output)
    with Image.open(output) as image:
        assert image.mode == "RGBA"
        assert image.size == (640, 240)
```

The representative ordered IDs are Stick, Oak Log, Oak Leaves, Leather Chestplate, White Bed, White Banner, Chest, Shield, White Shulker Box, Skeleton Skull, Conduit, and Trident. A missing representative is a hard error after the real 1.16.1 data is used.

- [ ] **Step 3: Run focused importer tests and observe missing modules**

Run: `.\.venv\Scripts\python.exe -m pytest generator/tests/test_icon_import.py generator/tests/test_icon_contact_sheet.py -q`

Expected: import/collection failure for the new modules.

- [ ] **Step 4: Implement deterministic subset publication**

Publish this exact browser manifest shape:

```json
{
  "schema_version": 1,
  "minecraft_version": "1.16.1",
  "icon_width": 16,
  "icon_height": 16,
  "icons": {
    "minecraft:stick": "minecraft/stick.png"
  }
}
```

Copy only required source bytes into a sibling staging directory, write sorted UTF-8 JSON with two-space indentation and one terminal newline, validate the staged tree again, then swap it into place with rollback restoration if any rename fails. Never merge into the current output in place.

- [ ] **Step 5: Implement the deterministic development contact sheet**

Use a bundled Pillow default font, nearest-neighbor scaling for icons, fixed cell sizes, and a transparent background. Write it to the explicit `--contact-sheet` path outside `web/public/item-icons/`; do not add it to the runtime manifest.

- [ ] **Step 6: Add and test the CLI**

```python
parser.add_argument("--export", type=Path, required=True)
parser.add_argument("--search-items", type=Path, required=True)
parser.add_argument("--inventory-items", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--contact-sheet", type=Path, required=True)
```

Run: `.\.venv\Scripts\python.exe -m pytest generator/tests/test_icon_manifest.py generator/tests/test_icon_import.py generator/tests/test_icon_contact_sheet.py -q`

Expected: all icon-import tests pass.

- [ ] **Step 7: Commit the importer**

```powershell
git add -- generator/src/mcsr_data/icon_import.py generator/src/mcsr_data/icon_contact_sheet.py generator/tests/test_icon_import.py generator/tests/test_icon_contact_sheet.py
git commit -m "feat: import validated website item icons"
```

---

### Task 7: Add the browser manifest parser and accessible icon component

**Files:**
- Create: `web/src/data/iconManifest.ts`
- Create: `web/src/data/iconManifest.test.ts`
- Create: `web/src/components/ItemIcon.tsx`
- Create: `web/src/components/ItemIcon.test.tsx`
- Modify: `web/src/index.css`

- [ ] **Step 1: Write failing browser-manifest tests**

```ts
it('parses safe schema-one paths and rejects missing generated IDs', () => {
  const manifest = parseIconManifest(validPayload)
  expect(manifest.icons.get('minecraft:stick')).toBe('minecraft/stick.png')
  expect(() => assertIconCoverage(manifest, generatedData)).toThrow(
    'missing icon for minecraft:bucket',
  )
})

it.each(['../stick.png', '/stick.png', 'C:/stick.png', 'minecraft\\stick.png'])(
  'rejects unsafe browser path %s',
  (path) => expect(() => parseIconManifest(payloadWithPath(path))).toThrow('unsafe icon path'),
)
```

- [ ] **Step 2: Write failing `ItemIcon` fallback and accessibility tests**

```tsx
it('keeps the English name when the image request fails', () => {
  render(<ItemIcon itemId="minecraft:stick" name="Stick" manifest={manifest} />)
  fireEvent.error(screen.getByRole('img', { name: 'Stick' }))
  expect(screen.getByRole('img', { name: 'Stick' })).toHaveClass('item-icon--fallback')
  expect(screen.getByText('Stick')).toBeInTheDocument()
})
```

- [ ] **Step 3: Run focused Vitest tests and observe missing modules**

Run: `pnpm --dir web test --run src/data/iconManifest.test.ts src/components/ItemIcon.test.tsx`

Expected: module resolution fails for the new files.

- [ ] **Step 4: Implement strict parsing, coverage, and runtime loading**

Expose:

```ts
export function parseIconManifest(payload: unknown): IconManifest
export function assertIconCoverage(manifest: IconManifest, data: GeneratedData): void
export async function loadIconManifest(baseUrl?: string): Promise<IconManifest>
```

Coverage is `new Set([...data.items.keys(), ...data.inventoryItems.keys()])`. Reject unknown top-level fields, wrong versions/dimensions, duplicate paths, backslashes, traversal, absolute URLs, data URLs, and missing `.png` suffixes. Resolve image URLs from `import.meta.env.BASE_URL + 'item-icons/'` only.

- [ ] **Step 5: Implement the shared icon component**

Render a nearest-neighbor `<img>` with `alt={name}`, `title={name}`, lazy loading outside critical rows, and a `role="img" aria-label={name}` labeled fallback tile after `onError`. Reset error state when `itemId` or URL changes. Do not hide the name from assistive technology.

- [ ] **Step 6: Rerun focused tests and typecheck**

Run:

```powershell
pnpm --dir web test --run src/data/iconManifest.test.ts src/components/ItemIcon.test.tsx
pnpm --dir web typecheck
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit the browser icon contract**

```powershell
git add -- web/src/data/iconManifest.ts web/src/data/iconManifest.test.ts web/src/components/ItemIcon.tsx web/src/components/ItemIcon.test.tsx web/src/index.css
git commit -m "feat: load accessible item icons"
```

---

### Task 8: Import the real 1.16.1 export and complete acceptance

**Dependency:** Complete Task 1 of
`docs/superpowers/plans/2026-08-31-three-column-workspace-redesign.md`
before this task. That task adds the approved preset-only `minecraft:oak_leaves`
and `minecraft:bucket` IDs and advances the selectable inventory catalog to
283 items. Tasks 1–7 of this plan can run first; the canonical import cannot.

**Files:**
- Create: `web/public/item-icons/manifest.json`
- Create: `web/public/item-icons/minecraft/*.png`
- Create: `docs/icon-exporter.md`
- Modify: `README.md`

- [ ] **Step 1: Run a fresh vanilla export from the supplied 1.16.1 Prism instance**

Build the JAR, install it with the pinned Fabric API, press the export key at the title screen, and identify the directory referenced by `mcsr-item-icons/latest.json`. Record the export ID and manifest SHA-256 in the acceptance notes, but do not copy the mod JAR or client JAR into the repository.

- [ ] **Step 2: Import against the generated website catalogs**

```powershell
.\.venv\Scripts\mcsr-import-icons.exe --export '<complete-export-directory>' --search-items web/public/data/search-items.json --inventory-items web/public/data/inventory-items.json --output web/public/item-icons --contact-sheet .superpowers/icon-contact-sheet.png
```

Expected: the command reports the exact required count, zero missing required IDs, and the contact-sheet path.

- [ ] **Step 3: Inspect the contact sheet against the running game**

Compare all twelve representatives at normal and enlarged nearest-neighbor scale. Specifically verify alpha edges, leaf tint, leather tint/layers, and the White Bed, White Banner, Chest, Shield, White Shulker Box, Skeleton Skull, Conduit, and Trident special-render paths. If any representative differs, stop and correct `GuiIconCapture`; do not accept approximate assets.

- [ ] **Step 4: Prove deterministic import and production exclusion**

Import the same export to a temporary second directory and compare hashes recursively. Then verify the production tree contains no `.jar` files:

```powershell
Get-FileHash web/public/item-icons/manifest.json -Algorithm SHA256
rg --files web/public | Select-String -Pattern '\.jar$'
pnpm --dir web build
rg --files web/dist | Select-String -Pattern '\.(jar|class)$'
```

Expected: repeat imports have identical files; both artifact searches return no matches; build succeeds.

- [ ] **Step 5: Document the exact user workflow and recovery behavior**

`docs/icon-exporter.md` must include Java 8, the pinned mod/API versions, Prism installation, disabling resource packs, the key binding, locating `latest.json`, the exact importer command, contact-sheet acceptance, immutable exports, manual old-export cleanup, and the fact that tooltip/language export is future work.

- [ ] **Step 6: Run all exporter/importer/browser gates**

```powershell
cd icon-exporter
.\gradlew.bat clean test build
cd ..
.\.venv\Scripts\python.exe -m pytest generator/tests -q
pnpm --dir web test --run
pnpm --dir web typecheck
pnpm --dir web build
```

Expected: every command exits 0.

- [ ] **Step 7: Commit the accepted canonical assets and documentation**

```powershell
git add -- web/public/item-icons docs/icon-exporter.md README.md
git commit -m "assets: add native Minecraft item icons"
```

---

## Final Verification Checklist

- [ ] `icon-exporter/gradlew.bat clean test build` passes under Java 8.
- [ ] The mod metadata is client-only and targets exactly Minecraft 1.16.1.
- [ ] A full vanilla export attempts every sorted non-air registry item and remains responsive.
- [ ] Re-entry and non-vanilla resource packs are blocked without changing the prior pointer.
- [ ] Interrupted/failed runs preserve every prior immutable export and `latest.json`.
- [ ] Every required source PNG is valid 16x16 RGBA, hash-matching, and safely contained.
- [ ] The imported manifest covers every generated search and inventory ID exactly once.
- [ ] Repeat import produces identical bytes.
- [ ] The representative contact sheet matches the same running client.
- [ ] Browser image failure shows a keyboard/screen-reader-accessible English fallback.
- [ ] The production website contains no exporter mod, `.class`, or Minecraft client JAR.
- [ ] Full Python, Vitest, TypeScript, and Vite build gates pass.
