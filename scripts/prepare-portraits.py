"""Build native SVG portrait crops/masks without repainting the source photographs.

The original cutout WebP is embedded unchanged. A vector clip curves a flat
lower edge; the same clip is sampled for the physics envelope.
"""
import base64
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
# Upper-body framing makes thin full-body poses comparable to seated portraits.
CROPS = {1: (0, 16, 512, 312), 2: (0, 0, 512, 448), 3: (0, 0, 512, 428),
         7: (145, 58, 350, 308), 11: (0, 16, 512, 295), 12: (0, 16, 512, 340)}


def hull(points):
    points = sorted(set(points))
    def cross(o, a, b):
        return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    low, high = [], []
    for p in points:
        while len(low) > 1 and cross(low[-2], low[-1], p) <= 0:
            low.pop()
        low.append(p)
    for p in reversed(points):
        while len(high) > 1 and cross(high[-2], high[-1], p) <= 0:
            high.pop()
        high.append(p)
    return low[:-1] + high[:-1]


shapes = []
for index in range(1, 15):
    path = ASSETS / f'cutout-{index:02}.webp'
    original = Image.open(path).convert('RGBA')
    crop = CROPS.get(index, (0, 0, 512, 512))
    alpha = original.getchannel('A').crop(crop)
    box = alpha.point(lambda v: 255 if v >= 80 else 0).getbbox()
    left, top, right, bottom = (box[0]+crop[0], box[1]+crop[1], box[2]+crop[0], box[3]+crop[1])
    w, h = right-left, bottom-top
    # Crop surplus lower torso / outer arm rather than stretching faces.
    if h > w / .90:
        bottom = top + round(w / .90)
    elif w > h / .90:
        excess = w - round(h / .90)
        left += excess // 2
        right -= excess - excess // 2
    w, h = right-left, bottom-top
    scale = 464 / max(w, h)
    width, height = w*scale, h*scale
    x, y = (512-width)/2, (512-height)/2
    # Only smooth a new crop or a broad, straight boundary in the source alpha.
    last_rows = original.getchannel('A').crop((left, max(top, bottom-5), right, bottom))
    broad_bottom = sum(last_rows.getpixel((px, last_rows.height-1)) >= 160 for px in range(w)) >= w*.26
    rounded = index in CROPS or broad_bottom
    depth = height * .12 if rounded else 0
    tx, ty = x - left*scale, y - top*scale
    if rounded:
        clip = f'M {x:.4f} {y:.4f} H {x+width:.4f} V {y+height-depth:.4f} Q {x+width/2:.4f} {y+height+depth:.4f} {x:.4f} {y+height-depth:.4f} Z'
    else:
        clip = f'M {x:.4f} {y:.4f} H {x+width:.4f} V {y+height:.4f} H {x:.4f} Z'
    data = base64.b64encode(path.read_bytes()).decode('ascii')
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><clipPath id="silhouette"><path d="{clip}"/></clipPath></defs><g clip-path="url(#silhouette)"><image width="512" height="512" transform="matrix({scale:.8f} 0 0 {scale:.8f} {tx:.6f} {ty:.6f})" href="data:image/webp;base64,{data}"/></g></svg>'
    (ASSETS / f'portrait-{index:02}.svg').write_text(svg, encoding='utf-8')

    pixels = original.getchannel('A')
    points = []
    for sy in range(128):
        py = (sy+.5)*4
        for sx in range(128):
            px = (sx+.5)*4
            if not (x <= px < x+width and y <= py < y+height):
                continue
            if rounded:
                edge = y+height-depth*((px-(x+width/2))/(width/2))**2
                if py > edge:
                    continue
            ox, oy = (px-tx)/scale, (py-ty)/scale
            if 0 <= ox < 512 and 0 <= oy < 512 and pixels.getpixel((int(ox), int(oy))) >= 112:
                points.append((px, py))
    vertices = [((px-256)/256, (py-256)/256) for px, py in hull(points)]
    area2 = cx = cy = 0
    for i, (vx, vy) in enumerate(vertices):
        nx, ny = vertices[(i+1) % len(vertices)]
        a = vx*ny-nx*vy
        area2 += a
        cx += (vx+nx)*a
        cy += (vy+ny)*a
    shapes.append({'vertices': [{'x': round(vx,6), 'y': round(vy,6)} for vx,vy in vertices],
                   'center': {'x': round(cx/(3*area2),6), 'y': round(cy/(3*area2),6)},
                   'roundedBottom': rounded,
                   'portraitBounds': {'width': round(width,2), 'height': round(height,2)}})
    print(f'{index:02}: {width:.0f} x {height:.0f}, curved bottom={rounded}')

js = '/* Portrait crop + curved vector clip; sampled convex collision envelopes. */\n'
js += '(function(root){const shapes='+json.dumps(shapes,separators=(',',':'))
js += ';if(typeof module!=="undefined"&&module.exports)module.exports=shapes;else root.CHARACTER_SHAPES=shapes;})(typeof globalThis!=="undefined"?globalThis:this);\n'
(ASSETS / 'shapes.js').write_text(js, encoding='utf-8')
