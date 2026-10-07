#!/usr/bin/env python3
"""Pack a boss' loose PNG frames into deterministic, trimmed atlas pages.

The atlas metadata preserves each source image's full size and trim offset.
Runtime rendering can therefore keep the same anchor coordinates as loose frames.
This tool only writes assets/atlas/*; it never edits asset-manifest.json.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = PROJECT_ROOT / "assets" / "asset-manifest.json"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "assets" / "atlas"


@dataclass
class FrameSource:
    key: str
    path: str
    source_width: int
    source_height: int
    trim_x: int
    trim_y: int
    image: Image.Image

    @property
    def width(self) -> int:
        return self.image.width

    @property
    def height(self) -> int:
        return self.image.height


@dataclass
class Placement:
    source: FrameSource
    page: int
    x: int
    y: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pack Solovs sprite atlas")
    parser.add_argument("--boss", default="boss_1")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--max-size", type=int, default=4096)
    parser.add_argument("--padding", type=int, default=2)
    parser.add_argument("--check", action="store_true", help="Validate and pack in memory without writing")
    return parser.parse_args()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def collect_manifest_frames(manifest: dict[str, Any], boss_id: str) -> list[tuple[str, str]]:
    boss = manifest.get("bosses", {}).get(boss_id)
    if not boss:
        raise ValueError(f"Unknown boss in manifest: {boss_id}")
    frames: dict[str, str] = {}
    for animation_id, animation in boss.get("animations", {}).items():
        for frame in animation.get("frames", []):
            if frame.get("path"):
                frames[frame["assetId"]] = frame["path"]
        for direction_frames in animation.get("framesByDirection", {}).values():
            for frame in direction_frames:
                if frame.get("path"):
                    frames[frame["assetId"]] = frame["path"]
    return sorted(frames.items())


def load_and_trim(key: str, relative_path: str) -> FrameSource:
    source_path = PROJECT_ROOT / relative_path
    if not source_path.exists():
        raise FileNotFoundError(f"{key}: missing source image {source_path}")
    image = Image.open(source_path).convert("RGBA")
    alpha_bounds = image.getchannel("A").getbbox()
    if not alpha_bounds:
        alpha_bounds = (0, 0, 1, 1)
    left, top, right, bottom = alpha_bounds
    cropped = image.crop(alpha_bounds)
    return FrameSource(
        key=key,
        path=relative_path,
        source_width=image.width,
        source_height=image.height,
        trim_x=left,
        trim_y=top,
        image=cropped,
    )


def pack_frames(
    sources: list[FrameSource],
    max_size: int,
    padding: int,
) -> tuple[list[Placement], list[tuple[int, int]]]:
    if max_size <= padding * 2:
        raise ValueError("max-size must be larger than twice the padding")
    sorted_sources = sorted(sources, key=lambda item: (-item.height, -item.width, item.key))
    placements: list[Placement] = []
    page_sizes: list[tuple[int, int]] = []

    page = 0
    x = 0
    y = 0
    row_height = 0
    used_width = 0
    used_height = 0

    def finish_page() -> None:
        nonlocal used_width, used_height
        if used_width > 0 and used_height > 0:
            page_sizes.append((used_width, used_height))

    for source in sorted_sources:
        packed_width = source.width + padding * 2
        packed_height = source.height + padding * 2
        if packed_width > max_size or packed_height > max_size:
            raise ValueError(
                f"{source.key}: trimmed frame {source.width}x{source.height} "
                f"does not fit atlas max-size {max_size}"
            )

        if x + packed_width > max_size:
            x = 0
            y += row_height
            row_height = 0

        if y + packed_height > max_size:
            finish_page()
            page += 1
            x = 0
            y = 0
            row_height = 0
            used_width = 0
            used_height = 0

        placements.append(
            Placement(
                source=source,
                page=page,
                x=x + padding,
                y=y + padding,
            )
        )
        x += packed_width
        row_height = max(row_height, packed_height)
        used_width = max(used_width, x)
        used_height = max(used_height, y + row_height)

    finish_page()
    return placements, page_sizes


def paste_extruded(
    atlas: Image.Image,
    source: Image.Image,
    x: int,
    y: int,
    padding: int,
) -> None:
    atlas.paste(source, (x, y), source)
    if padding <= 0:
        return

    width, height = source.size
    left = source.crop((0, 0, 1, height)).resize((padding, height), Image.Resampling.NEAREST)
    right = source.crop((width - 1, 0, width, height)).resize((padding, height), Image.Resampling.NEAREST)
    top = source.crop((0, 0, width, 1)).resize((width, padding), Image.Resampling.NEAREST)
    bottom = source.crop((0, height - 1, width, height)).resize((width, padding), Image.Resampling.NEAREST)
    atlas.paste(left, (x - padding, y), left)
    atlas.paste(right, (x + width, y), right)
    atlas.paste(top, (x, y - padding), top)
    atlas.paste(bottom, (x, y + height), bottom)

    corners = {
        (x - padding, y - padding): source.crop((0, 0, 1, 1)),
        (x + width, y - padding): source.crop((width - 1, 0, width, 1)),
        (x - padding, y + height): source.crop((0, height - 1, 1, height)),
        (x + width, y + height): source.crop((width - 1, height - 1, width, height)),
    }
    for position, corner in corners.items():
        expanded = corner.resize((padding, padding), Image.Resampling.NEAREST)
        atlas.paste(expanded, position, expanded)


def write_atlas(
    boss_id: str,
    placements: list[Placement],
    page_sizes: list[tuple[int, int]],
    output_dir: Path,
    padding: int,
    manifest_hash: str,
    check_only: bool,
) -> dict[str, Any]:
    pages = [
        Image.new("RGBA", page_size, (0, 0, 0, 0))
        for page_size in page_sizes
    ]
    frame_metadata: dict[str, Any] = {}

    for placement in placements:
        source = placement.source
        paste_extruded(
            pages[placement.page],
            source.image,
            placement.x,
            placement.y,
            padding,
        )
        frame_metadata[source.key] = {
            "page": placement.page,
            "frame": {
                "x": placement.x,
                "y": placement.y,
                "width": source.width,
                "height": source.height,
            },
            "sourceSize": {
                "width": source.source_width,
                "height": source.source_height,
            },
            "spriteSourceSize": {
                "x": source.trim_x,
                "y": source.trim_y,
                "width": source.width,
                "height": source.height,
            },
            "rotated": False,
            "sourcePath": source.path,
        }

    page_entries = [
        {
            "index": index,
            "image": f"assets/atlas/{boss_id}_{index}.png",
            "width": image.width,
            "height": image.height,
        }
        for index, image in enumerate(pages)
    ]
    metadata = {
        "_meta": {
            "schemaVersion": 1,
            "generator": "tools/pack_atlas.py",
            "bossId": boss_id,
            "manifestSha256": manifest_hash,
            "padding": padding,
            "trimmed": True,
            "extruded": padding > 0,
        },
        "pages": page_entries,
        "frames": dict(sorted(frame_metadata.items())),
    }

    if not check_only:
        output_dir.mkdir(parents=True, exist_ok=True)
        for index, image in enumerate(pages):
            image.save(output_dir / f"{boss_id}_{index}.png", format="PNG", optimize=True)
        metadata_path = output_dir / f"{boss_id}.json"
        metadata_path.write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    return metadata


def main() -> int:
    args = parse_args()
    manifest_path = args.manifest.resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    source_records = collect_manifest_frames(manifest, args.boss)
    sources = [load_and_trim(key, path) for key, path in source_records]
    placements, page_sizes = pack_frames(sources, args.max_size, args.padding)
    metadata = write_atlas(
        args.boss,
        placements,
        page_sizes,
        args.output_dir.resolve(),
        args.padding,
        file_sha256(manifest_path),
        args.check,
    )
    pixel_count = sum(page["width"] * page["height"] for page in metadata["pages"])
    print(
        f"OK: {len(sources)} frame(s), {len(page_sizes)} page(s), "
        f"{pixel_count / (1024 * 1024):.1f} MP atlas area"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
