"""Measure pose anchors with Pillow; pack with native Swift/CoreGraphics."""
from pathlib import Path
from PIL import Image
import json,csv,shutil,subprocess

root=Path(__file__).resolve().parent
records=json.loads((root/'production-round3.json').read_text())['records']
rows=list(csv.DictReader((root/'asset-index.csv').open(encoding='utf-8-sig')))
checks={r['id']:r for r in json.loads((root/'technical-checks.json').read_text())}
by_id={r['id']:r for r in rows}
layouts=root/'animation-layouts';layouts.mkdir(exist_ok=True)

def bounds(im, threshold):
    return im.getchannel('A').point(lambda v:255 if v>threshold else 0).getbbox()

def anchor(im, species):
    box=bounds(im,128)
    if species in ('jelly','shell_top','oval_top'):
        fraction=0.20 if species=='shell_top' else 0.46
        top_half=im.getchannel('A').crop((box[0],box[1],box[2],int(box[1]+(box[3]-box[1])*fraction)))
        b=top_half.point(lambda v:255 if v>128 else 0).getbbox()
        return [box[0]+(b[0]+b[2])/2, float(box[1])]
    pixels=im.load();coords=[]
    for y in range(box[1],box[3]):
        for x in range(int((box[0]+box[2])/2),box[2]):
            r,g,b,a=pixels[x,y]
            if a>128 and r>160 and g>70 and g<230 and b<130 and r>g*1.15:
                if species=='angler' and y<box[1]+(box[3]-box[1])*0.35:continue
                coords.append((x,y))
    if species=='angler':
        # Keep the lure and amber fins out of the iris landmark.
        candidates=set((x,y) for x,y in coords if x < box[0]+(box[2]-box[0])*0.84 and y < box[1]+(box[3]-box[1])*0.78)
        components=[]
        while candidates:
            todo=[candidates.pop()];component=[]
            while todo:
                x,y=todo.pop();component.append((x,y))
                for dx,dy in [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]:
                    point=(x+dx,y+dy)
                    if point in candidates:candidates.remove(point);todo.append(point)
            if len(component)>=2:components.append(component)
        def distance(component):
            x=sum(p[0] for p in component)/len(component);y=sum(p[1] for p in component)/len(component)
            return ((x-box[0])/(box[2]-box[0])-0.70)**2+((y-box[1])/(box[3]-box[1])-0.55)**2
        assert components, 'iris component missing'
        coords=min(components,key=distance)
    assert coords, ('eye anchor not found',species)
    return [sum(x for x,y in coords)/len(coords),sum(y for x,y in coords)/len(coords)]

for record in records:
    if record.get('export_kind')!='swim_strip':continue
    r=by_id[record['id']]
    master=root/'source-masters'/r['文件名']
    if not master.exists():shutil.copy2(record['source'],master)
    im=Image.open(master).convert('RGBA')
    assert im.width%4==0
    cw=im.width//4
    species='jelly' if 'moon_jelly' in r['id'] else ('angler' if 'angler' in r['id'] else ('shell_top' if 'hermit_crab' in r['id'] or 'moon_snail' in r['id'] else ('oval_top' if 'comb_jelly' in r['id'] else 'eel')))
    idle=Image.open(root/'sunlight'/r['文件名'].replace('_swim','_idle')).convert('RGBA')
    target=anchor(idle,species); ib=bounds(idle,128)
    frames=[]; sizes=[]
    for i in range(4):
        frame=im.crop((i*cw,0,(i+1)*cw,im.height))
        b=bounds(frame,128); sizes.append(max(b[2]-b[0],b[3]-b[1]))
        an=anchor(frame,species)
        cb=bounds(frame,2)
        cb=[max(0,cb[0]-8),max(0,cb[1]-8),min(cw,cb[2]+8),min(im.height,cb[3]+8)]
        frames.append({'crop':[i*cw+cb[0],cb[1],cb[2]-cb[0],cb[3]-cb[1]],'anchor':[i*cw+an[0],an[1]],'entity_bbox':b,'cell':i})
    scale=max(ib[2]-ib[0],ib[3]-ib[1])/(sum(sizes)/4)
    # Keep a single scale for all four poses and the reference anchor fixed.
    for i,f in enumerate(frames):
        an=[f['anchor'][0]-i*cw,f['anchor'][1]];b=f['entity_bbox']
        for room,extent in [(target[0]-3,an[0]-b[0]),(189-target[0],b[2]-an[0]),(target[1]-3,an[1]-b[1]),(189-target[1],b[3]-an[1])]:
            if extent>0:scale=min(scale,room/extent)
    layout={'id':r['id'],'fps':6,'frame_size':[192,192],'scale':scale,'target_anchor':target,'anchor_kind':'bell_top_center' if species=='jelly' else ('shell_top_center' if species=='shell_top' else ('oval_top_center' if species=='oval_top' else 'amber_eye_centroid')),'frames':frames}
    lp=layouts/(r['id']+'.json');lp.write_text(json.dumps(layout,ensure_ascii=False,indent=2),encoding='utf-8')
    dest=root/'sunlight'/r['文件名']
    subprocess.run(['swift',str(root/'export-swim.swift'),str(master),str(lp),str(dest)],check=True,capture_output=True)
    final=Image.open(dest);assert final.size==(768,192)
    stats=[]
    for i in range(4):
        f=final.crop((i*192,0,(i+1)*192,192));a=f.getchannel('A');b=a.getbbox()
        margin=min(b[0],b[1],192-b[2],192-b[3]);assert margin>=2
        stats.append({'alpha_bbox':b,'clear_margin_px':margin,'anchor':anchor(f,species)})
    checks[r['id']]={'id':r['id'],'size':[768,192],'mode':final.mode,'srgb_profile':bool(final.info.get('icc_profile')) or 'srgb' in final.info,'bytes':dest.stat().st_size,'fps':6,'frame_count':4,'frames':stats}
    r.update(status='technical_pass_visual_pending',path=str(dest.relative_to(root)),source_master=str(master.relative_to(root)),actual_size='768x192',alpha_check='pass',production_version='v1-r3',export_kind='swim_strip',export_crop='',export_alignment='center',export_inset='2')
    print(r['id'],'4x192','scale',round(scale,4),'anchors',[s['anchor'] for s in stats])
with (root/'asset-index.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=rows[0].keys());w.writeheader();w.writerows(rows)
(root/'technical-checks.json').write_text(json.dumps(list(checks.values()),ensure_ascii=False,indent=2),encoding='utf-8')
