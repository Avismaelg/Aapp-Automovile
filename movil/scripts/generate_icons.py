"""Genera los iconos y el splash de Caravana a partir de un mark vectorial simple.

Uso:
    python scripts/generate_icons.py

Requiere Pillow:  python -m pip install pillow
"""

from __future__ import annotations

from math import cos, radians, sin
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets" / "images"
ASSETS.mkdir(parents=True, exist_ok=True)

BG_TOP = (12, 16, 21)
BG_BOTTOM = (5, 7, 10)
ORANGE = (255, 90, 31, 255)
LIME = (201, 255, 77, 255)
WHITE = (243, 246, 250, 245)
SCALE = 4


def lerp(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * t)


def gradient_background(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size), BG_BOTTOM + (255,))
    draw = ImageDraw.Draw(image)
    for y in range(size):
        t = y / max(1, size - 1)
        color = tuple(lerp(BG_TOP[i], BG_BOTTOM[i], t) for i in range(3))
        draw.line([(0, y), (size, y)], fill=color + (255,))
    return image


def add_glow(image: Image.Image, cx: int, cy: int, radius: int) -> Image.Image:
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        fill=(255, 90, 31, 80),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius * 0.55))
    return Image.alpha_composite(image, glow)


def draw_mark(image: Image.Image, cx: int, cy: int, scale: float) -> Image.Image:
    draw = ImageDraw.Draw(image)
    radius = 300 * scale
    width = 104 * scale

    # Aro de velocidad con apertura a la derecha (forma de C).
    draw.arc(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        start=35,
        end=325,
        fill=ORANGE,
        width=round(width),
    )
    # Punto "en vivo" en el hueco del aro.
    dot = 40 * scale
    draw.ellipse(
        [cx + radius - dot, cy - dot, cx + radius + dot, cy + dot],
        fill=LIME,
    )

    # Carretera estilizada dentro del aro.
    road = [
        (-0.62, 0.62),
        (-0.47, 0.44),
        (-0.34, 0.30),
        (-0.20, 0.10),
        (-0.06, -0.08),
        (0.07, -0.26),
        (0.20, -0.42),
        (0.33, -0.58),
    ]
    points = [(cx + x * radius, cy + y * radius) for x, y in road]
    road_width = round(36 * scale)
    draw.line(points, fill=WHITE, width=road_width, joint="curve")

    # Línea central continua.
    draw.line(points, fill=(10, 14, 18, 235), width=max(2, round(8 * scale)), joint="curve")

    # Punta de flecha.
    tip = points[-1]
    prev = points[-2]
    dx, dy = tip[0] - prev[0], tip[1] - prev[1]
    length = max(1.0, (dx * dx + dy * dy) ** 0.5)
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    arrow_len = 56 * scale
    arrow_wide = 42 * scale
    base = (tip[0] - ux * arrow_len, tip[1] - uy * arrow_len)
    draw.polygon(
        [
            tip,
            (base[0] + px * arrow_wide, base[1] + py * arrow_wide),
            (base[0] - px * arrow_wide, base[1] - py * arrow_wide),
        ],
        fill=WHITE,
    )

    return image


def make_icon(size: int = 1024) -> Image.Image:
    big = size * SCALE
    image = gradient_background(big)
    image = add_glow(image, big // 2, big // 2, int(big * 0.42))
    image = draw_mark(image, big // 2, big // 2, big / 1024)
    return image.resize((size, size), Image.LANCZOS)


def make_transparent_mark(size: int, mark_scale: float) -> Image.Image:
    big = size * SCALE
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    image = draw_mark(image, big // 2, big // 2, (big / 1024) * mark_scale)
    return image.resize((size, size), Image.LANCZOS)


def make_foreground(size: int = 1080) -> Image.Image:
    big = size * SCALE
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    image = draw_mark(image, big // 2, big // 2, (big / 1024) * 0.78)
    return image.resize((size, size), Image.LANCZOS)


def make_monochrome(size: int = 1080) -> Image.Image:
    big = size * SCALE
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    cx = cy = big // 2
    radius = 300 * (big / 1024) * 0.78
    width = 104 * (big / 1024) * 0.78
    draw.arc(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        start=35,
        end=325,
        fill=(255, 255, 255, 255),
        width=round(width),
    )
    dot = 40 * (big / 1024) * 0.78
    draw.ellipse(
        [cx + radius - dot, cy - dot, cx + radius + dot, cy + dot],
        fill=(255, 255, 255, 255),
    )
    return image.resize((size, size), Image.LANCZOS)


def make_splash(size: int = 1024) -> Image.Image:
    big = size * SCALE
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    image = draw_mark(image, big // 2, int(big * 0.40), (big / 1024) * 0.54)

    draw = ImageDraw.Draw(image)
    font_path = Path("C:/Windows/Fonts/arialbd.ttf")
    if font_path.exists():
        font = ImageFont.truetype(str(font_path), int(76 * SCALE))
        text = "CARAVANA"
        tracking = int(14 * SCALE)
        widths = [draw.textlength(char, font=font) for char in text]
        total = sum(widths) + tracking * (len(text) - 1)
        x = (big - total) / 2
        y = int(big * 0.64)
        for char, char_width in zip(text, widths):
            draw.text((x, y), char, font=font, fill=(243, 246, 250, 255))
            x += char_width + tracking
        small = ImageFont.truetype(str(font_path), int(26 * SCALE))
        subtitle = "LA RED SOCIAL DEL COCHE"
        sub_width = draw.textlength(subtitle, font=small)
        draw.text(
            ((big - sub_width) / 2, int(big * 0.73)),
            subtitle,
            font=small,
            fill=(255, 90, 31, 255),
        )

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    icon = make_icon(1024)
    icon.convert("RGB").save(ASSETS / "icon.png")
    icon.resize((64, 64), Image.LANCZOS).convert("RGB").save(ASSETS / "favicon.png")

    make_splash(1024).save(ASSETS / "splash-icon.png")
    make_foreground(1080).save(ASSETS / "android-icon-foreground.png")

    background = gradient_background(1080)
    background.convert("RGB").save(ASSETS / "android-icon-background.png")

    make_monochrome(1080).save(ASSETS / "android-icon-monochrome.png")
    make_monochrome(256).resize((96, 96), Image.LANCZOS).save(
        ASSETS / "notification-icon.png"
    )

    print("Iconos generados en", ASSETS)


if __name__ == "__main__":
    main()
