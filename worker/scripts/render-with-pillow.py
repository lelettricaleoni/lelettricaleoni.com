# worker/scripts/render-with-pillow.py
"""
Renders every photo in a folder with the Python worker's own imaging.render_master(), for comparison with the Node worker.

    python worker/scripts/render-with-pillow.py <old worker folder> <photos folder> <output folder>
"""
import pathlib
import sys

old, photos, out = (pathlib.Path(arg) for arg in sys.argv[1:4])
sys.path.insert(0, str(old))
import imaging  # noqa: E402  (needs Pillow and pillow-heif)

for source in sorted(photos.iterdir()):
    if source.suffix.lower().lstrip(".") not in imaging.ALLOWED_EXTENSIONS:
        continue
    target = out / source.stem
    target.mkdir(parents=True, exist_ok=True)
    renditions = {width: str(target / f"w{width}.avif") for width in imaging.RENDITION_WIDTHS}
    size = imaging.render_master(str(source), str(target / "master.avif"), str(target / "share.jpg"), renditions)
    print(source.name, size)
