import Foundation
import AppKit
import ImageIO
import UniformTypeIdentifiers
let root=URL(fileURLWithPath:CommandLine.arguments[1])
let ctx=CGContext(data:nil,width:1125,height:1280,bitsPerComponent:8,bytesPerRow:4500,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
NSGraphicsContext.current=NSGraphicsContext(cgContext:ctx,flipped:false)
func rect(_ c:NSColor,_ r:CGRect){c.setFill();r.fill()}
func label(_ s:String,_ x:CGFloat,_ y:CGFloat,_ dark:Bool=false,_ size:CGFloat=13){(s as NSString).draw(at:CGPoint(x:x,y:y),withAttributes:[.font:NSFont.systemFont(ofSize:size,weight:.medium),.foregroundColor:dark ? NSColor.black : NSColor.white])}
func load(_ p:String)->CGImage{let s=CGImageSourceCreateWithURL(root.appendingPathComponent(p) as CFURL,nil)!;return CGImageSourceCreateImageAtIndex(s,0,nil)!}
func draw(_ p:String,_ r:CGRect){ctx.draw(load(p),in:r)}
func sliced(_ p:String,_ r:CGRect,_ insets:[CGFloat]){
 let im=load(p),w=CGFloat(im.width),h=CGFloat(im.height)
 let sx:[CGFloat]=[0,insets[0],w-insets[2],w],sy:[CGFloat]=[0,insets[1],h-insets[3],h]
 let dx:[CGFloat]=[r.minX,r.minX+insets[0],r.maxX-insets[2],r.maxX],dy:[CGFloat]=[r.minY,r.minY+insets[3],r.maxY-insets[1],r.maxY]
 for y in 0..<3 {for x in 0..<3 {
   if sx[x+1]<=sx[x] || sy[y+1]<=sy[y] {continue}
   let part=im.cropping(to:CGRect(x:sx[x],y:sy[y],width:sx[x+1]-sx[x],height:sy[y+1]-sy[y]))!
   ctx.draw(part,in:CGRect(x:dx[x],y:dy[2-y],width:dx[x+1]-dx[x],height:dy[3-y]-dy[2-y]))
 }}
}
rect(NSColor(calibratedRed:0.025,green:0.12,blue:0.18,alpha:1),CGRect(x:0,y:0,width:1125,height:1280))
rect(NSColor(calibratedRed:0.9,green:0.95,blue:0.95,alpha:1),CGRect(x:750,y:0,width:375,height:1280))
label("B batch / 375px composition",15,1240)
label("Dark / icons 48px + 24px",390,1240)
label("Light / icons 48px + 24px",765,1240,true)
ctx.saveGState();ctx.clip(to:CGRect(x:0,y:440,width:375,height:750))
draw("sunlight/bg_sunlight_far.png",CGRect(x:-62.5,y:440,width:500,height:750))
draw("sunlight/deco_sunlight_left.png",CGRect(x:-28,y:440,width:187.5,height:750))
draw("sunlight/deco_sunlight_right.png",CGRect(x:247.5,y:440,width:187.5,height:750))
draw("sunlight/deco_sunlight_flora.png",CGRect(x:0,y:450,width:85,height:85))
draw("main/hero_h01_idle.png",CGRect(x:145,y:740,width:96,height:96))
draw("sunlight/enemy_normal_01_moon_jelly_idle.png",CGRect(x:90,y:990,width:48,height:48))
draw("sunlight/enemy_normal_02_lantern_angler_idle.png",CGRect(x:245,y:940,width:48,height:48))
draw("sunlight/enemy_normal_03_electric_eel_idle.png",CGRect(x:86,y:640,width:48,height:48))
sliced("main/ui_panel.png",CGRect(x:8,y:1070,width:359,height:115),[24,24,24,24])
draw("main/icon_oxygen.png",CGRect(x:20,y:1132,width:24,height:24))
sliced("main/ui_bar_track.png",CGRect(x:48,y:1128,width:220,height:32),[12,8,12,8])
sliced("main/ui_bar_cyan.png",CGRect(x:56,y:1136,width:165,height:16),[8,0,8,0])
draw("main/icon_hp.png",CGRect(x:20,y:1088,width:24,height:24))
draw("main/icon_cargo.png",CGRect(x:148,y:1088,width:24,height:24))
draw("main/icon_pause.png",CGRect(x:305,y:1095,width:40,height:40))
draw("main/ui_joystick_base.png",CGRect(x:10,y:455,width:144,height:144))
draw("main/ui_joystick_thumb.png",CGRect(x:46,y:491,width:72,height:72))
draw("main/icon_rescue.png",CGRect(x:298,y:465,width:48,height:48))
draw("main/icon_ascend.png",CGRect(x:298,y:530,width:48,height:48))
ctx.restoreGState()
label("A 8/8 + B 46/46",20,395)
label("Layered composition, UI geometry only",20,365)
label("No Cocos or device validation",20,335)
let icons=["hp","cargo","rescue","warning","video","pause","ascend","depth_marker"]
for col in 1...2 {
 let x=CGFloat(col*375),dark=col==2
 for i in 0..<8 {let cx=x+15+CGFloat(i%4)*87,cy=CGFloat(i<4 ? 1110:955);let p="main/icon_\(icons[i]).png";draw(p,CGRect(x:cx,y:cy,width:48,height:48));draw(p,CGRect(x:cx+12,y:cy-45,width:24,height:24));label(icons[i],cx,cy-72,dark,11)}
 label("Panel128 + 330x160 nine-slice",x+15,840,dark)
 draw("main/ui_panel.png",CGRect(x:x+18,y:700,width:128,height:128))
 sliced("main/ui_panel.png",CGRect(x:x+15,y:515,width:345,height:160),[24,24,24,24])
 label("Track128x32 + 330x32",x+15,485,dark)
 draw("main/ui_bar_track.png",CGRect(x:x+15,y:435,width:128,height:32))
 sliced("main/ui_bar_track.png",CGRect(x:x+15,y:390,width:330,height:32),[12,8,12,8])
 label("Joystick128 + same-center thumb64",x+15,350,dark)
 draw("main/ui_joystick_base.png",CGRect(x:x+30,y:195,width:128,height:128))
 draw("main/ui_joystick_thumb.png",CGRect(x:x+62,y:227,width:64,height:64))
 draw("main/ui_joystick_base.png",CGRect(x:x+205,y:195,width:128,height:128))
 label("Transparent ring center",x+15,155,dark)
 label("PNG / sRGB / true alpha / 8px margin",x+15,105,dark,12)
 label("Panel center uses one source texel",x+15,75,dark,12)
}
let out=CGImageDestinationCreateWithURL(root.appendingPathComponent("batch-b-review-r4.png") as CFURL,UTType.png.identifier as CFString,1,nil)!
CGImageDestinationAddImage(out,ctx.makeImage()!,nil);assert(CGImageDestinationFinalize(out))
