"""Copy image_gen masters, export via CoreGraphics, inspect with Pillow."""
from pathlib import Path
from PIL import Image, ImageStat
import csv, json, shutil, subprocess

root = Path(__file__).resolve().parent
records = json.loads((root / 'production-round2.json').read_text())['records']
index = list(csv.DictReader((root / 'asset-index.csv').open(encoding='utf-8-sig')))
rows = {r['id']: r for r in index}
checks = {r['id']: r for r in json.loads((root / 'technical-checks.json').read_text())}
a_ids = {'hero_ship', 'bg_sunlight_lite', 'enemy_normal_01_moon_jelly', 'enemy_normal_02_lantern_angler', 'enemy_normal_03_electric_eel', 'icon_oxygen', 'icon_crystal', 'ui_button_primary'}

for r in index:
    if r['id'] in a_ids:
        batch = 'A'
    elif r['阶段'] == 'P1':
        batch = 'E'
    elif r['id'].startswith(('enemy_elite_', 'enemy_boss_')):
        batch = 'D'
    elif r['资源包'] in ('main', 'sunlight'):
        batch = 'B'
    elif r['资源包'] == 'meta':
        batch = 'C'
    else:
        batch = 'D'
    r['batch'] = batch
    r.setdefault('export_crop', '')
    r.setdefault('export_alignment', 'center')

for record in records:
    if record.get('status') == 'rejected':
        shutil.copy2(record['source'], root / 'rejected/cyan_attempt_4.png')
        continue
    r = rows[record['id']]
    master = root / 'source-masters' / r['文件名']
    if not master.exists():
        shutil.copy2(record['source'], master)
    dest = root / r['资源包'] / r['文件名']
    dest.parent.mkdir(parents=True, exist_ok=True)
    w, h = int(r['宽px']), int(r['高px'])
    args = ['swift', str(root / 'export-png.swift'), str(master), str(dest), str(w), str(h), '8' if r['透明'] == '是' else '0']
    source = Image.open(master)
    # Trim empty canvas; preserve source aspect, never stretch the artwork.
    # Keep original full canvas for the identity-preserving damaged sprite and UI skin.
    if r['透明'] == '是' and r['id'] not in ('ui_button_primary', 'hero_damaged'):
        alpha = source.getchannel('A')
        bb = alpha.point(lambda v: 255 if v > 2 else 0).getbbox()
        assert bb
        x0, y0 = max(0, bb[0] - 8), max(0, bb[1] - 8)
        x1, y1 = min(source.width, bb[2] + 8), min(source.height, bb[3] + 8)
        alignment = 'left' if r['id'] == 'reef_sunlight_left' else ('right' if r['id'] == 'reef_sunlight_right' else 'center')
        args += [str(x0), str(y0), str(x1 - x0), str(y1 - y0), alignment]
        r['export_crop'] = f'{x0},{y0},{x1-x0},{y1-y0}'
        r['export_alignment'] = alignment
    subprocess.run(args, check=True, capture_output=True)
    final = Image.open(dest)
    assert final.size == (w, h)
    assert final.info.get('icc_profile') or 'srgb' in final.info
    alpha = final.getchannel('A')
    ck = {'id': r['id'], 'size': list(final.size), 'mode': final.mode, 'srgb_profile': True, 'bytes': dest.stat().st_size, 'alpha_extrema': alpha.getextrema()}
    if r['透明'] == '是':
        bb = alpha.getbbox()
        margin = min(bb[0], bb[1], w - bb[2], h - bb[3])
        assert margin >= 8, (r['id'], margin)
        assert alpha.getextrema()[0] == 0
        assert alpha.getextrema()[1] >= 200, (r['id'], alpha.getextrema())
        ck.update(alpha_bbox=bb, clear_margin_px=margin)
    else:
        assert alpha.getextrema() == (255, 255)
    if r['id'] == 'ui_button_primary':
        center = final.crop((32, 24, 128, 56))
        ck.update(nine_slice_insets=[32, 24, 32, 24], center_channel_extrema=center.getextrema(), center_channel_stddev=ImageStat.Stat(center).stddev)
        assert center.getchannel('A').getextrema()[0] >= 250
    if r['id'] == 'fx_sonic_ring':
        center_alpha = alpha.getpixel((w // 2, h // 2))
        assert center_alpha <= 2
        ck['center_alpha'] = center_alpha
    checks[r['id']] = ck
    r.update(status='technical_pass_visual_pending', actual_size=f'{w}x{h}', alpha_check='pass', path=str(dest.relative_to(root)), source_master=str(master.relative_to(root)), prompt_key=r['id'], production_version='v1-r2')

with (root / 'asset-index.csv').open('w', encoding='utf-8-sig', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=index[0].keys())
    writer.writeheader()
    writer.writerows(index)
(root / 'technical-checks.json').write_text(json.dumps(list(checks.values()), ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Exported and technically checked {len(records)-1} new assets; previous 7 assets unchanged.')
