"""Re-export saved production masters without regenerating or redrawing assets."""
from pathlib import Path
import csv, json, subprocess, hashlib
from PIL import Image

root = Path(__file__).resolve().parent
rows = list(csv.DictReader((root / 'asset-index.csv').open(encoding='utf-8-sig')))
for r in rows:
    if not r['path'] or not r['source_master']:
        continue
    dest = root / r['path']
    previous = hashlib.sha256(dest.read_bytes()).hexdigest() if dest.exists() else ''
    args = ['swift', str(root / 'export-png.swift'), str(root / r['source_master']), str(dest), r['宽px'], r['高px'], '8' if r['透明'] == '是' else '0']
    if r.get('export_crop'):
        args += r['export_crop'].split(',') + [r['export_alignment']]
    subprocess.run(args, check=True, capture_output=True)
    im = Image.open(dest)
    assert im.size == (int(r['宽px']), int(r['高px']))
    assert im.info.get('icc_profile') or 'srgb' in im.info
    alpha = im.getchannel('A')
    if r['透明'] == '是':
        bb = alpha.getbbox()
        assert min(bb[0], bb[1], im.width-bb[2], im.height-bb[3]) >= 8
        assert alpha.getextrema()[0] == 0
    else:
        assert alpha.getextrema() == (255, 255)
    current = hashlib.sha256(dest.read_bytes()).hexdigest()
    if current != previous:
        r['status'] = 'technical_pass_visual_pending'
with (root / 'asset-index.csv').open('w', encoding='utf-8-sig', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
print('Saved masters re-exported; changed images require visual recheck.')
