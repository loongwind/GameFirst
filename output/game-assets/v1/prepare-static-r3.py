"""Export new identity baselines; Pillow only measures source bounds."""
from pathlib import Path
from PIL import Image
import csv,json,subprocess,shutil
root=Path(__file__).resolve().parent
records=json.loads((root/'production-round3.json').read_text())['records']
rows=list(csv.DictReader((root/'asset-index.csv').open(encoding='utf-8-sig')));by_id={r['id']:r for r in rows}
checks={r['id']:r for r in json.loads((root/'technical-checks.json').read_text())}
for r in rows:r.setdefault('export_inset', '0' if r['透明']=='否' or r['export_kind']=='ui_bar' else ('2' if r['export_kind']=='swim_strip' else '8'))
for item in records:
    if item['export_kind']!='standard':continue
    r=by_id[item['id']];master=root/'source-masters'/r['文件名']
    if not master.exists():shutil.copy2(item['source'],master)
    im=Image.open(master);bb=im.getchannel('A').point(lambda v:255 if v>2 else 0).getbbox()
    crop=[max(0,bb[0]-8),max(0,bb[1]-8),min(im.width,bb[2]+8),min(im.height,bb[3]+8)]
    crop=[crop[0],crop[1],crop[2]-crop[0],crop[3]-crop[1]]
    dest=root/r['资源包']/r['文件名']
    subprocess.run(['swift',str(root/'export-png.swift'),str(master),str(dest),'192','192','24',*map(str,crop),'center'],check=True,capture_output=True)
    final=Image.open(dest);a=final.getchannel('A');b=a.getbbox();margin=min(b[0],b[1],192-b[2],192-b[3]);assert margin>=8
    r.update(status='technical_pass_visual_pending',actual_size='192x192',path=str(dest.relative_to(root)),source_master=str(master.relative_to(root)),alpha_check='pass',export_crop=','.join(map(str,crop)),export_alignment='center',export_kind='standard',export_inset='24',production_version='v1-r3')
    checks[r['id']]={'id':r['id'],'size':[192,192],'mode':final.mode,'srgb_profile':bool(final.info.get('icc_profile')) or 'srgb' in final.info,'bytes':dest.stat().st_size,'alpha_extrema':a.getextrema(),'alpha_bbox':b,'clear_margin_px':margin}
    print(r['id'], 'margin',margin)
with (root/'asset-index.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=rows[0].keys());w.writeheader();w.writerows(rows)
(root/'technical-checks.json').write_text(json.dumps(list(checks.values()),ensure_ascii=False,indent=2),encoding='utf-8')
