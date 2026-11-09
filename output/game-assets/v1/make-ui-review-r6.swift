import Foundation
import AppKit
import ImageIO
import UniformTypeIdentifiers
let root=URL(fileURLWithPath:CommandLine.arguments[1])
let ctx=CGContext(data:nil,width:1125,height:1280,bitsPerComponent:8,bytesPerRow:4500,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
NSGraphicsContext.current=NSGraphicsContext(cgContext:ctx,flipped:false)
func rect(_ c:NSColor,_ r:CGRect){c.setFill();r.fill()}
func label(_ s:String,_ x:CGFloat,_ y:CGFloat,_ dark:Bool=false,_ size:CGFloat=13){(s as NSString).draw(at:CGPoint(x:x,y:y),withAttributes:[.font:NSFont.systemFont(ofSize:size,weight:.medium),.foregroundColor:dark ? NSColor.black:NSColor.white])}
func im(_ p:String)->CGImage{let s=CGImageSourceCreateWithURL(root.appendingPathComponent(p) as CFURL,nil)!;return CGImageSourceCreateImageAtIndex(s,0,nil)!}
func draw(_ p:String,_ r:CGRect){ctx.draw(im(p),in:r)}
func sliced(_ p:String,_ r:CGRect,_ inset:[CGFloat]){
 let src=im(p),w=CGFloat(src.width),h=CGFloat(src.height)
 let sx:[CGFloat]=[0,inset[0],w-inset[2],w],sy:[CGFloat]=[0,inset[1],h-inset[3],h]
 let dx:[CGFloat]=[r.minX,r.minX+inset[0],r.maxX-inset[2],r.maxX],dy:[CGFloat]=[r.minY,r.minY+inset[3],r.maxY-inset[1],r.maxY]
 for y in 0..<3 {for x in 0..<3 {
  if sx[x+1]<=sx[x] || sy[y+1]<=sy[y]{continue}
  let part=src.cropping(to:CGRect(x:sx[x],y:sy[y],width:sx[x+1]-sx[x],height:sy[y+1]-sy[y]))!
  ctx.draw(part,in:CGRect(x:dx[x],y:dy[2-y],width:dx[x+1]-dx[x],height:dy[3-y]-dy[2-y]))
 }}
}
rect(NSColor(calibratedRed:0.025,green:0.12,blue:0.18,alpha:1),CGRect(x:0,y:0,width:1125,height:1280))
rect(NSColor(calibratedRed:0.9,green:0.95,blue:0.95,alpha:1),CGRect(x:750,y:0,width:375,height:1280))
label("C / 375px harbor composition",15,1240)
label("UI skins + quality / dark",390,1240)
label("UI skins + quality / light",765,1240,true)
ctx.saveGState();ctx.clip(to:CGRect(x:0,y:430,width:375,height:750))
draw("meta/bg_harbor_far.png",CGRect(x:-62.5,y:430,width:500,height:750))
draw("meta/deco_harbor_left.png",CGRect(x:-10,y:430,width:187.5,height:750))
draw("meta/deco_harbor_right.png",CGRect(x:197.5,y:430,width:187.5,height:750))
draw("meta/hero_h01_harbor.png",CGRect(x:100,y:710,width:185,height:185))
draw("meta/npc_diver_harbor.png",CGRect(x:70,y:600,width:75,height:100))
sliced("main/ui_panel.png",CGRect(x:5,y:1090,width:365,height:80),[24,24,24,24])
for (i,n) in ["pearl","marrow","core_cyan","core_red","ticket"].enumerated(){draw("meta/icon_\(n).png",CGRect(x:20+CGFloat(i)*69,y:1110,width:40,height:40))}
sliced("main/ui_panel.png",CGRect(x:5,y:440,width:365,height:90),[24,24,24,24])
for (i,n) in ["home","equipment","upgrade","tech","supply"].enumerated(){draw("meta/icon_\(n).png",CGRect(x:15+CGFloat(i)*71,y:461,width:48,height:48))}
draw("meta/ui_red_dot.png",CGRect(x:332,y:499,width:24,height:24))
ctx.restoreGState()
label("UI artwork only / no live controls",15,390)
label("C batch 46/46 / MVP 100/167",15,355)
label("Engine, package and device tests pending",15,315,false,12)
for col in 1...2 {
 let x=CGFloat(col*375),dark=col==2
 label("Secondary160x80 / stretch330x80",x+15,1180,dark,12)
 draw("meta/ui_button_secondary.png",CGRect(x:x+15,y:1090,width:160,height:80))
 sliced("meta/ui_button_secondary.png",CGRect(x:x+15,y:990,width:330,height:80),[32,24,32,24])
 label("Slot128 / toast128x64 + stretch",x+15,960,dark,12)
 draw("meta/ui_slot.png",CGRect(x:x+15,y:810,width:128,height:128))
 draw("meta/ui_toast.png",CGRect(x:x+185,y:870,width:128,height:64))
 draw("meta/ui_red_dot.png",CGRect(x:x+298,y:818,width:32,height:32))
 draw("meta/ui_red_dot.png",CGRect(x:x+342,y:826,width:16,height:16))
 sliced("meta/ui_toast.png",CGRect(x:x+15,y:730,width:330,height:64),[24,16,24,16])
 label("Quality frames / item64 / stretch220x80",x+15,690,dark,12)
 let names=["broken","standard","fine","epic","legend"]
 for i in 0..<5 {
  let y=CGFloat(565-i*105),p="meta/frame_\(names[i]).png"
  draw(p,CGRect(x:x+10,y:y,width:96,height:96))
  draw("meta/equip_sonic.png",CGRect(x:x+26,y:y+16,width:64,height:64))
  sliced(p,CGRect(x:x+130,y:y+8,width:220,height:80),[24,24,24,24])
  label(names[i],x+15,y-13,dark,11)
 }
 label("Frame center alpha / skin center uniform",x+15,65,dark,12)
}
let d=CGImageDestinationCreateWithURL(root.appendingPathComponent("ui-review-r6.png") as CFURL,UTType.png.identifier as CFString,1,nil)!
CGImageDestinationAddImage(d,ctx.makeImage()!,nil);assert(CGImageDestinationFinalize(d))
