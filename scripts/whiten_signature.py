"""Remove gray paper background from signature; save on pure white."""
from pathlib import Path

from PIL import Image
import numpy as np

SRC = Path(
    r"C:\Users\sieme\.cursor\projects\e-Honicstore-main\assets"
    r"\c__Users_sieme_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"e1ef69ed56662d24d4f7627369527528_images_image-ba242c77-7be8-4e7a-b76c-53eda2c3fbaa.png"
)
OUT = Path(r"E:\Honicstore-main\honicstore-admin\public\report-assets\prepared-by-signature-white.png")


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img = Image.open(SRC).convert("RGB")
    arr = np.array(img).astype(np.float32)
    h, w, _ = arr.shape

    # Estimate paper from border ring
    border = np.concatenate(
        [
            arr[:8, :, :].reshape(-1, 3),
            arr[-8:, :, :].reshape(-1, 3),
            arr[:, :8, :].reshape(-1, 3),
            arr[:, -8:, :].reshape(-1, 3),
        ],
        axis=0,
    )
    paper = np.median(border, axis=0)

    diff = np.linalg.norm(arr - paper, axis=2)
    luma = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    chroma = np.maximum(np.maximum(arr[:, :, 0], arr[:, :, 1]), arr[:, :, 2]) - np.minimum(
        np.minimum(arr[:, :, 0], arr[:, :, 1]), arr[:, :, 2]
    )

    # Ink: differs from paper OR dark/chroma
    ink_score = np.clip((diff - 28) / 45.0, 0, 1)
    ink_score = np.maximum(ink_score, np.clip((170 - luma) / 60.0, 0, 1))
    ink_score = np.maximum(ink_score, np.clip((chroma - 18) / 40.0, 0, 1) * (luma < 210))

    # Hard threshold for clean white paper
    is_paper = (diff < 38) & (chroma < 28) & (luma > 150)
    alpha = np.where(is_paper, 0.0, ink_score)
    alpha = np.clip(alpha, 0, 1)

    out = np.empty_like(arr)
    out[:, :, 0] = arr[:, :, 0] * alpha + 255.0 * (1.0 - alpha)
    out[:, :, 1] = arr[:, :, 1] * alpha + 255.0 * (1.0 - alpha)
    out[:, :, 2] = arr[:, :, 2] * alpha + 255.0 * (1.0 - alpha)

    # Anything still pale gray → white
    out_luma = 0.299 * out[:, :, 0] + 0.587 * out[:, :, 1] + 0.114 * out[:, :, 2]
    out_chroma = np.maximum(np.maximum(out[:, :, 0], out[:, :, 1]), out[:, :, 2]) - np.minimum(
        np.minimum(out[:, :, 0], out[:, :, 1]), out[:, :, 2]
    )
    out[(out_luma > 210) & (out_chroma < 35)] = 255
    out[out_luma > 245] = 255

    ys, xs = np.where(alpha > 0.25)
    if len(xs) and len(ys):
        pad = 18
        y0 = max(0, int(ys.min()) - pad)
        y1 = min(h, int(ys.max()) + pad + 1)
        x0 = max(0, int(xs.min()) - pad)
        x1 = min(w, int(xs.max()) + pad + 1)
        out = out[y0:y1, x0:x1]

    Image.fromarray(out.astype(np.uint8), "RGB").save(OUT, "PNG", optimize=True)
    a = np.array(Image.open(OUT))
    nw = int(((a[:, :, 0] < 250) | (a[:, :, 1] < 250) | (a[:, :, 2] < 250)).sum())
    print(
        {
            "saved": str(OUT),
            "size": a.shape[:2][::-1],
            "nonwhite": nw,
            "corners": [a[0, 0].tolist(), a[0, -1].tolist(), a[-1, 0].tolist(), a[-1, -1].tolist()],
        }
    )


if __name__ == "__main__":
    main()
