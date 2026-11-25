#!/usr/bin/env python3
"""Generate update metadata from the signed Météo74 APK, after a release build."""
import argparse
import hashlib
import json
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("apk", type=Path, nargs="?", default=root / "app/build/outputs/apk/release/app-release.apk")
parser.add_argument("--notes", required=True, help="Notes de version affichées sur le téléphone")
args = parser.parse_args()
gradle = (root / "app/build.gradle").read_text()
version = re.search(r"versionName '([0-9]+\.[0-9]+\.[0-9]+)'", gradle)[1]
code = int(re.search(r"versionCode (\d+)", gradle)[1])
data = args.apk.read_bytes()
manifest = {
    "packageName": "fr.meteo74.android", "versionCode": code, "versionName": version,
    "file": f"Meteo74-{version}.apk", "size": len(data),
    "sha256": hashlib.sha256(data).hexdigest(), "notes": args.notes,
}
folder = root / "supabase/functions/meteo74-updates"
(folder / "latest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(f"{manifest['file']}  {manifest['size']} octets  {manifest['sha256']}")
