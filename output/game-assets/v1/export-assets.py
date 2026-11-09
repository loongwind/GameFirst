"""Export selected image_gen masters with native CoreGraphics; Pillow only inspects."""
import runpy
from pathlib import Path as _Path
if (_Path(__file__).resolve().parent / 'production-round2.json').exists():
    runpy.run_path(str(_Path(__file__).resolve().parent / 'reexport-selected.py'), run_name='__main__')
    raise SystemExit(0)
from pathlib import Path
from PIL import Image
import csv, subprocess, shutil, json

root = Path(__file__).resolve().parent
workspace = root.parents[2]
src = Path('/Users/loongwind/multica_workspaces_desktop-api.multica.ai/loongwind-725f0f8a0031/loo-45-3e12b2487fae/codex-home/generated_images/01a1bff8-a6c9-7da1-bb00-19c2b48d2fa1')
masters = {
    'hero_ship': 'exec-8103da6e-4d47-4a39-935f-5354181bbc3e.png',
    'bg_sunlight_lite': 'exec-212446ea-d209-4221-8057-fbf24d46b71c.png',
    'enemy_normal_01_moon_jelly': 'exec-d90a9328-f942-4be7-972b-c4e7c6f9f5cb.png',
    'enemy_normal_02_lantern_angler': 'exec-6a3bae5a-2112-4e91-9eb7-b0758ff72295.png',
    'enemy_normal_03_electric_eel': 'exec-56173163-437f-45d6-8126-bc9e85da3b37.png',
    'icon_oxygen': 'exec-c823e86e-655c-45e5-a71d-499703e473c9.png',
    'icon_crystal': 'exec-8e11df00-b1e9-4156-82d7-30e2f27b9976.png',
}
rows = list(csv.DictReader(open(workspace / 'docs/潜渊猎手-完整素材清单.csv', encoding='utf-8-sig')))
index, checks = [], []
for line, r in enumerate(rows, 2):
    rec = {'csv_line': line, **r, 'batch': 'A' if r['id'] in masters or r['id'] == 'ui_button_primary' else ('E' if r['阶段'] == 'P1' else 'B/C/D待续'), 'status': 'deferred_P1' if r['阶段'] == 'P1' else 'pending', 'actual_size': '', 'alpha_check': '', 'path': '', 'source_master': '', 'prompt_key': r['id'], 'production_version': 'v1'}
    if r['id'] in masters:
        master = root / 'source-masters' / r['文件名']
        master.parent.mkdir(parents=True, exist_ok=True)
        if not master.exists():
            shutil.copy2(src / masters[r['id']], master)
        dest = root / r['资源包'] / r['文件名']
        dest.parent.mkdir(parents=True, exist_ok=True)
        w, h = int(r['宽px']), int(r['高px'])
        source = Image.open(master)
        assert source.width / source.height == w / h
        subprocess.run(['swift', str(root / 'export-png.swift'), str(master), str(dest), str(w), str(h), '8' if r['透明'] == '是' else '0'], check=True, capture_output=True)
        final = Image.open(dest)
        assert final.size == (w, h)
        ck = {'id': r['id'], 'size': list(final.size), 'mode': final.mode, 'srgb_profile': bool(final.info.get('icc_profile')) or 'srgb' in final.info, 'bytes': dest.stat().st_size}
        assert ck['srgb_profile']
        if r['透明'] == '是':
            a = final.getchannel('A')
            bb = a.getbbox()
            margin = min(bb[0], bb[1], w - bb[2], h - bb[3])
            assert margin >= 8, (r['id'], margin)
            assert a.getextrema()[0] == 0 and a.getextrema()[1] > 240
            ck.update(alpha_extrema=a.getextrema(), alpha_bbox=bb, clear_margin_px=margin)
        else:
            assert final.mode == 'RGB' or final.getchannel('A').getextrema() == (255, 255)
        checks.append(ck)
        rec.update(status='technical_pass_visual_pending', actual_size=f'{w}x{h}', alpha_check='pass', path=str(dest.relative_to(root)), source_master=str(master.relative_to(root)))
    if r['id'] == 'ui_button_primary':
        rec.update(status='failed_rework', alpha_check='center_holes_or_wrong_primary_color')
    index.append(rec)
with open(root / 'asset-index.csv', 'w', encoding='utf-8-sig', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=index[0].keys())
    writer.writeheader()
    writer.writerows(index)
(root / 'technical-checks.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding='utf-8')
rejected = root / 'rejected'
rejected.mkdir(exist_ok=True)
for key, name in [('cyan_attempt_1', 'exec-5f36f41c-d67d-46aa-86e8-dab2fa1ff126.png'), ('cyan_attempt_2', 'exec-e5c555bd-2928-4698-844f-ae2d5c14ae72.png'), ('navy_candidate', 'exec-fdbd4ea3-89df-420a-aa95-432350bd9b35.png')]:
    shutil.copy2(src / name, rejected / (key + '.png'))
print(json.dumps(checks, ensure_ascii=False, indent=2))
