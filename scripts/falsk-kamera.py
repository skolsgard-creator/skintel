#!/usr/bin/env python3
"""Falsk kamera för scripts/prov-ny-kontroll.mjs.

Gör tre korta videofiler (Y4M, okomprimerade) av en hudliknande yta med en
mörk fläck i mitten: skarp, suddig och mörk. Chromium spelar upp dem som
kamera med --use-file-for-fake-video-capture, så att sökarens mätning
(skärpa, ljus) går att prova utan telefon.

    python3 scripts/falsk-kamera.py prov/

Kräver numpy, scipy och Pillow. Filerna är ~14 MB var och ska inte checkas
in (prov/ är gitignorerad).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

W, H = 640, 480


def hud() -> np.ndarray:
    rng = np.random.default_rng(3)
    base = np.zeros((H, W, 3), dtype=np.float32)
    base[..., 0], base[..., 1], base[..., 2] = 205, 160, 140
    base += rng.normal(0, 9, (H, W, 1)).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    base[..., 0] += 6 * np.sin(xx / 13.0) * np.cos(yy / 17.0)
    cx, cy = W / 2, H / 2
    r = np.sqrt(((xx - cx) / 26.0) ** 2 + ((yy - cy) / 20.0) ** 2)
    edge = 1 + 0.12 * np.sin(np.arctan2(yy - cy, xx - cx) * 5)
    mask = np.clip((edge - r) * 6, 0, 1)[..., None]
    spot = np.array([92, 58, 44], dtype=np.float32)
    return np.clip(base * (1 - mask) + spot * mask, 0, 255)


def skriv_y4m(rgb: np.ndarray, path: Path, frames: int = 30) -> None:
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    Y = 0.299 * R + 0.587 * G + 0.114 * B
    U = -0.168736 * R - 0.331264 * G + 0.5 * B + 128
    V = 0.5 * R - 0.418688 * G - 0.081312 * B + 128
    Yb = np.clip(Y, 0, 255).astype(np.uint8)
    Ub = np.clip(U[::2, ::2], 0, 255).astype(np.uint8)
    Vb = np.clip(V[::2, ::2], 0, 255).astype(np.uint8)
    with open(path, "wb") as f:
        f.write(f"YUV4MPEG2 W{W} H{H} F30:1 Ip A1:1 C420jpeg\n".encode())
        for _ in range(frames):
            f.write(b"FRAME\n")
            f.write(Yb.tobytes())
            f.write(Ub.tobytes())
            f.write(Vb.tobytes())


def main() -> None:
    ut = Path(sys.argv[1] if len(sys.argv) > 1 else "prov")
    ut.mkdir(parents=True, exist_ok=True)
    skarp = hud()
    skriv_y4m(skarp, ut / "kamera-skarp.y4m")
    suddig = np.stack([gaussian_filter(skarp[..., c], 4.0) for c in range(3)], axis=-1)
    skriv_y4m(suddig, ut / "kamera-suddig.y4m")
    skriv_y4m(np.clip(skarp * 0.15, 0, 255), ut / "kamera-mork.y4m")
    # Galleribilden: samma motiv som en stor JPEG (skalas ned till 1600 px i appen).
    Image.fromarray(skarp.astype(np.uint8)).resize((2560, 1920)).save(ut / "galleri-skarp.jpg", quality=92)
    print(f"skrev kamera-skarp/suddig/mork.y4m och galleri-skarp.jpg i {ut}/")


if __name__ == "__main__":
    main()
