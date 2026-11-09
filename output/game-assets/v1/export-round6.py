"""Export round-six selected image_gen masters, preserving earlier production PNGs."""
from pathlib import Path
from PIL import Image,ImageStat
import csv,json,hashlib,shutil,subprocess
root=Path(__file__).resolve().parent
records=json.loads((root/'production-round6.json').read_text())['records']
index=list(csv.DictReader((root/'asset-index.csv').open(encoding='utf-8-sig')))
rows={r['id']:r for r in index}
checks={c['id']:c for c in json.loads((root/'technical-checks.json').read_text())}
exported=[]
skin_slices={'ui_button_secondary':[32,24,32,24],'ui_slot':[24,24,24,24],'ui_toast':[24,16,24,16]}
for rec in records:
    if rec.get('status')=='rejected':
        target=root/'rejected'/(rec['id']+'-r5.png')
        if not target.exists():shutil.copy2(rec['source'],target)
        continue
    r=rows[rec['id']]
    if r['production_version']=='v1-r6' and r['status'] in ('self_check_pass','technical_pass_visual_pending'):continue
    master=root/rec.get('source_master',str(Path('source-masters')/r['文件名']))
    if not master.exists():shutil.copy2(rec['source'],master)
    im=Image.open(master)
    crop=rec.get('export_crop')
    if crop is None:
        b=im.getchannel('A').point(lambda v:255 if v>8 else 0).getbbox()
        pad=0 if r['id'] in skin_slices else 8
        x0,y0=max(0,b[0]-pad),max(0,b[1]-pad)
        x1,y1=min(im.width,b[2]+pad),min(im.height,b[3]+pad)
        crop=[x0,y0,x1-x0,y1-y0]
    dest=root/r['资源包']/r['文件名'];dest.parent.mkdir(parents=True,exist_ok=True)
    w,h=int(r['宽px']),int(r['高px'])
    kind='ui_skin_r6' if r['id'] in skin_slices else 'standard'
    if kind=='ui_skin_r6':
        args=['swift',str(root/'export-ui-skin-r6.swift'),str(master),str(dest),str(w),str(h),*map(str,skin_slices[r['id']]),*map(str,crop)]
    else:
        args=['swift',str(root/'export-png.swift'),str(master),str(dest),str(w),str(h),'8',*map(str,crop),'center']
    subprocess.run(args,check=True,capture_output=True)
    final=Image.open(dest);a=final.getchannel('A');b=a.getbbox()
    margin=min(b[0],b[1],w-b[2],h-b[3])
    assert final.size==(w,h)
    assert final.info.get('icc_profile') or 'srgb' in final.info
    assert a.getextrema()[0]==0 and a.getextrema()[1]>=200
    assert margin>=8,(r['id'],margin)
    checks[r['id']]={'id':r['id'],'size':[w,h],'mode':final.mode,'srgb_profile':True,'bytes':dest.stat().st_size,'alpha_extrema':a.getextrema(),'alpha_bbox':b,'clear_margin_px':margin,'generation_method':rec['method']}
    if kind=='ui_skin_r6':
        l,t,rr,bb=skin_slices[r['id']];c=final.crop((l,t,w-rr,h-bb))
        assert all(lo==hi for lo,hi in c.getextrema())
        assert c.getchannel('A').getextrema()[0]>=250
        checks[r['id']].update(nine_slice_insets=skin_slices[r['id']],center_channel_extrema=c.getextrema(),center_channel_stddev=ImageStat.Stat(c).stddev)
    if r['id'].startswith('frame_'):
        ca=a.crop((24,24,104,104)).getextrema()
        assert ca[1]<=2,(r['id'],ca)
        checks[r['id']].update(nine_slice_insets=[24]*4,center_alpha_extrema=ca)
    r.update(status='technical_pass_visual_pending',actual_size=f'{w}x{h}',alpha_check='pass',path=str(dest.relative_to(root)),source_master=str(master.relative_to(root)),prompt_key=r['id'],production_version='v1-r6',export_crop=','.join(map(str,crop)),export_alignment='center',export_kind=kind,export_inset='8')
    if rec.get('reuse_of') and 'r6同母版' not in r['备注']:
        r['备注']+='；r6同母版尺寸导出，复用'+rec['reuse_of']+'，未重新设计/生成'
    exported.append(r['id'])
baseline=json.loads((root/'baseline-r5-sha256.json').read_text())
assert len(baseline)==69
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==h for p,h in baseline.items())
with (root/'asset-index.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=index[0]);w.writeheader();w.writerows(index)
(root/'technical-checks.json').write_text(json.dumps(list(checks.values()),ensure_ascii=False,indent=2))
print('Exported:',', '.join(exported))
print('69 previous production PNG hashes unchanged.')
