"""Build the bundled Haute-Savoie grid from Mapzen Terrarium elevation tiles."""
import io
import json
import math
import struct
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen
from PIL import Image, ImageDraw

assets = Path(__file__).resolve().parents[1] / "app/src/main/assets/web/assets"
width, height = 210, 182
west, south, east, north = 5.77, 45.65, 7.08, 46.44
zoom = 9
world = 256 * 2 ** zoom

def pixel(lon, lat):
    return (lon + 180) / 360 * world, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * world

x0, y0 = pixel(west, north)
x1, y1 = pixel(east, south)
rings = json.loads((assets / "haute-savoie.geojson").read_text())["geometry"]["coordinates"]
mask = Image.new("L", (width, height))
draw = ImageDraw.Draw(mask)
for i, ring in enumerate(rings):
    points = [((x-x0)/(x1-x0)*width-.5, (y-y0)/(y1-y0)*height-.5) for x,y in (pixel(*p) for p in ring)]
    draw.polygon(points, fill=1 if i == 0 else 0)

def tile(key):
    x,y = key
    url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{zoom}/{x}/{y}.png"
    with urlopen(Request(url, headers={"User-Agent":"Meteo74 terrain"}), timeout=30) as f:
        return key,Image.open(io.BytesIO(f.read())).convert("RGB")

keys = [(x,y) for x in range(int(x0)//256,int(x1)//256+1) for y in range(int(y0)//256,int(y1)//256+1)]
with ThreadPoolExecutor(6) as pool:
    tiles = dict(pool.map(tile,keys))
values = bytearray()
for row in range(height):
    for col in range(width):
        x,y = int(x0+(col+.5)*(x1-x0)/width), int(y0+(row+.5)*(y1-y0)/height)
        r,g,b = tiles[x//256,y//256].getpixel((x%256,y%256))
        z = max(0,round(256*r+g+b/256-32768))
        values.extend(struct.pack("<H", z | (0x8000 if mask.getpixel((col,row)) else 0)))
(assets / "observations-terrain.bin").write_bytes(values)
print(f"{width} × {height}, {len(keys)} tiles")
