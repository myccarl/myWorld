"""从一个 Rocketbox 人物派生一个变体（只改贴图），例如把头发染成花白，做奶奶。

  python -I tools/rocketbox_variant.py <原名> <新名> grey

  - 读 tools/rocketbox/src/<原名>/，写 tools/rocketbox/src/<新名>/（原文件不动）；
  - FBX 原样复制（改名成 <新名>.fbx）；
  - grey：头发变花白——
      * opacity 贴图（头发片、睫毛）整张去色、提亮，带一点暖灰；
      * 头部贴图里的头发（头皮、发髻）：按颜色挑出"深的棕色"像素（皮肤更亮、嘴唇和眼睛内部偏红），
        用柔和的遮罩去色提亮，发际线自然过渡。眉毛也会变浅一点（老人本来就这样）。
之后照常：sh tools/build_rocketbox.sh <新名> <输出名> <动作来源>
"""
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SRC_ROOT = Path(__file__).resolve().parent / "rocketbox" / "src"


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def grey_hair(rgb, mask, lift=0.42, gain=1.25):
    """在 mask 上把颜色换成花白：亮度提起来，留一点原来的明暗纹理和极淡的暖色。"""
    lum = rgb @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
    g = np.clip(lift + lum * gain, 0, 0.92)[..., None]
    silver = g * np.array([1.0, 0.985, 0.96], dtype=np.float32)
    return rgb * (1 - mask[..., None]) + silver * mask[..., None]


def hsv(rgb):
    mx, mn = rgb.max(-1), rgb.min(-1)
    v = mx
    s = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    d = np.maximum(mx - mn, 1e-4)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return h, s, v


def main():
    src_name, new_name, mode = sys.argv[1:4]
    src, dst = SRC_ROOT / src_name, SRC_ROOT / new_name
    dst.mkdir(exist_ok=True)
    shutil.copyfile(src / f"{src_name}.fbx", dst / f"{new_name}.fbx")
    for f in src.glob("*.tga"):
        if not (mode == "grey" and (f.name.endswith("_head_color.tga") or f.name.endswith("_opacity_color.tga"))):
            shutil.copyfile(f, dst / f.name)
    if mode != "grey":
        return
    # 头发片：整张（除了全透明的地方）都是头发和睫毛
    op = next(src.glob("*_opacity_color.tga"))
    im = np.asarray(Image.open(op).convert("RGBA"), dtype=np.float32) / 255
    rgb = grey_hair(im[..., :3], np.ones(im.shape[:2], np.float32), lift=0.3, gain=1.25)
    out = np.concatenate([rgb, im[..., 3:]], -1)
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA").save(dst / op.name)
    # 头部：挑出头发
    hd = next(src.glob("*_head_color.tga"))
    rgb = np.asarray(Image.open(hd).convert("RGB"), dtype=np.float32) / 255
    h, s, v = hsv(rgb)
    brown = smooth(5, 16, h) * (1 - smooth(42, 55, h))      # 棕色（嘴唇、口腔偏红 < 10°）
    dark = 1 - smooth(0.42, 0.62, v)                         # 头发比皮肤暗
    sat = smooth(0.25, 0.4, s)
    mask = brown * dark * sat
    # 嘴里、眼球那几块（贴图左下角）不动
    H, W = mask.shape
    yy, xx = np.mgrid[0:H, 0:W]
    mask[(yy > H * 0.58) & (xx < W * 0.38)] = 0
    # 脸中间（眼窝、鼻子、嘴）只有皮肤，不动
    mask[(yy > H * 0.22) & (yy < H * 0.5) & (xx > W * 0.32) & (xx < W * 0.68)] = 0
    # 只留成片的头发：眼窝、鼻孔、耳朵里那些暗的小块不算（大范围平均里头发占得少）
    def blur(a, k):
        img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
        return np.asarray(img.resize((W // k, H // k), Image.BILINEAR).resize((W, H), Image.BILINEAR), dtype=np.float32) / 255
    region = smooth(0.3, 0.55, blur(mask, 32))
    mask = mask * region
    # 发际线过渡：只在成片头发的边上糊一点
    mask = np.maximum(mask, blur(mask, 6) * region * 0.8)
    out = grey_hair(rgb, mask, lift=0.3, gain=1.15)
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGB").save(dst / hd.name)
    print("ok", dst)


main()
