"""Package selected r8 assets as an overlay for the existing r7 delivery."""
from pathlib import Path
import csv, hashlib, json, zipfile
root=Path(__file__).resolve().parent
validation=json.loads((root/'round8-validation.json').read_text())
rows=list(csv.DictReader((root/'asset-index.csv').open(encoding='utf-8-sig')))
new=[r for r in rows if r['production_version']=='v1-r8' and r['status']=='self_check_pass']
assert len(new)==validation['new_completed']
paths=set()
for r in new:
    paths.update([r['path'],r['source_master']])
    if r['export_kind']=='swim_strip':paths.add('animation-layouts/'+r['id']+'.json')
paths.update(['README.md','asset-index.csv','technical-checks.json','production-round8.json','baseline-r8-sha256.json','round8-validation.json','export-round8.py','prepare-swim-r8.py','validate-round8.py','package-round8.py','export-png.swift','export-swim.swift','make-review-r8.swift','make-playfield-r8.swift','playfield-review-r8.png'])
for bundle in ('twilight','abyss'):
    for suffix in ('-review-r8.png','-swim-review-r8.gif'):
        if (root/(bundle+suffix)).exists():paths.add(bundle+suffix)
archive='abyss-hunter-mvp-v1-r8-incremental.zip'
manifest={'archive':archive,'kind':'incremental overlay','base_required':'v1-r7, 116 accepted production PNGs','production_files_added':len(new),'mvp_completed_after_overlay':validation['mvp_completed'],'files':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in sorted(paths)}}
(root/'delivery-round8.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
paths.add('delivery-round8.json')
out=root.parents[1]/'deliverables'/archive
prefix=archive.removesuffix('.zip')
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for path in sorted(paths):z.write(root/path,prefix+'/'+path)
with zipfile.ZipFile(out) as z:
    assert z.testzip() is None
    for path in paths:assert z.read(prefix+'/'+path)==(root/path).read_bytes(),path
print(json.dumps({'archive':out.name,'bytes':out.stat().st_size,'entries':len(paths),'selected_production_pngs':len(new),'all_archive_bytes_verified':True},indent=2))
