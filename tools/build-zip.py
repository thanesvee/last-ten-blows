#!/usr/bin/env python3
"""สร้าง dist/last-ten-blows-deploy.zip (index.html, manifest.json, sw.js, icons/)"""
import zipfile
from pathlib import Path
R = Path(__file__).resolve().parent.parent
(R / "dist").mkdir(exist_ok=True)
with zipfile.ZipFile(R / "dist" / "last-ten-blows-deploy.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for f in ["index.html", "manifest.json", "sw.js"]:
        z.write(R / f, f)
    for p in sorted((R / "icons").glob("*.png")):
        z.write(p, f"icons/{p.name}")
print("ok")
