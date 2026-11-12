"""Export selected imagegen masters, preserve originals, and record asset budgets.

Run from repository root after production-loo70.json has been written.
Only assets and metadata are written; no gameplay implementation is performed.
"""
from pathlib import Path
import csv, hashlib, json, shutil
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'output/game-assets/v1'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
write = lambda p, v: p.write_text(json.dumps(v, ensure_ascii=False, indent=2)+'\n')

def nine(im, borders, size):
    l,t,r,b = borders
    w,h = im.size
    xs,ys = [0,l,w-r,w],[0,t,h-b,h]
    dx,dy = [0,l,size[0]-r,size[0]],[0,t,size[1]-b,size[1]]
    out = Image.new('RGBA', size)
    for y in range(3):
        for x in range(3):
            part = im.crop((xs[x],ys[y],xs[x+1],ys[y+1]))
            out.paste(part.resize((dx[x+1]-dx[x],dy[y+1]-dy[y]),Image.Resampling.LANCZOS),(dx[x],dy[y]))
    return out

def run():
    selected = json.loads((BASE/'production-loo70.json').read_text())
    specs = list(csv.DictReader((ROOT/'output/deliverables/loo-70-design/asset-list.csv').open(encoding='utf-8-sig')))
    specs = [r for r in specs if r['实现方式']=='必出新图']
    records=[]
    for row in specs:
        key=row['id']; choice=selected[key]
        master=BASE/'source-masters'/choice.get('masterName',f'{key}.png')
        master.parent.mkdir(exist_ok=True)
        if not master.exists(): shutil.copy2(choice['path'],master)
        im=Image.open(master).convert('RGBA')
        w,h=int(row['宽px']),int(row['高px'])
        # Explicit crop coordinates are selected by visual review; no auto frame trim.
        crop=choice.get('crop',list(im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()))
        if key=='loo70_fx_impact':
            cell=im.width//4
            crop=[0,(im.height-cell)//2,cell*4,(im.height-cell)//2+cell]
        art=im.crop(crop)
        out=Image.new('RGBA',(w,h))
        scale=min((w-4)/art.width,(h-4)/art.height)
        art=art.resize((max(1,round(art.width*scale)),max(1,round(art.height*scale))),Image.Resampling.LANCZOS)
        out.paste(art,((w-art.width)//2,(h-art.height)//2))
        if key=='loo70_fx_arc':
            # Open horizontal endpoints are intentional; atlas padding is external.
            arc=im.crop(crop);nh=max(1,round(arc.height*w/arc.width))
            arc=arc.resize((w,min(h,nh)),Image.Resampling.LANCZOS)
            out=Image.new('RGBA',(w,h));out.paste(arc,(0,(h-arc.height)//2))
        if key=='loo70_fx_impact':
            out=Image.new('RGBA',(w,h))
            cell=im.width//4
            for frame in range(4):
                tile=im.crop((frame*cell,crop[1],(frame+1)*cell,crop[3])).resize((60,60),Image.Resampling.LANCZOS)
                out.paste(tile,(frame*64+2,2))
        borders={'loo70_ui_hull':(32,40,32,32),'loo70_ui_hud':(16,16,16,16),'loo70_ui_gold':(24,20,24,20),'loo70_ui_steel':(24,20,24,20),'loo70_ui_socket':(16,16,16,16),'loo70_ui_ribbon':(64,16,64,16)}.get(key)
        if borders:
            # Established v1 UI export convention: one center texel and one-axis
            # edge samples keep generated corners intact and stretch zones flat.
            l,t,r,b=borders
            if art.width>l+r and art.height>t+b:
                out=nine(art,borders,(w,h))
            center=out.getpixel((w//2,h//2)) if key!='loo70_ui_socket' else (0,0,0,0)
            out.paste(center,(l,t,w-r,h-b))
            for box,region in [((w//2,0,w//2+1,t),(l,0,w-r,t)),((w//2,h-b,w//2+1,h),(l,h-b,w-r,h))]:
                strip=out.crop(box).resize((region[2]-region[0],region[3]-region[1]))
                out.paste(strip,region[:2])
        dest=BASE/row['资源包']/f'{key}.png';dest.parent.mkdir(exist_ok=True)
        # Two-pixel RGB bleed only: keep original alpha and every visible texel.
        pixels=out.load(); original=out.copy().load()
        for yy in range(h):
            for xx in range(w):
                if original[xx,yy][3]: continue
                found=None
                for radius in (1,2):
                    candidates=[original[nx,ny] for ny in range(max(0,yy-radius),min(h,yy+radius+1)) for nx in range(max(0,xx-radius),min(w,xx+radius+1)) if original[nx,ny][3]>8]
                    if candidates:
                        found=max(candidates,key=lambda c:c[3]);break
                if found:pixels[xx,yy]=(*found[:3],0)
        out.save(dest,optimize=True)
        records.append(dict(key=key,bundle=row['资源包'],path=str(dest.relative_to(ROOT)),width=w,height=h,bytes=dest.stat().st_size,sha256=sha(dest),master=str(master.relative_to(BASE)),masterSha256=sha(master),crop=crop,anchor=row['锚点'],blendMode=row['混合模式'],frames=4 if key=='loo70_fx_impact' else 1,fps=24 if key=='loo70_fx_impact' else 0,note=row['备注']))
    write(BASE/'loo70-assets.json',records)
    for group,filename in [('fx','fx-review-r10.png'),('ui','ui-review-r7.png')]:
        rows=[r for r in records if ('_ui_' in r['key'])==(group=='ui')]
        stride=240
        canvas=Image.new('RGB',(1100,len(rows)*stride),(7,28,43));d=ImageDraw.Draw(canvas)
        for i,r in enumerate(rows):
            y=i*stride; im=Image.open(ROOT/r['path'])
            d.text((12,y+8),r['key']+f"  {r['width']}x{r['height']}",fill='white')
            for x,color in [(12,(16,51,69)),(370,(233,244,245))]:
                canvas.paste(color,(x,y+30,x+340,y+234))
                canvas.paste(im,(x+8,y+40),im)
            if group=='ui':
                borders={'loo70_ui_hull':(32,40,32,32),'loo70_ui_hud':(16,16,16,16),'loo70_ui_gold':(24,20,24,20),'loo70_ui_steel':(24,20,24,20),'loo70_ui_socket':(16,16,16,16),'loo70_ui_ribbon':(64,16,64,16)}.get(r['key'])
                if borders:
                    preview=nine(im,borders,(340,max(im.height,110)))
                    preview.thumbnail((340,135));canvas.paste(preview,(740,y+35),preview)
            else:
                small=im.copy();small.thumbnail((256,64));canvas.paste(small,(750,y+60),small)
        canvas.save(BASE/filename)
    write(BASE/'loo70-export-record.json',{'assets':records,'count':len(records),'generatedWith':'built-in image_gen','export':'aspect-preserving crop/resize; original masters preserved'})

if __name__=='__main__':run()
