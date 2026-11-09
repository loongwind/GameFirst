"""Export round-five selected image_gen masters, preserving earlier production PNGs."""
from pathlib import Path
from PIL import Image
import csv,json,hashlib,shutil,subprocess
root=Path(__file__).resolve().parent
records=json.loads((root/'production-round5.json').read_text())['records']
index=list(csv.DictReader((root/'asset-index.csv').open(encoding='utf-8-sig')))
rows={r['id']:r for r in index}
checks={c['id']:c for c in json.loads((root/'technical-checks.json').read_text())}
exported=[]
for rec in records:
    if rec.get('status')=='rejected':
        target=root/'rejected'/(rec['id']+'-r5.png')
        if not target.exists():shutil.copy2(rec['source'],target)
        continue
    r=rows[rec['id']]
    if r['production_version']=='v1-r5' and r['status']=='self_check_pass':continue
    master=root/rec.get('source_master',str(Path('source-masters')/r['文件名']))
    if not master.exists():shutil.copy2(rec['source'],master)
    im=Image.open(master)
    crop=rec.get('export_crop')
    if crop is None:
        b=im.getchannel('A').point(lambda v:255 if v>8 else 0).getbbox()
        x0,y0=max(0,b[0]-8),max(0,b[1]-8)
        x1,y1=min(im.width,b[2]+8),min(im.height,b[3]+8)
        crop=[x0,y0,x1-x0,y1-y0]
    dest=root/r['资源包']/r['文件名'];dest.parent.mkdir(parents=True,exist_ok=True)
    w,h=int(r['宽px']),int(r['高px'])
    args=['swift',str(root/'export-png.swift'),str(master),str(dest),str(w),str(h),'8',*map(str,crop),'center']
    subprocess.run(args,check=True,capture_output=True)
    final=Image.open(dest);a=final.getchannel('A');b=a.getbbox()
    margin=min(b[0],b[1],w-b[2],h-b[3])
    assert final.size==(w,h)
    assert final.info.get('icc_profile') or 'srgb' in final.info
    assert a.getextrema()[0]==0 and a.getextrema()[1]>=200
    assert margin>=8,(r['id'],margin)
    checks[r['id']]={'id':r['id'],'size':[w,h],'mode':final.mode,'srgb_profile':True,'bytes':dest.stat().st_size,'alpha_extrema':a.getextrema(),'alpha_bbox':b,'clear_margin_px':margin,'generation_method':rec['method']}
    r.update(status='technical_pass_visual_pending',actual_size=f'{w}x{h}',alpha_check='pass',path=str(dest.relative_to(root)),source_master=str(master.relative_to(root)),prompt_key=r['id'],production_version='v1-r5',export_crop=','.join(map(str,crop)),export_alignment='center',export_kind='standard',export_inset='8')
    if rec.get('reuse_of') and 'r5同母版' not in r['备注']:
        r['备注']+='；r5同母版尺寸导出，复用'+rec['reuse_of']+'，未重新设计/生成'
    exported.append(r['id'])
baseline=json.loads((root/'baseline-r4-sha256.json').read_text())
assert len(baseline)==58
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==h for p,h in baseline.items())
with (root/'asset-index.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=index[0]);w.writeheader();w.writerows(index)
(root/'technical-checks.json').write_text(json.dumps(list(checks.values()),ensure_ascii=False,indent=2))
print('Exported:',', '.join(exported))
print('58 previous production PNG hashes unchanged.')
