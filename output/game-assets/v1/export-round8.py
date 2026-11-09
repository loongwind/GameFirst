"""Persist image_gen masters and export r8 art with CoreGraphics; Pillow inspects only."""
from pathlib import Path
import csv, hashlib, json, shutil, subprocess
from PIL import Image

root = Path(__file__).resolve().parent
records = json.loads((root / 'production-round8.json').read_text())['records']
rows = list(csv.DictReader((root / 'asset-index.csv').open(encoding='utf-8-sig')))
lookup = {r['id']: r for r in rows}
checks = {r['id']: r for r in json.loads((root / 'technical-checks.json').read_text())}
for record in records:
    if record.get('status') == 'rejected' or record.get('export_kind') == 'swim_strip':
        continue
    r = lookup[record['id']]
    if r['status'] == 'self_check_pass':
        continue
    master = root / 'source-masters' / record.get('master_filename', r['文件名'])
    if not master.exists():
        shutil.copy2(record['source'], master)
    dest = root / r['资源包'] / r['文件名']
    dest.parent.mkdir(parents=True, exist_ok=True)
    w, h = int(r['宽px']), int(r['高px'])
    inset = (24 if r['id'].startswith('enemy_normal_') else 8) if r['透明'] == '是' else 0
    alignment = 'left' if r['id'].endswith('_left') else ('right' if r['id'].endswith('_right') else 'center')
    source = Image.open(master)
    crop = (0, 0, source.width, source.height)
    if inset:
        assert 'A' in source.getbands(), (r['id'], 'missing alpha')
        bb = source.getchannel('A').point(lambda v: 255 if v > 2 else 0).getbbox()
        assert bb, r['id']
        x0, y0 = max(0, bb[0]-8), max(0, bb[1]-8)
        x1, y1 = min(source.width, bb[2]+8), min(source.height, bb[3]+8)
        crop = (x0, y0, x1-x0, y1-y0)
    args = ['swift', str(root/'export-png.swift'), str(master), str(dest), str(w), str(h), str(inset), *map(str, crop), alignment]
    subprocess.run(args, check=True, capture_output=True)
    final = Image.open(dest)
    assert final.size == (w,h), r['id']
    assert final.info.get('icc_profile') or 'srgb' in final.info, r['id']
    alpha = final.getchannel('A')
    ck = {'id':r['id'], 'size':[w,h], 'mode':final.mode, 'srgb_profile':True, 'bytes':dest.stat().st_size, 'alpha_extrema':alpha.getextrema()}
    if inset:
        bb = alpha.getbbox()
        margin = min(bb[0],bb[1],w-bb[2],h-bb[3])
        assert margin >= 8, (r['id'], margin)
        assert alpha.getextrema()[0] == 0 and alpha.getextrema()[1] >= 200
        ck.update(alpha_bbox=bb, clear_margin_px=margin)
    else:
        assert alpha.getextrema() == (255,255)
    checks[r['id']] = ck
    r.update(status='technical_pass_visual_pending', actual_size=f'{w}x{h}', alpha_check='pass', path=str(dest.relative_to(root)), source_master=str(master.relative_to(root)), prompt_key=r['id'], production_version='v1-r8', export_crop=','.join(map(str,crop)), export_alignment=alignment, export_kind='standard', export_inset=str(inset))
with (root/'asset-index.csv').open('w',encoding='utf-8-sig',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=rows[0].keys());writer.writeheader();writer.writerows(rows)
(root/'technical-checks.json').write_text(json.dumps(list(checks.values()),ensure_ascii=False,indent=2)+'\n')
baseline=json.loads((root/'baseline-r8-sha256.json').read_text())
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==v for p,v in baseline.items())
print(f'R8 records: {len(records)}; previous {len(baseline)} production PNG hashes preserved.')
