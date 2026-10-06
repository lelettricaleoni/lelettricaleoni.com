# worker/scripts/make-heic-fixture.py
"""
Writes worker/fixtures/sample.heic (640x480, committed) and, with `--large <path>`, a 12 MP file for timing.

The image is a gradient with a checkerboard and noise, not a flat colour, so that compressing it and comparing the
result means something.
"""
import pathlib
import sys

import numpy as np
import pillow_heif
from PIL import Image

pillow_heif.register_heif_opener()


def photo_like(width: int, height: int, seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:height, 0:width]
    red = (255 * x / width).astype(np.uint8)
    green = (255 * y / height).astype(np.uint8)
    board = ((x // 64 + y // 64) % 2 * 160 + 40).astype(np.uint8)
    noise = rng.integers(0, 24, size=(height, width), dtype=np.uint8)
    blue = np.clip(board.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([red, green, blue]), "RGB")


fixtures = pathlib.Path(__file__).resolve().parent.parent / "fixtures"
fixtures.mkdir(exist_ok=True)
photo_like(640, 480, seed=1).save(fixtures / "sample.heic", quality=60)

if "--large" in sys.argv:
    target = pathlib.Path(sys.argv[sys.argv.index("--large") + 1])
    photo_like(4032, 3024, seed=2).save(target, quality=75)
    print("large file written to", target)

print("sample written to", fixtures / "sample.heic")
