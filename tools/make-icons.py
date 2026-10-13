#!/usr/bin/env python3
"""สร้างไอคอน PWA ทุกขนาดจาก assets/icon-source.png

ใช้: python3 tools/make-icons.py [--no-update]
- ถ้าไม่พบ assets/icon-source.png จะสร้างไอคอนชั่วคราว (พื้นเขียวเข้ม มุมโค้ง ตัวเลข "10" สีขาว)
  และแจ้งเตือนชัดเจน — อัปโหลดรูปจริงแล้วรันใหม่
- ตรวจมุมทั้งสี่ของรูปต้นฉบับ: ถ้าโปร่งใสอยู่แล้วใช้ตามเดิม ถ้าทึบ/ขาว จะตัดเป็นมุมโค้งโปร่งใส (สำหรับ "any")
- maskable: พื้นเต็มสี่เหลี่ยมด้วยสีที่ขอบรูป แล้ววางรูปทั้งหมดใน safe zone 80% ตรงกลาง (ไม่ตัดส่วนใดของรูป)
- อัปเดต theme_color/background_color ใน manifest.json และ <meta name="theme-color"> ใน index.html
  ให้เป็นสีที่ดึงจากขอบรูป (ปิดด้วย --no-update)
"""
import json, re, sys, statistics
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "icon-source.png"
OUT = ROOT / "icons"
CORNER_RADIUS = 0.225      # สัดส่วนรัศมีมุมโค้งเทียบกับด้านของรูป (iOS-style squircle โดยประมาณ)
INSET = 0.004              # ขอบนอกที่ตัดทิ้งเล็กน้อยเพื่อไม่ให้เหลือขอบสีเข้มของเฟรม
SAFE = 0.74                # สัดส่วนรูปใน maskable (เฉียดขอบ 80% ของรูปเดิม ลดลงเพื่อกันถูกตัดเมื่อ mask เป็นวงกลม)


def rounded_mask(size, radius_frac, inset_frac=0.0, ss=4):
    w = size * ss
    m = Image.new("L", (w, w), 0)
    i = int(w * inset_frac)
    ImageDraw.Draw(m).rounded_rectangle([i, i, w - 1 - i, w - 1 - i], radius=int(w * radius_frac), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def corners_info(im):
    w, h = im.size
    px = [im.getpixel(p) for p in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]]
    transparent = all(len(p) == 4 and p[3] < 16 for p in px)
    return px, transparent


def edge_color(im):
    """สีเฉลี่ย(มัธยฐาน)ของแถบขอบรูป (ตัดมุมออก) — ใช้เป็นพื้นของ maskable และ theme_color"""
    w, h = im.size
    rgb = im.convert("RGB")
    d = int(w * 0.012)
    samples = []
    a, b = int(w * 0.25), int(w * 0.75)
    for t in range(a, b, 4):
        for k in (d, d + 3):
            samples += [rgb.getpixel((t, k)), rgb.getpixel((t, h - 1 - k)), rgb.getpixel((k, t)), rgb.getpixel((w - 1 - k, t))]
    return tuple(int(statistics.median(c[i] for c in samples)) for i in range(3))


def placeholder(size=1024):
    bg = (27, 94, 32)
    im = Image.new("RGBA", (size, size), bg + (255,))
    f = None
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"]:
        if Path(p).exists():
            f = ImageFont.truetype(p, int(size * 0.5)); break
    f = f or ImageFont.load_default()
    d = ImageDraw.Draw(im)
    d.text((size / 2, size / 2), "10", font=f, fill="white", anchor="mm")
    im.putalpha(rounded_mask(size, CORNER_RADIUS))
    return im, bg


def main():
    update = "--no-update" not in sys.argv
    OUT.mkdir(exist_ok=True)
    if SRC.exists():
        src = Image.open(SRC)
        px, transparent = corners_info(src)
        print(f"พบ {SRC.name} ขนาด {src.size} โหมด {src.mode}; มุมทั้งสี่ = {px}")
        print("มุมโปร่งใสอยู่แล้ว → ใช้ตามต้นฉบับ" if transparent else "มุมไม่โปร่งใส → ตัดเป็นมุมโค้งโปร่งใส (any) และใช้สีขอบเป็นพื้น maskable")
        src = src.convert("RGBA")
        bg = edge_color(src)
        if transparent:
            any_img = src
        else:
            any_img = src.copy()
            m = rounded_mask(src.size[0], CORNER_RADIUS, INSET)
            a = any_img.getchannel("A")
            any_img.putalpha(Image.composite(a, Image.new("L", a.size, 0), m))
        # maskable/apple: ใช้รูปที่ตัดมุมแล้ววางบนพื้นสีขอบเต็มสี่เหลี่ยม
        content = any_img
        temporary = False
    else:
        print("!" * 70)
        print("ไม่พบ assets/icon-source.png → สร้างไอคอนชั่วคราว (พื้นเขียว + เลข 10)")
        print("เมื่อวางรูปจริงที่ assets/icon-source.png แล้วรันสคริปต์นี้ใหม่")
        print("!" * 70)
        any_img, bg = placeholder()
        content = any_img
        temporary = True

    def resize(img, n):
        return img.resize((n, n), Image.LANCZOS)

    def on_bg(n, frac):
        c = Image.new("RGBA", (n, n), bg + (255,))
        k = int(round(n * frac))
        c.alpha_composite(resize(content, k), ((n - k) // 2, (n - k) // 2))
        return c

    resize(any_img, 192).save(OUT / "icon-192.png", optimize=True)
    resize(any_img, 512).save(OUT / "icon-512.png", optimize=True)
    on_bg(512, SAFE).convert("RGB").save(OUT / "maskable-512.png", optimize=True)
    on_bg(180, 0.92).convert("RGB").save(OUT / "apple-touch-icon-180.png", optimize=True)
    resize(any_img, 32).save(OUT / "favicon-32.png", optimize=True)
    hexc = "#%02x%02x%02x" % bg
    print("สร้างไอคอนใน", OUT, "| สีธีม", hexc)

    if update:
        mp = ROOT / "manifest.json"
        if mp.exists():
            m = json.loads(mp.read_text(encoding="utf-8")); m["theme_color"] = hexc; m["background_color"] = hexc
            mp.write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        ip = ROOT / "index.html"
        if ip.exists():
            t = ip.read_text(encoding="utf-8")
            t = re.sub(r'(<meta name="theme-color" content=")#[0-9a-fA-F]{6}(")', r"\g<1>" + hexc + r"\2", t)
            ip.write_text(t, encoding="utf-8")
    (OUT / ".temporary").unlink(missing_ok=True)
    if temporary:
        (OUT / ".temporary").write_text("ไอคอนชั่วคราว\n")


if __name__ == "__main__":
    main()
