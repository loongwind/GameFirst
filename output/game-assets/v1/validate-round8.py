"""Verify cumulative PNG contracts and reproduce only the selected r8 exports."""
from pathlib import Path
from collections import Counter
import csv, hashlib, json, subprocess, sys, tempfile
from PIL import Image
root=Path(__file__).resolve().parent
expected=int(sys.argv[1])
rows=list(csv.DictReader((root/'asset-index.csv').open(encoding='utf-8-sig')))
baseline=json.loads((root/'baseline-r8-sha256.json').read_text())
assert len(rows)==185 and len(baseline)==116
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==v for p,v in baseline.items())
passed=[r for r in rows if r['status']=='self_check_pass']
new=[r for r in passed if r['production_version']=='v1-r8']
assert len(new)==expected,(len(new),expected)
assert len(passed)==116+expected
assert sum(r['status']=='pending' and r['阶段']=='MVP' for r in rows)==51-expected
assert sum(r['status']=='deferred_P1' for r in rows)==18
assert all(r['status'] in ('self_check_pass','pending','deferred_P1') for r in rows)
for r in passed:
    im=Image.open(root/r['path']);w,h=int(r['宽px']),int(r['高px'])
    assert im.size==(w,h),(r['id'],im.size)
    assert im.info.get('icc_profile') or 'srgb' in im.info
    alpha=im.getchannel('A')
    if r['透明']=='否':assert alpha.getextrema()==(255,255)
    elif r['export_kind']=='swim_strip':
        size=w//4;assert h==size
        for i in range(4):
            bb=alpha.crop((i*size,0,(i+1)*size,size)).getbbox()
            assert min(bb[0],bb[1],size-bb[2],size-bb[3])>=2
    elif r['export_kind']=='ui_bar':
        assert alpha.crop((0,0,w,1)).getextrema()[1]>0
        assert alpha.crop((0,h-1,w,h)).getextrema()[1]>0
    else:
        bb=alpha.getbbox();assert min(bb[0],bb[1],w-bb[2],h-bb[3])>=8
        assert alpha.getextrema()[0]==0
records=json.loads((root/'production-round8.json').read_text())['records']
selected=[r for r in records if r.get('status')!='rejected']
assert {r['id'] for r in selected}=={r['id'] for r in new}
reexport=[]
with tempfile.TemporaryDirectory(prefix='.verify-r8-',dir=root) as tmp:
    for r in new:
        dest=Path(tmp)/r['文件名']
        if r['export_kind']=='swim_strip':
            args=['swift',str(root/'export-swim.swift'),str(root/r['source_master']),str(root/'animation-layouts'/(r['id']+'.json')),str(dest)]
        else:
            args=['swift',str(root/'export-png.swift'),str(root/r['source_master']),str(dest),r['宽px'],r['高px'],r['export_inset'],*r['export_crop'].split(','),r['export_alignment']]
        subprocess.run(args,check=True,capture_output=True)
        assert dest.read_bytes()==(root/r['path']).read_bytes(),r['id']
        reexport.append(r['id'])
checks=json.loads((root/'technical-checks.json').read_text());assert len(checks)==len(passed)
spans={x['id']:x['anchor_span_px'] for x in checks if x['id'] in {r['id'] for r in new} and 'anchor_span_px' in x}
assert all(max(v)<=1.0 for v in spans.values())
gifs={}
for path in root.glob('*-swim-review-r8.gif'):
    gif=Image.open(path);durations=[]
    for i in range(gif.n_frames):gif.seek(i);durations.append(gif.info['duration'])
    assert gif.n_frames==4
    gifs[path.name]={'frames':4,'durations_ms':durations,'actual_fps':1000/(sum(durations)/len(durations))}
result={'production_version':'v1-r8','new_completed':expected,'mvp_completed':len(passed),'mvp_remaining':167-len(passed),'p1_deferred':18,'batches_passed':dict(Counter(r['batch'] for r in passed)),'all_png_contracts_checked':len(passed),'prior_116_sha256_preserved':True,'new_reexport_byte_identical':reexport,'animation_landmark_span_px':spans,'gif_measurements':gifs,'not_validated':['Cocos import/runtime playback','texture atlas/budget compression','device performance','RGB edge dilation']}
(root/'round8-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
