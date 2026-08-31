# Minecraft 1.16.1 Item-Icon Exporter Design

## Purpose

Build a small Fabric 1.16.1 client mod that exports Minecraft's own native GUI
render for every registered item. A repository-side importer will select and
validate the exact icons required by MCSR Search Crafting and publish them as
static website assets.

This is an independent prerequisite for the
[three-column workspace redesign](2026-08-31-three-column-workspace-redesign.md).
It is intentionally separated because game rendering, Gradle/Fabric setup,
and in-game verification form a distinct subsystem from the React
application.

## Why the running client is the renderer

The supplied Minecraft client JAR contains raw textures and model definitions,
but it does not contain every final inventory icon as a PNG. Inspection of the
1.16.1 item models found built-in entity parents for chests, conduits, shields,
banners, beds, shulker boxes, skulls, and trident states. Their final GUI pixels
depend on Minecraft's baked-model, tint, lighting, and special renderer paths.

The exporter therefore calls the game's own `ItemRenderer` rather than
reimplementing those paths. This gives the site the same item appearance as
the source game instance and creates a foundation for a later tooltip/language
exporter without adding that future work to this scope.

## Scope

The exporter includes:

- Minecraft Java Edition 1.16.1 only.
- A Fabric client-only mod launched through the user's Prism instance.
- Enumeration of every registered non-air item ID.
- A default `ItemStack` for each ID.
- Minecraft's native 16x16 GUI item render with transparency.
- One PNG per item and a machine-readable manifest.
- Visible progress, completion, and failure feedback in the client.
- A repository-side importer that selects required IDs and publishes static
  website assets.

The exporter excludes:

- Searchable tooltip or language export in this implementation.
- Server installation or networking.
- Custom resource-pack support.
- Item variants that require arbitrary NBT, durability, enchantments, map
  contents, player profiles, or potion contents. The default stack is the
  canonical icon for each exact item ID.
- Runtime rendering in the website.
- Automatic launching or controlling of the user's Prism instance.

## User workflow

1. Build the exporter mod JAR.
2. Place it and the matching Fabric API in a Minecraft 1.16.1 Fabric instance
   in Prism Launcher.
3. Disable non-vanilla resource packs and launch the instance.
4. At the title screen, press the exporter's configurable key binding.
5. Wait for the completion notification.
6. Use the completion message or `mcsr-item-icons/latest.json` to locate the
   newly created immutable export directory inside the instance's Minecraft
   directory.
7. Run the repository importer with that directory as input.
8. Inspect the representative icon contact sheet and commit the validated
   browser assets.

The exporter never modifies worlds, options, resource packs, or account data.
Running it again writes a new immutable export and atomically updates only the
small `latest.json` pointer after every item has been processed. It never
deletes an earlier export automatically.

## Fabric mod architecture

The new `icon-exporter/` project is a minimal Fabric client mod pinned to
Minecraft 1.16.1, a compatible Yarn mapping, Fabric Loader, Fabric API, Java 8,
and Fabric Loom versions.

It contains four focused units:

- **Entrypoint and key binding** registers one client key and schedules export
  only on Minecraft's render thread.
- **Export coordinator** checks preconditions, creates a staging directory,
  enumerates sorted registry IDs, advances one bounded batch per client tick,
  and publishes success or failure.
- **GUI icon capture** renders one default stack through Minecraft's
  `ItemRenderer` into a transparent 16x16 offscreen framebuffer, reads the
  framebuffer into `NativeImage`, flips it to PNG orientation, and restores the
  prior framebuffer and viewport in a `finally` block.
- **Manifest writer** records provenance, sorted successes, hashes, and exact
  failures using the Gson already available in the client.

The mod is declared client-only. It must not register common/server entrypoints
or require installation on a server.

## Trigger and preconditions

The exporter uses a configurable key binding in an `MCSR Search Crafting`
category. It runs only when:

- Minecraft reports version 1.16.1.
- The client is at a stable screen and is not already exporting.
- Resource reload has completed.
- No non-vanilla user resource pack is enabled.
- The output parent is writable.

If a precondition fails, the client displays a concise message and no existing
complete export is changed. The key may be pressed again after correction.

## Render and capture contract

For every sorted non-air item registry ID:

1. Create a count-one default `ItemStack`.
2. Bind a transparent 16x16 framebuffer with depth enabled.
3. Clear color and depth to transparent black.
4. Configure the same orthographic GUI render state expected by
   `ItemRenderer.renderGuiItemIcon`.
5. Render the stack at the framebuffer origin without count, durability, or
   text overlays.
6. Flush render buffers.
7. Read the framebuffer color attachment into an ABGR `NativeImage` while
   preserving alpha.
8. Mirror vertically once to convert OpenGL origin to PNG origin.
9. Write `icons/<namespace>/<path>.png` in the staging export.
10. Calculate and record the PNG's SHA-256.
11. Restore the previous framebuffer, viewport, matrices, lighting, blend,
    depth, and texture bindings even if rendering or writing fails.

The exporter processes a bounded number of items per tick so the title screen
can repaint and show progress. A per-item exception becomes a manifest failure
record and does not prevent remaining items from being attempted. A complete
export is still considered invalid if any item required by the website failed.

## Export manifest

`manifest.json` uses schema version 1:

```json
{
  "schema_version": 1,
  "minecraft_version": "1.16.1",
  "exporter_version": "1.0.0",
  "icon_width": 16,
  "icon_height": 16,
  "resource_packs": ["vanilla"],
  "icons": {
    "minecraft:stick": {
      "path": "icons/minecraft/stick.png",
      "sha256": "lowercase-hex"
    }
  },
  "failures": []
}
```

