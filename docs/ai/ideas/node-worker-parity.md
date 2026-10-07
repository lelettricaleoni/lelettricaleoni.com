# Node against Pillow, photo by photo

Thresholds fixed beforehand: same size; master weight between 0.85 and 1.15 times Pillow's; SSIM ≥ 0.985.

| Photo | Node | Pillow | Weight ratio | SSIM |
|---|---|---|---|---|
| photo1.jpg | 650×570 | 650×570 | 1.02 | 0.9985 |
| photo2.jpg | 2048×1536 | 2048×1536 | 1.01 | 0.9996 |
| photo3.webp | 2400×1455 | 2400×1455 | 0.92 | 0.9983 |
| photo4.jpg | 1020×680 | 1020×680 | 1.09 | 0.9986 |
| photo5.webp | 1920×1440 | 1920×1440 | 1.02 | 0.9990 |
| photo6.jpg | 2048×1536 | 2048×1536 | 1.01 | 0.9997 |
| photo7.jpg | 2400×1351 | 2400×1351 | 1.01 | 0.9955 |
| photo8.jpg | 729×420 | 729×420 | 1.03 | 0.9995 |
| sample.heic | 640×480 | 640×480 | 1.15 | 0.9982 |
| transparent.png | 2048×1536 | 2048×1536 | 1.01 | 0.9996 |

All within the thresholds.

## Notes (written by hand: running the test again rewrites everything above this line)

- **Sources.** The dev database holds a single photo and no original from before the worker, so the eight photos are
  production originals from before the worker (JPEG and WebP, public at their keys, 650 px to 4000 px), plus the HEIC
  fixture and one photo with an alpha gradient. They are not in git (`temp/`). Python and Node got the same files.
- **A defect found by this measurement.** libheif always returns RGBA, so the Node master of a HEIC photo carried an
  opaque alpha plane that Pillow's did not: weight ratio 1.23 on `sample.heic`. `worker/imaging.ts` now drops the alpha
  when every pixel is opaque (test in `worker/heic.test.ts`, red then green); the ratio is 1.15.
- **A fixture replaced, thresholds untouched.** The first transparent PNG was a flat red rectangle (641 bytes with Pillow,
  841 with Node: 200 bytes of container headers, not a quality difference). It was replaced by a real photo with an alpha
  gradient, which measures the encoder and not the header.
- **Not covered yet.** A real iPhone portrait HEIC (orientation, colour profile): needs a file from Kevin, kept in `temp/`.
  `sample.heic` is synthetic.
