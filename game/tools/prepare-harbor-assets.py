"""Prepare bounded-resolution Cocos copies; keep delivered source art untouched.
Requires Pillow. Run from any directory. UI icons keep original pixels.
"""
from pathlib import Path
from PIL import Image
import hashlib
import json

root = Path(__file__).resolve().parents[2]
source = root / 'output/game-assets/v1/meta'
target = root / 'game/assets/bundles/meta/ui'
records = []
for output in sorted(target.glob('*.png')):
    original = source / output.name
    with Image.open(original) as image:
        # At 375 logical px these allow 2x raster resolution, plus margin for framing.
        max_edge = 1125 if output.stem == 'bg_harbor_far' else 512 if output.stem == 'hero_h01_harbor' else 768 if output.stem.startswith('deco_') else max(image.size)
        image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
        image.save(output, optimize=True)
        records.append({'name': output.name, 'sourceSha256': hashlib.sha256(original.read_bytes()).hexdigest(), 'width': image.width, 'height': image.height, 'bytes': output.stat().st_size})
(root / 'game/harbor-assets.json').write_text(json.dumps({'source': 'output/game-assets/v1/meta', 'textureBudgetBytes': 16 * 1024 * 1024, 'bundleBudgetBytes': 3 * 1024 * 1024, 'assets': records}, indent=2) + '\n')
print('UI bytes:', sum(r['bytes'] for r in records), 'RGBA texture bytes:', sum(r['width'] * r['height'] * 4 for r in records))
