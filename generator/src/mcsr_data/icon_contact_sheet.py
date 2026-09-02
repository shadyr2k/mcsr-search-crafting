from __future__ import annotations

import os
import tempfile
import textwrap
from pathlib import Path
from typing import Mapping

from PIL import Image, ImageDraw, ImageFont, UnidentifiedImageError


REPRESENTATIVE_ICONS = (
    ("minecraft:stick", "Stick"),
    ("minecraft:oak_log", "Oak Log"),
    ("minecraft:oak_leaves", "Oak Leaves"),
    ("minecraft:leather_chestplate", "Leather Chestplate"),
    ("minecraft:white_bed", "White Bed"),
    ("minecraft:white_banner", "White Banner"),
    ("minecraft:chest", "Chest"),
    ("minecraft:shield", "Shield"),
    ("minecraft:white_shulker_box", "White Shulker Box"),
    ("minecraft:skeleton_skull", "Skeleton Skull"),
    ("minecraft:conduit", "Conduit"),
    ("minecraft:trident", "Trident"),
)

SHEET_SIZE = (640, 240)
CELL_SIZE = (160, 80)
DISPLAY_ICON_SIZE = (48, 48)


class IconContactSheetError(ValueError):
    """Raised when a representative icon sheet cannot be generated safely."""


def write_contact_sheet(icons: Mapping[str, Path], output_path: Path) -> None:
    output = Path(output_path)
    missing = [item_id for item_id, _label in REPRESENTATIVE_ICONS if item_id not in icons]
    if missing:
        raise IconContactSheetError(
            "\n".join(f"missing representative icon: {item_id}" for item_id in missing)
        )

    sheet = Image.new("RGBA", SHEET_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    try:
        for index, (item_id, label) in enumerate(REPRESENTATIVE_ICONS):
            icon = _load_icon(item_id, Path(icons[item_id]))
            try:
                column = index % 4
                row = index // 4
                cell_x = column * CELL_SIZE[0]
                cell_y = row * CELL_SIZE[1]
                enlarged = icon.resize(DISPLAY_ICON_SIZE, Image.Resampling.NEAREST)
                try:
                    sheet.alpha_composite(enlarged, (cell_x + 8, cell_y + 16))
                finally:
                    enlarged.close()
                for line_index, line in enumerate(textwrap.wrap(label, width=14)):
                    draw.text(
                        (cell_x + 64, cell_y + 28 + line_index * 12),
                        line,
                        fill=(255, 255, 255, 255),
                        font=font,
                    )
            finally:
                icon.close()
    except Exception:
        sheet.close()
        raise

    temporary_path: Path | None = None
    try:
        output.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(
            dir=output.parent, prefix=f".{output.name}.", suffix=".tmp"
        )
        os.close(descriptor)
        temporary_path = Path(temporary_name)
        sheet.save(temporary_path, format="PNG", compress_level=9)
        os.replace(temporary_path, output)
        temporary_path = None
    except (OSError, ValueError) as error:
        raise IconContactSheetError(f"could not write contact sheet: {error}") from error
    finally:
        sheet.close()
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def _load_icon(item_id: str, path: Path) -> Image.Image:
    try:
        with Image.open(path) as image:
            image.load()
            if image.format != "PNG" or image.mode != "RGBA" or image.size != (16, 16):
                raise IconContactSheetError(
                    f"representative icon is not a native 16x16 RGBA PNG: {item_id}"
                )
            return image.copy()
    except IconContactSheetError:
        raise
    except (OSError, ValueError, UnidentifiedImageError) as error:
        raise IconContactSheetError(
            f"could not read representative icon {item_id}: {error}"
        ) from error
