"""Register LOO70 assets and verify actual source/import bundle budgets."""
from pathlib import Path
import csv, hashlib, json, shutil
from PIL import Image
ROOT=Path(__file__).resolve().parents[3]; BASE=ROOT/'output/game-assets/v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
write=lambda p,v:p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
records=json.loads((BASE/'loo70-assets.json').read_text())
idx=BASE/'asset-index-final.csv'
with idx.open(encoding='utf-8-sig',newline='') as f:
    reader=csv.DictReader(f);fields=reader.fieldnames; rows=list(reader)
rows=[r for r in rows if not r['id'].startswith('loo70_')]
for a in records:
    r={k:'' for k in fields};r.update(id=a['key'],阶段='LOO70',类别='UI' if '_ui_' in a['key'] else '特效',文件名=a['key']+'.png',用途=a['note'],宽px=a['width'],高px=a['height'],透明='是',锚点=a['anchor'],动画=f"{a['frames']} frames / {a['fps']}fps" if a['frames']>1 else '静态',资源包=a['bundle'],batch='LOO70',status='self_check_pass',actual_size=f"{a['width']}x{a['height']}",alpha_check='pass',path=str(Path(a['bundle'])/(a['key']+'.png')),source_master=a['master'],prompt_key=a['key'],production_version='v1-loo70',export_crop=','.join(map(str,a['crop'])),export_alignment='center',export_kind='nine-slice' if '_ui_' in a['key'] and 'tech_node' not in a['key'] else 'aspect-fit',export_inset='0 horizontal / 2 vertical' if a['key']=='loo70_fx_arc' else '2',sha256=a['sha256'])
    rows.append(r)
for name in ['asset-index-final.csv','asset-index.csv']:
    with (BASE/name).open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fields);writer.writeheader();writer.writerows(rows)
sea_path=ROOT/'game/sea-assets.json'; harbor_path=ROOT/'game/harbor-assets.json'
sea=json.loads(sea_path.read_text());harbor=json.loads(harbor_path.read_text())
sea['assets']=[r for r in sea['assets'] if not r['key'].startswith('loo70_')]
harbor['assets']=[r for r in harbor['assets'] if not r['name'].startswith('loo70_')]
checks=[]
for a in records:
    source=ROOT/a['path'];im=Image.open(source)
    assert im.mode=='RGBA' and im.size==(a['width'],a['height'])
    assert im.getchannel('A').getextrema()[0]==0
    target=ROOT/'game/assets/bundles'/a['bundle']/('content' if a['bundle']=='dive' else 'ui')/source.name
    target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
    if a['bundle']=='dive':
        sea['assets'].append(dict(key=a['key'],bundle='dive',kind='ui' if '_ui_' in a['key'] else 'fx',sourcePath=a['path'],sourceSha256=a['sha256'],importPath=str(target.relative_to(ROOT)),importSha256=sha(target),loadPath='content/'+a['key'],width=a['width'],height=a['height'],bytes=target.stat().st_size,anchor=a['anchor'],blendMode=a['blendMode'],animationFrames=a['frames'],animationFps=a['fps'],nineSlice=a['note'] if '_ui_' in a['key'] else None))
    else:harbor['assets'].append(dict(name=source.name,sourceSha256=a['sha256'],width=a['width'],height=a['height'],bytes=target.stat().st_size,anchor=a['anchor'],nineSlice=a['note']))
    checks.append(dict(key=a['key'],size=list(im.size),alpha=True,sha256=a['sha256']))
for bundle,stat in sea['bundles'].items():
    aa=[a for a in sea['assets'] if a['bundle']==bundle]
    stat['pngBytes']=sum(a['bytes'] for a in aa);stat['rgbaBytes']=sum(a['width']*a['height']*4 for a in aa)
    assert stat['pngBytes']<=stat['downloadBudgetBytes'],bundle+' download over budget'
    assert stat['rgbaBytes']<=stat['textureBudgetBytes'],bundle+' texture over budget'
meta_bytes=sum(a['bytes'] for a in harbor['assets']);meta_rgba=sum(a['width']*a['height']*4 for a in harbor['assets'])
assert meta_bytes<=harbor['bundleBudgetBytes'] and meta_rgba<=harbor['textureBudgetBytes']
harbor['pngBytes']=meta_bytes;harbor['rgbaBytes']=meta_rgba
# Existing import tooling hashes normalized UTF-8 text, not the optional CSV BOM.
sea['sourceIndexSha256']=hashlib.sha256(idx.read_text(encoding='utf-8-sig').replace('\r\n','\n').encode()).hexdigest()
write(sea_path,sea);write(harbor_path,harbor)
report=dict(count=len(checks),checks=checks,bundles=sea['bundles'],meta=dict(pngBytes=meta_bytes,rgbaBytes=meta_rgba,downloadBudgetBytes=harbor['bundleBudgetBytes'],textureBudgetBytes=harbor['textureBudgetBytes']),notes='PNG/import budgets only; no claim of published Cocos/WeChat package or device performance.')
write(BASE/'loo70-validation.json',report)
print(json.dumps({k:v for k,v in report.items() if k!='checks'},ensure_ascii=False,indent=2))
