#!/usr/bin/env python3
"""Import the individual transparent PNGs from the approved Météo74 archive."""
import argparse
import hashlib
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

from PIL import Image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    weather = Path(__file__).resolve().parents[1] / "app/src/main/assets/web/assets/weather"
    collection = json.loads((weather / "collection.json").read_text())
    root = "Meteo74_icones_transparentes/"
    with ZipFile(args.archive) as pack, TemporaryDirectory(dir=weather) as tmp:
        icons = json.loads(pack.read(root + "catalogue.json"))["icones"]
        targets = {entry["id"]: entry["file"] for entry in collection}
        if sorted(entry["id"] for entry in icons) != sorted(targets):
            raise ValueError("Les numéros ne correspondent pas au catalogue de l’application.")
        for entry in icons:
            raw = pack.read(root + entry["fichier"])
            if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
                raise ValueError("PNG incomplet : " + entry["fichier"])
            with Image.open(io.BytesIO(raw)) as source:
                if source.mode != "RGBA" or source.width != source.height:
                    raise ValueError("PNG carré et transparent attendu : " + entry["fichier"])
                icon = source.resize((384, 384), Image.Resampling.LANCZOS)
                icon.save(Path(tmp) / targets[entry["id"]], "WEBP", quality=90,
                          alpha_quality=100, method=6, exact=True)
        for filename in targets.values():
            (Path(tmp) / filename).replace(weather / "hd" / filename)


if __name__ == "__main__":
    main()
