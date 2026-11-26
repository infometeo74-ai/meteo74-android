#!/usr/bin/env python3
"""Build the offline place index used by all Météo74 maps."""
import argparse
from collections import defaultdict
import io
import json
import math
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile


COMMUNES = "https://geo.api.gouv.fr/communes?fields=nom,code,codeDepartement,population,mairie,centre&format=json"
GEONAMES = "https://download.geonames.org/export/dump/cities1000.zip"
NATURAL_EARTH = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson"
OUTPUT = Path(__file__).resolve().parents[1] / "app/src/main/assets/web/assets/places"


def read(path, url):
    if path:
        return path.read_bytes()
    with urlopen(url, timeout=90) as response:
        return response.read()


def min_zoom(pop):
    for zoom, size in [(4, 1000000), (5, 250000), (6, 100000), (7, 25000),
                       (8, 10000), (9, 5000), (10, 2000), (11, 500)]:
        if pop >= size:
            return zoom
    return 12


def write_json(name, value):
    (OUTPUT / name).write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("communes", "geonames", "natural-earth"):
        parser.add_argument("--" + name, type=Path)
    args = parser.parse_args()
    towns = json.loads(read(args.communes, COMMUNES))
    translations = {}
    for feature in json.loads(read(args.natural_earth, NATURAL_EARTH))["features"]:
        p = feature["properties"]
        if p.get("GEONAMESID") and p.get("NAME_FR"):
            translations[str(p["GEONAMESID"])] = p["NAME_FR"]
    overview = []
    packs = defaultdict(lambda: defaultdict(list))

    def add(name, lat, lon, zoom, pop):
        lat, lon = round(lat * 10000), round(lon * 10000)
        row = [name, lat, lon, zoom, pop]
        if zoom <= 7:
            overview.append(row)
        else:
            y, x = math.floor(lat / 10000), math.floor(lon / 10000)
            pack = ((y + 90) // 30) * 12 + (x + 180) // 30
            packs[pack][f"{y},{x}"].append(row)

    for town in towns:
        if "arrondissement" in town["nom"].lower():
            continue
        lon, lat = (town.get("mairie") or town["centre"])["coordinates"]
        pop = town.get("population") or 0
        zoom = min_zoom(pop)
        # Chamonix is a regional reference point in the upper Arve valley.
        if town["code"] == "74056":
            zoom = min(zoom, 7)
        add(town["nom"], lat, lon, zoom, pop)
    with ZipFile(io.BytesIO(read(args.geonames, GEONAMES))) as source:
        with source.open("cities1000.txt") as data:
            for line in io.TextIOWrapper(data, encoding="utf-8"):
                f = line.rstrip("\n").split("\t")
                if f[8] == "FR" or f[7] in {"PPLQ", "PPLH", "PPLS", "PPLW"}:
                    continue
                pop = int(f[14] or 0)
                zoom = min_zoom(pop)
                if f[7] == "PPLC":
                    zoom = min(zoom, 4 if pop >= 100000 else 6)
                if f[7] == "PPLX":
                    zoom = 13
                add(translations.get(f[0]) or f[1], float(f[4]), float(f[5]), zoom, pop)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    write_json("overview.json", {"packs": sorted(packs), "places": overview})
    for number, cells in sorted(packs.items()):
        write_json(f"{number}.json", cells)
    print(len(overview), "overview places,", sum(len(rows) for cells in packs.values()
          for rows in cells.values()), "detailed places,", len(packs), "regional files.")


if __name__ == "__main__":
    main()
