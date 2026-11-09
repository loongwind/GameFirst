"""Measure generated cutouts; CoreGraphics resamples, preserves alpha and places roots."""
from pathlib import Path
import csv,json,subprocess
from PIL import Image
root=Path(__file__).resolve().parent
rows=list(csv.DictReader((root/'asset-index.csv').open(encoding='utf-8-sig')))
by_id={r['id']:r for r in rows}
checks={r['id']:r for r in json.loads((root/'technical-checks.json').read_text())}
# Hand-inspected centers of the opaque overlap caps; source coordinates are top-left.
roots={
 'enemy_boss_01_angler_king_tentacle':[550.,265.],
 'enemy_boss_02_tentacle_warden_tentacle':[625.,224.],
 'enemy_boss_03_giant_squid_tentacle':[625.,205.],
 'enemy_boss_04_abyss_whale_tentacle':[778.,182.],
}
(root/'boss-layouts').mkdir(exist_ok=True)
for rec in json.loads((root/'production-round9.json').read_text())['records']:
 if rec.get('status')=='rejected' or rec.get('export_kind')!='boss_part':continue
 r=by_id[rec['id']];master=root/'source-masters'/(r['id']+'.png')
 if r['status']=='self_check_pass':continue
 im=Image.open(master);a=im.getchannel('A');b=a.point(lambda v:255 if v>2 else 0).getbbox()
 x0,y0=max(0,b[0]-8),max(0,b[1]-8);x1,y1=min(im.width,b[2]+8),min(im.height,b[3]+8)
 an=roots[r['id']];assert a.getpixel(tuple(map(int,an)))>200
 scale=min(248/(an[0]-x0),248/(x1-an[0]),43.2/(an[1]-y0),452.8/(y1-an[1]))
 layout={'id':r['id'],'source_root':an,'crop':[x0,y0,x1-x0,y1-y0],'scale':scale,'frame_size':[512,512],'target_root_top_left':[256,51.2],'cocos_anchor_bottom_left':[.5,.9]}
 lp=root/'boss-layouts'/(r['id']+'.json');lp.write_text(json.dumps(layout,indent=2)+'\n')
 dest=root/r['资源包']/r['文件名']
 subprocess.run(['swift',str(root/'export-boss-part.swift'),str(master),str(lp),str(dest)],check=True,capture_output=True)
 final=Image.open(dest);fa=final.getchannel('A');bb=fa.getbbox();margin=min(bb[0],bb[1],512-bb[2],512-bb[3]);assert margin>=8
 assert fa.getpixel((256,51))>200
 checks[r['id']]={'id':r['id'],'size':[512,512],'srgb_profile':bool(final.info.get('icc_profile')),'alpha_extrema':fa.getextrema(),'alpha_bbox':bb,'clear_margin_px':margin,'bytes':dest.stat().st_size,'root_alpha':fa.getpixel((256,51)),'cocos_anchor':[.5,.9]}
 r.update(status='technical_pass_visual_pending',path=str(dest.relative_to(root)),source_master=str(master.relative_to(root)),actual_size='512x512',alpha_check='pass',production_version='v1-r9',export_kind='boss_part',export_crop=','.join(map(str,layout['crop'])),export_inset='8')
 print(r['id'],round(scale,4),'root alpha',fa.getpixel((256,51)),'margin',margin)
with (root/'asset-index.csv').open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.DictWriter(f,fieldnames=rows[0].keys());w.writeheader();w.writerows(rows)
(root/'technical-checks.json').write_text(json.dumps(list(checks.values()),ensure_ascii=False,indent=2)+'\n')
