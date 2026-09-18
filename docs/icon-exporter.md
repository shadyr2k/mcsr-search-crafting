# Minecraft 1.16.1 item-icon export

The website ships native 16×16 Minecraft GUI item icons under
`web/public/item-icons/`. They are produced locally from an unmodified Minecraft
Java Edition 1.16.1 client; neither the exporter mod nor a Minecraft client JAR
belongs in the production website.

## Prism setup and export

1. Create or use a Prism Launcher instance for exactly Minecraft Java Edition
   1.16.1, configured to use Java 8.
2. Install Fabric Loader `0.9.3+build.207` and Fabric API
   `0.18.0+build.387-1.16.1` in that instance.
3. Build the exporter from this repository with
   `cd icon-exporter; .\gradlew.bat clean test build`. Copy
   `icon-exporter/build/libs/mcsr-item-icons-1.0.0.jar` into the instance's
   `mods/` directory.
4. Disable every non-vanilla resource pack. Minecraft's built-in `vanilla`
   entry is allowed. Wait for resource loading to finish, then join a loaded
   world.
5. Press **F8**. The client displays start/progress/completion toasts while it
   renders one icon per client tick. Do not press F8 again until it completes.

The exporter writes immutable runs below
`minecraft/mcsr-item-icons/exports/<export-id>/`, without overwriting a prior
successful export. `minecraft/mcsr-item-icons/latest.json` points to the most
recent complete run. Failed or interrupted work does not replace that pointer.
Delete old immutable exports manually when they are no longer needed.

If F8 does not start an export, verify that the client is exactly 1.16.1, a
world and player are loaded, resource reloading has completed, packs are
vanilla-only, and the `mcsr-item-icons` output location is writable.

## Import and accept the assets

Generate the website catalogs first, then import the directory named by
`latest.json`:

```powershell
.\.venv\Scripts\mcsr-generate.exe --source minecraft-data --output web/public/data
.\.venv\Scripts\mcsr-import-icons.exe --export '<complete-export-directory>' --search-items web/public/data/search-items.json --inventory-items web/public/data/inventory-items.json --output web/public/item-icons --contact-sheet .superpowers/icon-contact-sheet.png
```

When an older virtual environment does not yet expose the console entry point,
run the equivalent local command:

```powershell
.\.venv\Scripts\python.exe -m mcsr_data.icon_import --export '<complete-export-directory>' --search-items web/public/data/search-items.json --inventory-items web/public/data/inventory-items.json --output web/public/item-icons --contact-sheet .superpowers/icon-contact-sheet.png
```

The importer rejects incomplete, malformed, mismatched, or unsafe exports. It
publishes only the exact union of the generated search and inventory catalogs,
with a manifest and source-hash verification. Inspect the contact sheet against
the same running client at normal and nearest-neighbor enlarged scale, including
alpha edges, leaf and leather tint, and the White Bed, White Banner, Chest,
Shield, White Shulker Box, Skeleton Skull, Conduit, and Trident render paths.
Repeat the import to a temporary directory and compare hashes before accepting
an export.

Accepted source export: `20260901T050802Z-bfe923bf`.
Its `manifest.json` SHA-256 is
`44BD70064A7638AB92681383ED1DD4B8DCC8E3D9CDC7025BE160CEDF9BE6991A`.

This exporter currently covers item PNGs only. Live tooltip and language export
remain future work.

## 26.1.2 archive import

The 26.1.2 package uses a supplied flat archive of item PNGs rather than the
1.16.1 exporter. `mcsr-import-raw-icons` selects only the exact generated
search/inventory union, checks every image is RGBA, and preserves the archive's
128×128 pixel-art exports. Extra 26.2 icons are ignored. The importer fails if
a required 26.1.2 item has no matching filename.
