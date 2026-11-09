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
    kind = r.get('export_kind', 'standard')
    if kind == 'ui_skin_r6':
        slices = {'ui_button_secondary':[32,24,32,24],'ui_slot':[24,24,24,24],'ui_toast':[24,16,24,16]}[r['id']]
        args = ['swift', str(root / 'export-ui-skin-r6.swift'), str(root / r['source_master']), str(dest), r['宽px'], r['高px'], *map(str,slices), *r['export_crop'].split(',')]
    elif kind in ('ui_panel_sampled', 'ui_track'):
        args = ['swift', str(root / 'export-ui-sampled.swift'), str(root / r['source_master']), str(dest), 'panel' if kind == 'ui_panel_sampled' else 'track', *r['export_crop'].split(',')]
    elif kind == 'ui_bar':
        args = ['swift', str(root / 'export-ui-bar.swift'), str(root / r['source_master']), str(dest), *r['export_crop'].split(',')]
    elif kind == 'swim_strip':
        script = 'export-elite-swim.swift' if r['高px'] == '320' else 'export-swim.swift'
        args = ['swift', str(root / script), str(root / r['source_master']), str(root / 'animation-layouts' / (r['id'] + '.json')), str(dest)]
    elif kind == 'boss_part':
        args = ['swift', str(root / 'export-boss-part.swift'), str(root / r['source_master']), str(root / 'boss-layouts' / (r['id'] + '.json')), str(dest)]
    else:
        args = ['swift', str(root / 'export-png.swift'), str(root / r['source_master']), str(dest), r['宽px'], r['高px'], r.get('export_inset') or ('8' if r['透明'] == '是' else '0')]
        if r.get('export_crop'):
            args += r['export_crop'].split(',') + [r['export_alignment']]
    subprocess.run(args, check=True, capture_output=True)
    im = Image.open(dest)
    assert im.size == (int(r['宽px']), int(r['高px']))
    assert im.info.get('icc_profile') or 'srgb' in im.info
    alpha = im.getchannel('A')
    if r['透明'] == '是':
        if kind == 'swim_strip':
            size = im.width // 4
            for i in range(4):
                bb = alpha.crop((i*size,0,(i+1)*size,size)).getbbox()
                assert min(bb[0],bb[1],size-bb[2],size-bb[3]) >= 2
        elif kind == 'ui_bar':
            assert alpha.crop((0,0,128,1)).getextrema()[1] > 0
            assert alpha.crop((0,15,128,16)).getextrema()[1] > 0
        else:
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
