"""Normalize already-background-removed ImageGen outputs; never removes backgrounds.

Usage: python scripts/prepare-cutouts.py <directory containing cutout-01.png ... cutout-14.png>
Requires Pillow for asset preparation only. The game has no Python dependency.
"""
import json
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1])


def convex_hull(points):
    points = sorted(set(points))
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for point in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    for point in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


shapes = []
for index in range(1, 15):
    source = SOURCE / f'cutout-{index:02}.png'
    image = Image.open(source).convert('RGBA')
    alpha = image.getchannel('A')
    extrema = alpha.getextrema()
    if extrema[0] > 0 or extrema[1] < 200:
        raise ValueError(f'{source.name}: missing real foreground/background alpha')
    box = alpha.point(lambda value: 255 if value >= 48 else 0).getbbox()
    if not box:
        raise ValueError(f'{source.name}: empty subject')
    image = image.crop(box)
    image.thumbnail((480, 480), Image.Resampling.LANCZOS)
    sprite = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    sprite.alpha_composite(image, ((512 - image.width) // 2, (512 - image.height) // 2))
    sprite.save(ROOT / 'assets' / f'cutout-{index:02}.webp', 'WEBP', quality=90, method=6, exact=True)
    mask = sprite.getchannel('A').resize((64, 64), Image.Resampling.LANCZOS)
    samples = []
    for y in range(64):
        xs = [x for x in range(64) if mask.getpixel((x, y)) >= 112]
        if xs:
            samples.extend([(xs[0], y), (xs[-1], y)])
    hull = convex_hull(samples)
    vertices = [((x + .5 - 32) / 32, (y + .5 - 32) / 32) for x, y in hull]
    area2 = 0
    cx = cy = 0
    for i, (x, y) in enumerate(vertices):
        nx, ny = vertices[(i + 1) % len(vertices)]
        a = x * ny - nx * y
        area2 += a
        cx += (x + nx) * a
        cy += (y + ny) * a
    shapes.append({
        'vertices': [{'x': round(x, 6), 'y': round(y, 6)} for x, y in vertices],
        'center': {'x': round(cx / (3 * area2), 6), 'y': round(cy / (3 * area2), 6)},
    })
    print(f'{index:02}: RGBA cutout, {len(hull)} collision vertices')

js = '/* Convex collision envelopes sampled from the transparent sprite alpha. */\n'
js += '(function(root){const shapes=' + json.dumps(shapes, separators=(',', ':'))
js += ';if(typeof module!=="undefined"&&module.exports)module.exports=shapes;else root.CHARACTER_SHAPES=shapes;})(typeof globalThis!=="undefined"?globalThis:this);\n'
(ROOT / 'assets' / 'shapes.js').write_text(js, encoding='utf-8')
