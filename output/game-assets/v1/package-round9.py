"""Create a standalone production delivery plus selected r9 provenance; verify archive bytes."""
from pathlib import Path
import csv,json,hashlib,zipfile
root=Path(__file__).resolve().parent
rows=list(csv.DictReader((root/'asset-index.csv').open(encoding='utf-8-sig')))
assert len(rows)==185 and sum(r['status']=='self_check_pass' for r in rows)==167
assert (root/'asset-index.csv').read_bytes()==(root/'asset-index-final.csv').read_bytes()
output=root.parents[1]/'deliverables';output.mkdir(exist_ok=True)
common={'README.md','QUALITY-SUMMARY-FINAL.md','asset-index.csv','asset-index-final.csv','technical-checks.json','round9-validation.json','bundle-stats-final.json','boss-rigs-r9.json'}
reviews={p.name for p in root.glob('*-r9.png')}|{p.name for p in root.glob('*-r9.gif')}
prompts={p.name for p in root.glob('production*.json')}
production={r['path'] for r in rows if r['status']=='self_check_pass'}|common|reviews|prompts
new=[r for r in rows if r['production_version']=='v1-r9']
provenance={r['path'] for r in new}|{r['source_master'] for r in new}|common|reviews|{'production-round9.json','baseline-r9-sha256.json','README-r8.md'}
provenance|={str(p.relative_to(root)) for p in root.glob('animation-layouts/enemy_elite_*.json')}
provenance|={str(p.relative_to(root)) for p in (root/'boss-layouts').glob('*.json')}
provenance|={p.name for p in root.glob('*.swift')}|{p.name for p in root.glob('*.py')}
results={}
for filename,paths in [('abyss-hunter-mvp-v1-final-production.zip',production),('abyss-hunter-mvp-v1-r9-provenance.zip',provenance)]:
 dest=output/filename
 assert not dest.exists(),('Do not overwrite previous delivery',dest)
 manifest={name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in sorted(paths)}
 with zipfile.ZipFile(dest,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for name in sorted(paths):z.write(root/name,'abyss-hunter-mvp-v1/'+name)
 with zipfile.ZipFile(dest) as z:
  assert z.testzip() is None
  for name,sha in manifest.items():assert hashlib.sha256(z.read('abyss-hunter-mvp-v1/'+name)).hexdigest()==sha
 results[filename]={'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'files':manifest,'archive_bytes_verified':True}
 print(filename,dest.stat().st_size,'bytes',len(paths),'entries, byte comparison passed')
(root/'delivery-round9.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
