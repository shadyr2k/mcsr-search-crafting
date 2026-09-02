from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from mcsr_data.icon_contact_sheet import (
    REPRESENTATIVE_ICONS,
    IconContactSheetError,
    write_contact_sheet,
)


def representative_icons(tmp_path: Path) -> dict[str, Path]:
    icons: dict[str, Path] = {}
    for index, (item_id, _label) in enumerate(REPRESENTATIVE_ICONS):
        path = tmp_path / f"{index}.png"
        Image.new("RGBA", (16, 16), (index * 10, 20, 30, 128)).save(path, "PNG")
        icons[item_id] = path
    return icons


def test_contact_sheet_has_stable_dimensions_mode_and_bytes(tmp_path: Path) -> None:
    icons = representative_icons(tmp_path)
    first = tmp_path / "first.png"
    second = tmp_path / "second.png"

    write_contact_sheet(icons, first)
    write_contact_sheet(dict(reversed(tuple(icons.items()))), second)

    with Image.open(first) as image:
        assert image.mode == "RGBA"
        assert image.size == (640, 240)
    assert first.read_bytes() == second.read_bytes()


def test_contact_sheet_requires_every_representative(tmp_path: Path) -> None:
    icons = representative_icons(tmp_path)
    icons.pop("minecraft:trident")

    with pytest.raises(
        IconContactSheetError, match="missing representative icon: minecraft:trident"
    ):
        write_contact_sheet(icons, tmp_path / "contact.png")


def test_contact_sheet_rejects_non_native_icon(tmp_path: Path) -> None:
    icons = representative_icons(tmp_path)
    Image.new("RGB", (16, 16)).save(icons["minecraft:stick"], "PNG")

    with pytest.raises(IconContactSheetError, match="minecraft:stick"):
        write_contact_sheet(icons, tmp_path / "contact.png")
