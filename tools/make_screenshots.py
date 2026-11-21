#!/usr/bin/env python3
"""Neon Tide: Coral Bay — rasterise the four screenshot scenes with PIL.

There is no browser on this machine, so the shipped screenshots are PIL
rasterisations — stated plainly in SESSION.md. They are drawn from the
game's own generated city (tools/dump_city.mjs runs the real generator)
and stage the same scenes the game's ?shot= staging produces in a
browser: a four-star chase at night, a dusk drive down the Neon Mile, a
conversation at the Mercado, and the title screen. The palette, HUD and
minimap mirror game/src/render.js.

    python3 tools/make_screenshots.py
"""

import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H = 1280, 800
SEED = 7

AVENUES = list(range(320, 4300, 400))
STREETS = list(range(320, 3441, 400))
DISTRICTS = [
    ("Palm Heights", "#3d4a3a"), ("Mercado Viejo", "#4a4234"), ("Marina Azul", "#37474f"),
    ("The Flats", "#41413c"), ("Neon Mile", "#3a3f52"), ("Harbourview", "#3c4650"),
    ("Solana Yards", "#474034"), ("Calle Sol", "#4c3a3a"), ("Coral Docks", "#39434a"),
]
CAR_PAINT = ["#c94f4f", "#4f7dc9", "#e0a83c", "#5cae6e", "#b8bcc4", "#7a5fc0", "#3fb6b2", "#d96ba0"]
NEON = ["#ff5da2", "#6fd3e7", "#ffd166", "#9dff57", "#c792ff", "#ff8a5c"]


def shore_x(y):
    return 4420 + math.sin(y / 1150 * math.pi * 2) * 90


