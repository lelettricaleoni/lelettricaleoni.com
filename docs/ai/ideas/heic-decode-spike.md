# Spike: decoding HEIC for the Node worker

> Question: `sharp`'s prebuilt binaries do not decode HEVC (patents). Can `libheif-js` (WebAssembly, no native
> build) read an iPhone photo fast enough, with little enough memory, to run inside the worker?

Acceptance criterion, fixed before looking at the numbers: on the 12 MP file, `decodeMs` ≤ 20000 and `rssMb` ≤ 1536.

| File | Size | decodeMs | encodeMs | rssMb | Output |
|---|---|---|---|---|---|
| `worker/fixtures/sample.heic` | 640×480 | 217 | 44 | 62 | 640×480, 4605 bytes |
| generated 12 MP (`--large`) | 4032×3024 | 3205 | 834 | 287 | 2400×1800, 130645 bytes |

Measured on the developer's Windows PC with Node 22 and `libheif-js` from npm; the VM (ARM64, 2 CPU) is slower, but
the margin is a factor of six on time and five on memory.

Signature used by the script: `new HeifDecoder().decode(buffer)` returns the images; `image.display({data, width,
height}, callback)` fills an RGBA buffer and calls back with the buffer or a falsy value.

**Orientation of a real iPhone portrait: not yet checked.** It needs a real file (they carry GPS coordinates, so it
stays in `temp/`, never in git). Until then the decision holds on speed and memory only.

**Decision: path A (`libheif-js`)**, provisional on the orientation check.
