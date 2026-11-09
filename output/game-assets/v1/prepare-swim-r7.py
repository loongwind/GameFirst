"""Measure amber-eye anchors and pack generated r7 poses; no pixel painting."""
from pathlib import Path
import csv, json, shutil, subprocess
from PIL import Image

root=Path(__file__).resolve().parent
def bounds(im, threshold=128):
    return im.getchannel('A').point(lambda v:255 if v>threshold else 0).getbbox()

def anchor(im, name):
    box=bounds(im); assert box
    px=im.load(); candidates=set()
    for y in range(box[1], box[3]):
        for x in range(int((box[0]+box[2])/2),box[2]):
            r,g,b,a=px[x,y]
            if a>128 and r>160 and 60<g<245 and b<155 and r>g*1.12:
                candidates.add((x,y))
    components=[]
    while candidates:
        todo=[candidates.pop()]; points=[]
        while todo:
            x,y=todo.pop();points.append((x,y))
            for dx,dy in [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]:
                p=x+dx,y+dy
                if p in candidates:candidates.remove(p);todo.append(p)
        components.append(points)
    assert components, (name,'no amber eye')
    normalized={'ribbon_eel':(.90,.42),'umbrella_octopus':(.70,.36),'hatchetfish':(.82,.30),'lantern_shrimp':(.84,.38)}
    expected=next(v for k,v in normalized.items() if k in name)
    def position(component):
        return [sum(p[0] for p in component)/len(component),sum(p[1] for p in component)/len(component)]
    def distance(component):
        x,y=position(component)
        return ((x-box[0])/(box[2]-box[0])-expected[0])**2+((y-box[1])/(box[3]-box[1])-expected[1])**2
    if 'lantern_shrimp' in name:
        # Its large thorax light is also amber. Restrict the eye to the head.
        components=[c for c in components if (position(c)[0]-box[0])/(box[2]-box[0])>.76]
        assert components,(name,'no amber component in head region')
    # Ignore isolated amber antialias/glint pixels; they are not an eye landmark.
    minimum=max(2, max(map(len,components))*.10)
    eye_components=[c for c in components if len(c)>=minimum]
    assert eye_components,(name,'eye component too small')
    return position(min(eye_components,key=distance))

def main():
    records=json.loads((root/'production-round7.json').read_text())['records']
    rows=list(csv.DictReader((root/'asset-index.csv').open(encoding='utf-8-sig')));by_id={r['id']:r for r in rows}
    checks={r['id']:r for r in json.loads((root/'technical-checks.json').read_text())}
    for rec in records:
        if rec.get('export_kind')!='swim_strip' or rec.get('status')=='rejected':continue
        r=by_id[rec['id']]
        if r['status']=='self_check_pass':continue
        master=root/'source-masters'/rec.get('master_filename',r['文件名'])
        if not master.exists():shutil.copy2(rec['source'],master)
        im=Image.open(master).convert('RGBA');assert im.width%4==0
        cw=im.width//4
        idle=Image.open(root/r['资源包']/r['文件名'].replace('_swim','_idle')).convert('RGBA')
        target=anchor(idle,r['id']);ib=bounds(idle)
        frames=[];sizes=[]
        for i in range(4):
            frame=im.crop((i*cw,0,(i+1)*cw,im.height));bb=bounds(frame);assert bb
            sizes.append(max(bb[2]-bb[0],bb[3]-bb[1]))
            an=anchor(frame,r['id']);cb=bounds(frame,2)
            cb=[max(0,cb[0]-8),max(0,cb[1]-8),min(cw,cb[2]+8),min(im.height,cb[3]+8)]
            frames.append({'cell':i,'crop':[i*cw+cb[0],cb[1],cb[2]-cb[0],cb[3]-cb[1]],'anchor':[i*cw+an[0],an[1]],'entity_bbox':bb})
        scale=max(ib[2]-ib[0],ib[3]-ib[1])/(sum(sizes)/4)
        for i,f in enumerate(frames):
            an=[f['anchor'][0]-i*cw,f['anchor'][1]]
            x,y,w,h=f['crop']; x-=i*cw
            for room,extent in [(target[0]-3,an[0]-x),(189-target[0],x+w-an[0]),(target[1]-3,an[1]-y),(189-target[1],y+h-an[1])]:
                if extent>0:scale=min(scale,room/extent)
        layout={'id':r['id'],'fps':6,'frame_size':[192,192],'scale':scale,'target_anchor':target,'anchor_kind':'amber_eye_centroid','frames':frames}
        lp=root/'animation-layouts'/(r['id']+'.json');lp.write_text(json.dumps(layout,ensure_ascii=False,indent=2)+'\n')
        dest=root/r['资源包']/r['文件名']
        subprocess.run(['swift',str(root/'export-swim.swift'),str(master),str(lp),str(dest)],check=True,capture_output=True)
        final=Image.open(dest);assert final.size==(768,192)
        stats=[]
        for i in range(4):
            f=final.crop((i*192,0,(i+1)*192,192));a=f.getchannel('A');bb=a.getbbox()
            margin=min(bb[0],bb[1],192-bb[2],192-bb[3]);assert margin>=2
            stats.append({'alpha_bbox':bb,'clear_margin_px':margin,'anchor':anchor(f,r['id'])})
        span=[max(s['anchor'][axis] for s in stats)-min(s['anchor'][axis] for s in stats) for axis in (0,1)]
        assert max(span)<=1.0,(r['id'],span)
        checks[r['id']]={'id':r['id'],'size':[768,192],'mode':final.mode,'srgb_profile':bool(final.info.get('icc_profile')) or 'srgb' in final.info,'bytes':dest.stat().st_size,'fps':6,'frame_count':4,'anchor_span_px':span,'frames':stats}
        r.update(status='technical_pass_visual_pending',path=str(dest.relative_to(root)),source_master=str(master.relative_to(root)),actual_size='768x192',alpha_check='pass',production_version='v1-r7',export_kind='swim_strip',export_crop='',export_alignment='center',export_inset='2')
        print(r['id'],'scale',round(scale,4),'anchor span',span)
    with (root/'asset-index.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=rows[0].keys());writer.writeheader();writer.writerows(rows)
    (root/'technical-checks.json').write_text(json.dumps(list(checks.values()),ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':main()