def load_city():
    out = subprocess.run(
        ["node", str(ROOT / "tools" / "dump_city.mjs"), str(SEED)],
        capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def font(size, bold=True):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


class Scene:
    """One frame: a world camera, a darkness level, and the paint helpers."""

    def __init__(self, city, cx, cy, dark):
        self.city = city
        self.img = Image.new("RGB", (W, H), "#20242c")
        self.d = ImageDraw.Draw(self.img, "RGBA")
        self.cx = cx
        self.cy = cy
        self.dark = dark

    def sx(self, x):
        return x - self.cx + W / 2

    def sy(self, y):
        return y - self.cy + H / 2

    def visible(self, x, y, m=90):
        return -m < self.sx(x) < W + m and -m < self.sy(y) < H + m

    # -- world ------------------------------------------------------------
    def ground(self):
        d = self.d
        for i, (_, colour) in enumerate(DISTRICTS):
            col, row = i % 3, i // 3
            d.rectangle([self.sx(col * 1600), self.sy(row * 1200), self.sx(col * 1600 + 1600), self.sy(row * 1200 + 1200)], fill=colour)
        d.rectangle([self.sx(0), self.sy(0), self.sx(4800), self.sy(3600)], outline=None)
        # Sidewalk aprons then asphalt.
        for ax in AVENUES:
            d.rectangle([self.sx(ax - 61), self.sy(0), self.sx(ax + 61), self.sy(3600)], fill="#565b60")
        for sy_ in STREETS:
            d.rectangle([self.sx(0), self.sy(sy_ - 61), self.sx(4800), self.sy(sy_ + 61)], fill="#565b60")
        # The bay.
        shore = [(self.sx(shore_x(y)), self.sy(y)) for y in range(-100, 3701, 60)]
        d.polygon(shore + [(W + 100, H + 100), (W + 100, -100)], fill="#1d5f7a")
        sand = [(self.sx(shore_x(y) - 16), self.sy(y)) for y in range(-100, 3701, 60)]
        d.line(sand, fill="#c9b083", width=10)
        for pier in self.city["piers"]:
            d.rectangle([self.sx(pier["x"]), self.sy(pier["y"]), self.sx(pier["x"] + pier["w"]), self.sy(pier["y"] + pier["h"])], fill="#6d5a43")
        for ax in AVENUES:
            d.rectangle([self.sx(ax - 52), self.sy(0), self.sx(ax + 52), self.sy(3600)], fill="#33373d")
        for sy_ in STREETS:
            d.rectangle([self.sx(0), self.sy(sy_ - 52), self.sx(4800), self.sy(sy_ + 52)], fill="#33373d")
        d.line([(0, 0)], fill="#f0dc82")
        for ax in AVENUES:
            for y in range(14, 3600, 44):
                d.rectangle([self.sx(ax - 2), self.sy(y), self.sx(ax + 2), self.sy(y + 24)], fill=(240, 220, 130, 140))
        for sy_ in STREETS:
            for x in range(14, 4800, 44):
                d.rectangle([self.sx(x), self.sy(sy_ - 2), self.sx(x + 24), self.sy(sy_ + 2)], fill=(240, 220, 130, 140))

    def lots_and_buildings(self):
        d = self.d
        for lot in self.city["lots"]:
            if not self.visible(lot["x"], lot["y"], 320):
                continue
            d.rectangle([self.sx(lot["x"]), self.sy(lot["y"]), self.sx(lot["x"] + lot["w"]), self.sy(lot["y"] + lot["h"])], fill="#4a4d4a")
            for x in range(int(lot["x"]) + 26, int(lot["x"] + lot["w"]) - 10, 52):
                d.line([self.sx(x), self.sy(lot["y"] + 12), self.sx(x), self.sy(lot["y"] + 52)], fill=(230, 230, 230, 90), width=2)
        for b in self.city["buildings"]:
            if not self.visible(b["x"] + b["w"] / 2, b["y"] + b["h"] / 2, 260):
                continue
            lift = b["tier"] * 5
            d.rectangle([self.sx(b["x"] + lift), self.sy(b["y"] + lift), self.sx(b["x"] + b["w"] + lift), self.sy(b["y"] + b["h"] + lift)], fill=(0, 0, 0, 90))
            d.rectangle([self.sx(b["x"]), self.sy(b["y"]), self.sx(b["x"] + b["w"]), self.sy(b["y"] + b["h"])], fill=b["face"])
            d.rectangle([self.sx(b["x"] + 5), self.sy(b["y"] + 5), self.sx(b["x"] + b["w"] - 5), self.sy(b["y"] + b["h"] - 5)], fill=b["roof"])
            cols = max(2, int(b["w"] // 26))
            rows = max(2, int(b["h"] // 26))
            for c in range(cols):
                for r in range(rows):
                    h = (b["winSeed"] ^ (c * 73856093) ^ (r * 19349663)) & 0xFFFFFFFF
                    h = ((h ^ (h >> 13)) * 0x5BD1E995) & 0xFFFFFFFF
                    v = ((h ^ (h >> 15)) & 0xFFFFFFFF) / 4294967296
                    lit = self.dark > 0.25 and v < 0.34 + self.dark * 0.3
                    wx = b["x"] + 9 + c * ((b["w"] - 18) / cols)
                    wy = b["y"] + 9 + r * ((b["h"] - 18) / rows)
                    d.rectangle([self.sx(wx), self.sy(wy), self.sx(wx + 8), self.sy(wy + 6)], fill="#ffd98a" if lit else "#2b3038")
            if b["neon"] and self.dark > 0.12:
                d.rectangle([self.sx(b["x"] + 6), self.sy(b["y"] + 6), self.sx(b["x"] + 6 + min(b["w"] - 12, 12 + b["tier"] * 16)), self.sy(b["y"] + 11)], fill=b["neon"])

    def palms_and_lamps(self):
        d = self.d
        for palm in self.city["palms"]:
            if not self.visible(palm["x"], palm["y"], 40):
                continue
            x, y, s = self.sx(palm["x"]), self.sy(palm["y"]), palm["s"]
            for i in range(6):
                a = i / 6 * math.pi * 2 + s * 2
                d.line([x, y, x + math.cos(a) * 17 * s, y + math.sin(a) * 17 * s + 3], fill="#3f7a44", width=3)
            d.ellipse([x - 3.4 * s, y - 3.4 * s, x + 3.4 * s, y + 3.4 * s], fill="#6d5a43")
        if self.dark > 0.2:
            glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            gd = ImageDraw.Draw(glow)
            # Lamp positions mirror city.js: kerbs of every avenue and street.
            lamps = []
            for ax in AVENUES:
                for y in range(90, 3540, 150):
                    lamps.append((ax - 59, y))
                    lamps.append((ax + 59, y + 75))
            for sy_ in STREETS:
                for x in range(140, 4360, 170):
                    lamps.append((x, sy_ - 59))
                    lamps.append((x + 85, sy_ + 59))
            for lx, ly in lamps:
                if self.visible(lx, ly, 50):
                    gd.ellipse([self.sx(lx) - 40, self.sy(ly) - 40, self.sx(lx) + 40, self.sy(ly) + 40], fill=(255, 205, 110, int(38 * self.dark)))
            glow = glow.filter(ImageFilter.GaussianBlur(16))
            self.img = Image.alpha_composite(self.img.convert("RGBA"), glow).convert("RGB")
            self.d = ImageDraw.Draw(self.img, "RGBA")

    def places(self):
        d = self.d
        for place in self.city["places"]:
            if not self.visible(place["x"], place["y"], 140):
                continue
            x, y = self.sx(place["x"]), self.sy(place["y"])
            colour = "#ff5da2" if place["kind"] == "respray" else "#6fd3e7"
            d.rectangle([x - 46, y - 30, x + 46, y + 30], outline=colour, width=2)
            d.rectangle([x - 44, y - 48, x + 44, y - 33], fill="#10131a")
            d.text((x, y - 40), place["name"].upper()[:18], font=font(9), fill="#f2f2f2", anchor="mm")

    def night(self):
        if self.dark > 0.02:
            overlay = Image.new("RGBA", (W, H), (8, 10, 34, int(self.dark * 87)))
            self.img = Image.alpha_composite(self.img.convert("RGBA"), overlay).convert("RGB")
            self.d = ImageDraw.Draw(self.img, "RGBA")

    # -- actors -------------------------------------------------------------
    def car(self, x, y, angle, paint, police=False, player=False):
        sprite = Image.new("RGBA", (120, 90), (0, 0, 0, 0))
        sd = ImageDraw.Draw(sprite)
        body = "#e8ecf2" if police else CAR_PAINT[paint % 8]
        sd.rounded_rectangle([37, 34, 83, 56], radius=6, fill=body)
        if police:
            sd.rectangle([37, 34, 52, 56], fill="#1c2733")
            sd.rectangle([68, 34, 83, 56], fill="#1c2733")
        sd.rounded_rectangle([54, 36, 69, 54], radius=3, fill="#18222e")
        sd.rectangle([70, 37, 75, 53], fill="#2c3e50")
        sd.rectangle([46, 37, 50, 53], fill="#2c3e50")
        if self.dark > 0.2:
            sd.polygon([(83, 37), (118, 24), (118, 66), (83, 53)], fill=(255, 240, 190, int(70 * self.dark)))
            sd.rectangle([81, 36, 84, 41], fill="#fff3c4")
            sd.rectangle([81, 49, 84, 54], fill="#fff3c4")
        if police:
            sd.rectangle([54, 37, 65, 43], fill="#ff3b30")
            sd.rectangle([54, 47, 65, 53], fill="#2f7bff")
        if player:
            sd.rounded_rectangle([37, 34, 83, 56], radius=6, outline="#ffd166", width=2)
        sprite = sprite.rotate(-math.degrees(angle), resample=Image.BICUBIC, center=(60, 45))
        self.img.paste(sprite, (int(self.sx(x) - 60), int(self.sy(y) - 45)), sprite)
        self.d = ImageDraw.Draw(self.img, "RGBA")

    def person(self, x, y, angle, colour, armed=False):
        d = self.d
        x, y = self.sx(x), self.sy(y)
        d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=colour)
        d.ellipse([x - 4, y - 4, x + 6, y + 6], fill="#d9a066")
        if armed:
            gx = x + math.cos(angle) * 12
            gy = y + math.sin(angle) * 12
            d.line([x, y, gx, gy], fill="#14161a", width=4)

    def beacon(self, x, y):
        d = self.d
        x = self.sx(x)
        d.rectangle([x - 7, 0, x + 7, self.sy(y)], fill=(255, 209, 102, 46))
        d.ellipse([x - 26, self.sy(y) - 26, x + 26, self.sy(y) + 26], outline="#ffd166", width=3)

    # -- HUD ------------------------------------------------------------------
    def hud(self, money=120, health=100, stars=0, banner=None, objective=None, district="Neon Mile", clock="21:18"):
        d = self.d
        d.rounded_rectangle([14, 14, 222, 72], radius=8, fill=(10, 13, 20, 140))
        d.text((26, 24), f"${money}", font=font(21), fill="#9dff57")
        d.rectangle([26, 50, 146, 59], fill="#2b3038")
        d.rectangle([26, 50, 26 + 120 * health / 100, 59], fill="#e5484d")
        d.text((26, 62), f"{district} · {clock}", font=font(11, bold=False), fill="#f2f2f2")
        for i in range(5):
            x = W - 26 - i * 30
            d.text((x, 20), "★", font=font(24), fill="#ffd166" if i < stars else (255, 255, 255, 56), anchor="ma")
        if banner:
            tw = d.textlength(banner, font=font(13))
            d.rounded_rectangle([W / 2 - tw / 2 - 12, 14, W / 2 + tw / 2 + 12, 40], radius=7, fill=(10, 13, 20, 140))
            d.text((W / 2, 20), banner, font=font(13), fill="#ffd166", anchor="ma")
        if objective:
            tw = d.textlength(objective, font=font(15, bold=False))
            d.rounded_rectangle([W / 2 - tw / 2 - 12, 46, W / 2 + tw / 2 + 12, 74], radius=7, fill=(10, 13, 20, 128))
            d.text((W / 2, 53), objective, font=font(15, bold=False), fill="#f2f2f2", anchor="ma")
        d.text((W - 14, H - 24), "WASD drive · E enter/talk · F/click shoot · Space handbrake · P pause · M mute",
               font=font(11, bold=False), fill=(255, 255, 255, 128), anchor="ra")

    def minimap(self, player, police=(), objective=None, start=None):
        d = self.d
        mw, mh, mx, my = 188, 141, 14, H - 141 - 14
        sx, sy = mw / 4800, mh / 3600
        d.rounded_rectangle([mx - 4, my - 4, mx + mw + 4, my + mh + 4], radius=8, fill=(10, 14, 20, 199))
        d.rectangle([mx, my, mx + mw, my + mh], fill="#2c313a")
        shore = [(mx + shore_x(y) * sx, my + y * sy) for y in range(0, 3601, 200)]
        d.polygon(shore + [(mx + mw, my + mh), (mx + mw, my)], fill="#1d5f7a")
        for ax in AVENUES:
            d.line([mx + ax * sx, my, mx + ax * sx, my + mh], fill=(200, 205, 215, 128))
        for sy_ in STREETS:
            d.line([mx, my + sy_ * sy, mx + mw, my + sy_ * sy], fill=(200, 205, 215, 128))
        for place in self.city["places"]:
            colour = "#ff5da2" if place["kind"] == "respray" else "#e5484d" if place["kind"] == "hospital" else "#6fd3e7"
            d.rectangle([mx + place["x"] * sx - 1.5, my + place["y"] * sy - 1.5, mx + place["x"] * sx + 1.5, my + place["y"] * sy + 1.5], fill=colour)
        for px, py, phase in police:
            d.ellipse([mx + px * sx - 2.6, my + py * sy - 2.6, mx + px * sx + 2.6, my + py * sy + 2.6], fill="#ff3b30" if phase else "#2f7bff")
        if objective:
            d.ellipse([mx + objective[0] * sx - 3.4, my + objective[1] * sy - 3.4, mx + objective[0] * sx + 3.4, my + objective[1] * sy + 3.4], fill="#ffd166")
        if start:
            d.ellipse([mx + start[0] * sx - 3, my + start[1] * sy - 3, mx + start[0] * sx + 3, my + start[1] * sy + 3], fill="#9dff57")
        px, py, pa = player
        cxp, cyp = mx + px * sx, my + py * sy
        d.polygon([(cxp + math.cos(pa) * 6, cyp + math.sin(pa) * 6),
                   (cxp + math.cos(pa + 2.5) * 4.5, cyp + math.sin(pa + 2.5) * 4.5),
                   (cxp + math.cos(pa - 2.5) * 4.5, cyp + math.sin(pa - 2.5) * 4.5)], fill="#ffffff")

    def dialogue(self, who, text):
        d = self.d
        bw, bx, by = 680, (W - 680) // 2, H - 128
        d.rounded_rectangle([bx, by, bx + bw, by + 84], radius=10, fill=(8, 10, 16, 224))
        d.rounded_rectangle([bx, by, bx + bw, by + 84], radius=10, outline="#6fd3e7", width=2)
        d.text((bx + 18, by + 12), who.upper(), font=font(13), fill="#6fd3e7")
        # crude word wrap at ~62 characters
        words, lines, line = text.split(), [], ""
        for word in words:
            if len(line) + len(word) + 1 > 62 and line:
                lines.append(line)
                line = word
            else:
                line = f"{line} {word}".strip()
        if line:
            lines.append(line)
        for i, ln in enumerate(lines[:2]):
            d.text((bx + 18, by + 34 + i * 19), ln, font=font(15, bold=False), fill="#f5f7fa")
        d.text((bx + bw - 14, by + 64), "E ▸", font=font(11, bold=False), fill=(255, 255, 255, 153), anchor="ra")

    def save(self, name):
        path = ROOT / "screenshots" / name
        path.parent.mkdir(exist_ok=True)
        quality = 88
        while quality > 40:
            self.img.save(path, "JPEG", quality=quality)
            if path.stat().st_size <= 258_000:
                break
            quality -= 8
        print(f"{name}: {path.stat().st_size} bytes at quality {quality}")


def world_base(city, cx, cy, dark):
    scene = Scene(city, cx, cy, dark)
    scene.ground()
    scene.lots_and_buildings()
    scene.palms_and_lamps()
    scene.places()
    return scene


def main():
    city = load_city()

    # 1 — the cover: a four-star chase through Harbourview at night.
    s = world_base(city, 2700, 1146, 1.0)
    s.beacon(1386, 778)
    s.car(2950, 1146, 0, 1)
    s.car(3180, 1094, math.pi, 2)
    s.car(2620, 1146, 0, 0, player=True)
    s.car(2470, 1184, 0.25, 0, police=True)
    s.car(2545, 1096, -0.12, 0, police=True)
    s.car(2790, 1216, 0.5, 0, police=True)
    s.car(2380, 1130, 0.05, 0, police=True)
    s.night()
    s.hud(money=120, stars=4, banner="First Errand — 1/2", objective="Collect the package at Mercado Central", district="Harbourview", clock="21:18")
    s.minimap((2620, 1146, 0), police=[(2470, 1184, 1), (2545, 1096, 0), (2790, 1216, 1), (2380, 1130, 0)], objective=(1386, 778))
    s.save("1-chase.jpg")

    # 2 — the drive: dusk on the Neon Mile, neon coming up.
    s = world_base(city, 1780, 1546, 0.55)
    s.car(1420, 1494, 0, 5)
    s.car(2150, 1546, 0, 3)
    s.car(1980, 1494, math.pi, 6)
    s.car(1780, 1546, 0, 0, player=True)
    s.person(1660, 1596, -0.6, "#d96ba0")
    s.person(2050, 1470, 2.4, "#6fd3e7")
    s.night()
    s.hud(money=640, stars=0, district="Neon Mile", clock="18:42")
    s.minimap((1780, 1546, 0), start=(1760, 1560))
    s.save("2-drive.jpg")

    # 3 — on foot: the Mercado conversation, mid-morning.
    s = world_base(city, 1368, 852, 0.0)
    s.car(1180, 762, 0, 4)
    s.car(1560, 826, math.pi, 1)
    s.person(1200, 700, 0.8, "#ffd166")
    s.person(1500, 880, -2.2, "#9dff57")
    s.person(1245, 1075, 1.2, "#ff8a5c")
    s.person(1368, 812, -math.pi / 3, "#ffd166", armed=True)
    s.person(1330, 780, 2.6, "#e0a83c")
    s.hud(money=120, stars=0, district="Mercado Viejo", clock="10:24")
    s.minimap((1368, 812, -math.pi / 3), start=(1760, 1560))
    s.dialogue("Tito", "Mari! You are Selene's new driver? She called ahead — the package is the blue cooler by my stall.")
    s.save("3-foot.jpg")

    # 4 — the title: the city idles behind the name of the game.
    s = world_base(city, 1960, 1500, 1.0)
    s.car(1700, 1546, 0, 2)
    s.car(2250, 1494, math.pi, 5)
    s.car(2050, 1950, -math.pi / 2, 6)
    s.night()
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for i in range(H):
        alpha = int(128 * (1 - i / H)) if i < H * 0.55 else int(184 * (i / H))
        od.line([(0, i), (W, i)], fill=(8, 8, 26, alpha))
    s.img = Image.alpha_composite(s.img.convert("RGBA"), overlay).convert("RGB")
    d = ImageDraw.Draw(s.img, "RGBA")
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.text((W / 2, H * 0.34 - 40), "NEON TIDE", font=font(84), fill="#ff5da2", anchor="mm")
    glow = glow.filter(ImageFilter.GaussianBlur(16))
    s.img = Image.alpha_composite(s.img.convert("RGBA"), glow).convert("RGB")
    d = ImageDraw.Draw(s.img, "RGBA")
    d.text((W / 2, H * 0.34 - 40), "NEON TIDE", font=font(84), fill="#ff5da2", anchor="mm")
    d.text((W / 2, H * 0.34 + 22), "C O R A L   B A Y", font=font(34), fill="#6fd3e7", anchor="mm")
    d.text((W / 2, H * 0.34 + 62), "Nine districts. One bay. Every car is borrowed and every light is watching.", font=font(15, bold=False), fill="#e8ecf2", anchor="mm")
    d.text((W / 2, H * 0.58), "▸ NEW GAME", font=font(23), fill="#ffd166", anchor="mm")
    d.text((W / 2, H * 0.58 + 42), "HOW TO PLAY", font=font(19, bold=False), fill="#c8cfda", anchor="mm")
    d.text((W / 2, H - 22), "An original open-world crime game · built with canvas and WebAudio · no libraries, no network", font=font(12, bold=False), fill=(255, 255, 255, 140), anchor="mm")
    s.img.save(ROOT / "screenshots" / "4-title.jpg", "JPEG", quality=88)
    size = (ROOT / "screenshots" / "4-title.jpg").stat().st_size
    print(f"4-title.jpg: {size} bytes at quality 88")
    return 0


if __name__ == "__main__":
    sys.exit(main())