Keys are sorted lexically. Paths are relative, forward-slash paths contained
inside the export directory. Duplicate IDs, duplicate paths, traversal paths,
missing hashes, wrong dimensions, and unsupported schema or Minecraft versions
are invalid.

The manifest records the enabled resource-pack IDs. The repository importer
accepts only the vanilla resource set for the canonical website assets.

## Atomic export behavior

The mod writes to
`mcsr-item-icons/staging/<UTC timestamp>-<unique suffix>/`. After the last icon
and manifest are safely written, it renames that directory once to
`mcsr-item-icons/exports/<UTC timestamp>-<unique suffix>/`. It then writes
`latest.json.tmp` and atomically replaces the small
`mcsr-item-icons/latest.json` pointer file. The pointer contains the safe
relative export-directory path and manifest SHA-256.

If export fails or the game closes, the prior pointer and every prior immutable
export remain unchanged. The incomplete staging directory contains diagnostics
for inspection. The exporter never deletes exports automatically and never
recursively moves a path outside the resolved `mcsr-item-icons` parent. Every
source, destination, and pointer path is normalized and checked before file
operations. Old exports can be removed manually after a newer export has been
imported successfully.

## Repository importer

The Python package gains a separate `mcsr-import-icons` command. It accepts:

- `--export`: the complete game-export directory.
- `--search-items`: generated `search-items.json`.
- `--inventory-items`: generated `inventory-items.json`.
- `--output`: the website icon directory.

Required IDs are the sorted union of all search-item IDs and selectable
inventory-item IDs. The inventory artifact already includes the two
preset-only IDs specified by the workspace design.

The importer validates manifest structure, version, resource-pack provenance,
safe paths, file existence, SHA-256, PNG signature, 16x16 dimensions, and an
alpha channel. It fails if any required ID is missing or listed as a failure.
Unexpected non-required exported IDs are allowed but are not copied.

Successful import atomically publishes:

```text
web/public/item-icons/
├── manifest.json
└── minecraft/
    ├── acacia_boat.png
    ├── ...
    └── yellow_wool.png
```

The browser manifest contains only schema version, Minecraft version, icon
dimensions, and sorted `item ID -> relative PNG path` entries. Importing the
same source twice produces identical bytes.

## Visual acceptance artifact

The importer also writes a development-only contact sheet outside the runtime
manifest. It arranges labeled representative icons for:

- Flat generated item: Stick.
- Block item: Oak Log.
- Tinted block item: Oak Leaves.
- Layered/tinted item: Leather Chestplate or a representative supported item.
- Built-in entity items: White Bed, White Banner, Chest, Shield, White Shulker
  Box, Skeleton Skull, Conduit, and Trident.

The contact sheet is inspected against the same running client before the
canonical website assets are accepted. The application does not ship it.

## Error handling

- A trigger/precondition failure leaves the last complete export untouched.
- Per-item render failures record the exact item ID, exception class, and
  concise message while export continues.
- Framebuffer and render state are restored in all paths.
- Manifest publication happens only after the icon loop finishes.
- The importer rejects rather than copies an untrusted or malformed path.
- Import validation failure leaves existing website icons untouched and prints
  every diagnostic.
- The website retains a labeled runtime fallback for an individual image-load
  failure, but missing canonical assets fail pre-deployment verification.

## Testing

### JVM tests

- Manifest serialization is sorted and stable.
- Registry/path conversion rejects traversal and preserves namespaces.
- Atomic staging/publication keeps the prior `latest.json` pointer and
  immutable exports after a simulated failure.
- Failure records preserve the exact item ID and concise cause.
- Export state rejects re-entry and invalid preconditions.

Rendering itself requires the client and is not represented by a misleading
mock-render unit test.

### In-game acceptance

- The mod loads only on a 1.16.1 Fabric client.
- The key binding starts exactly one export and shows progress.
- Re-triggering during export does not start another run.
- Vanilla-resource validation blocks a non-vanilla resource pack.
- All registered non-air items are attempted.
- Representative flat, block, tinted, and built-in-entity PNGs match their
  visible inventory icons.
- PNGs are transparent 16x16 images without stack counts or durability bars.
- Closing or forcing failure during a run preserves the prior latest pointer
  and every prior complete export.

### Python importer tests

- Valid fixture manifests and PNGs import to deterministic paths and bytes.
- The required set is the exact search/inventory union.
- Missing required IDs and required failure records reject publication.
- Wrong schema, Minecraft version, resource packs, dimensions, hashes, alpha,
  PNG signatures, duplicate paths, and traversal paths each produce exact
  diagnostics.
- Unexpected non-required icons are ignored.
- Failed import preserves the prior valid website directory.

### Browser contract tests

- The browser icon-manifest parser rejects missing or malformed entries.
- Every generated search and selectable inventory ID has a manifest entry.
- A failed image request displays the accessible labeled fallback.
- The production build contains required PNGs but no exporter mod or client
  JAR.

## Considered alternatives

### Parse and render the client JAR without Minecraft

Rejected because built-in entity items require behavior beyond textures and
model JSON. Reproducing Minecraft's baked model, tint, lighting, and special
item renderers would be a large accuracy risk.

### Use community-provided pre-rendered icons

Rejected for the canonical asset set because provenance and exact agreement
with the user's 1.16.1 client would be harder to establish.

### Render items in the website

Rejected because it would add substantial JavaScript/runtime weight and still
need to reproduce special Minecraft render paths.

### Capture screenshots manually

Rejected because manual cropping would be slow, incomplete, and difficult to
validate or regenerate.
