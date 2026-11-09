"""Export round four generated masters; Pillow is used only for measurement."""
from pathlib import Path
import csv, json, shutil, subprocess, hashlib
from PIL import Image, ImageStat
root = Path(__file__).resolve().parent
records = json.loads((root/'production-round4.json').read_text())['records']
if (root/'production-round4-c.json').exists():
    records += json.loads((root/'production-round4-c.json').read_text())['records']
index = list(csv.DictReader((root/'asset-index.csv').open(encoding='utf-8-sig')))
rows = {r['id']:r for r in index}
checks = {r['id']:r for r in json.loads((root/'technical-checks.json').read_text())}
exported=0
for rec in records:
    if rec.get('status') == 'rejected':
        shutil.copy2(rec['source'],root/'rejected'/(rec['id']+'-r4.png'))
        continue
    r = rows[rec['id']]
    if r['production_version']=='v1-r4' and r['status']=='self_check_pass': continue
    master = root/'source-masters'/r['文件名']
    if not master.exists(): shutil.copy2(rec['source'],master)
    dest = root/r['资源包']/r['文件名']
    dest.parent.mkdir(parents=True,exist_ok=True)
    w,h = int(r['宽px']),int(r['高px'])
    source = Image.open(master)
    if r['透明']=='是':
        bb = source.getchannel('A').point(lambda v:255 if v>8 else 0).getbbox()
        # Retain a source-space antialias fringe for standard aspect-fit export.
        pad = 0 if r['id'] in ('ui_panel','ui_bar_track') else 8
        x0,y0=max(0,bb[0]-pad),max(0,bb[1]-pad)
        x1,y1=min(source.width,bb[2]+pad),min(source.height,bb[3]+pad)
        crop=[x0,y0,x1-x0,y1-y0]
    else: crop=[0,0,source.width,source.height]
    if r['id'] in ('ui_panel','ui_bar_track'):
        kind='ui_panel_sampled' if r['id']=='ui_panel' else 'ui_track'
        args=['swift',str(root/'export-ui-sampled.swift'),str(master),str(dest),'panel' if kind=='ui_panel_sampled' else 'track',*map(str,crop)]
    else:
        kind='standard'
        alignment='left' if r['id']=='reef_harbor_left' else ('right' if r['id']=='reef_harbor_right' else 'center')
        args=['swift',str(root/'export-png.swift'),str(master),str(dest),str(w),str(h),'8' if r['透明']=='是' else '0',*map(str,crop),alignment]
    subprocess.run(args,check=True,capture_output=True)
    im=Image.open(dest);alpha=im.getchannel('A')
    assert im.size==(w,h)
    assert im.info.get('icc_profile') or 'srgb' in im.info
    ck={'id':r['id'],'size':list(im.size),'mode':im.mode,'srgb_profile':True,'bytes':dest.stat().st_size,'alpha_extrema':alpha.getextrema()}
    if r['透明']=='是':
        b=alpha.getbbox();margin=min(b[0],b[1],w-b[2],h-b[3])
        assert margin>=8,(r['id'],margin)
        assert alpha.getextrema()[0]==0
        ck.update(alpha_bbox=b,clear_margin_px=margin)
    else: assert alpha.getextrema()==(255,255)
    if kind=='ui_panel_sampled':
        c=im.crop((24,24,104,104))
        ck.update(nine_slice_insets=[24]*4,center_channel_extrema=c.getextrema(),center_channel_stddev=ImageStat.Stat(c).stddev)
        assert all(lo==hi for lo,hi in c.getextrema())
        assert c.getchannel('A').getextrema()[0]>=250
    if kind=='ui_track': ck['nine_slice_insets']=[12,8,12,8]
    if r['id']=='ui_joystick_base':
        center_alpha=alpha.crop((80,80,176,176)).getextrema()
        assert center_alpha[1]<=1
        ck['center_alpha_extrema']=center_alpha
    checks[r['id']]=ck
    r.update(status='technical_pass_visual_pending',actual_size=f'{w}x{h}',alpha_check='pass',path=str(dest.relative_to(root)),source_master=str(master.relative_to(root)),prompt_key=r['id'],production_version='v1-r4',export_crop=','.join(map(str,crop)),export_alignment=alignment if kind=='standard' else 'center',export_kind=kind,export_inset='8' if r['透明']=='是' else '0')
    exported+=1
with (root/'asset-index.csv').open('w',encoding='utf-8-sig',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=index[0].keys());writer.writeheader();writer.writerows(index)
(root/'technical-checks.json').write_text(json.dumps(list(checks.values()),ensure_ascii=False,indent=2))
baseline=json.loads((root/'baseline-r3-sha256.json').read_text())
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==sha for p,sha in baseline.items())
print(f'Exported {exported} new assets; preserved {len(baseline)} previous PNGs byte for byte.')
