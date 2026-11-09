import Foundation
import AppKit
import ImageIO
import UniformTypeIdentifiers
let root=URL(fileURLWithPath:CommandLine.arguments[1])
let ctx=CGContext(data:nil,width:1125,height:1100,bitsPerComponent:8,bytesPerRow:4500,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
NSGraphicsContext.current=NSGraphicsContext(cgContext:ctx,flipped:false)
func rect(_ c:NSColor,_ r:CGRect){c.setFill();r.fill()}
func label(_ s:String,_ x:CGFloat,_ y:CGFloat,_ dark:Bool=false,_ size:CGFloat=13){(s as NSString).draw(at:CGPoint(x:x,y:y),withAttributes:[.font:NSFont.systemFont(ofSize:size,weight:.medium),.foregroundColor:dark ? NSColor.black:NSColor.white])}
func draw(_ p:String,_ r:CGRect){let s=CGImageSourceCreateWithURL(root.appendingPathComponent(p) as CFURL,nil)!;ctx.draw(CGImageSourceCreateImageAtIndex(s,0,nil)!,in:r)}
rect(NSColor(calibratedRed:0.025,green:0.12,blue:0.18,alpha:1),CGRect(x:0,y:0,width:1125,height:1100))
rect(NSColor(calibratedRed:0.9,green:0.95,blue:0.95,alpha:1),CGRect(x:750,y:0,width:375,height:1100))
label("C / 375px layered harbor",15,1060)
label("Independent layers / dark",390,1060)
label("Independent layers / light",765,1060,true)
ctx.saveGState();ctx.clip(to:CGRect(x:0,y:250,width:375,height:750))
draw("meta/bg_harbor_far.png",CGRect(x:-62.5,y:250,width:500,height:750))
draw("meta/deco_harbor_left.png",CGRect(x:-10,y:250,width:187.5,height:750))
draw("meta/deco_harbor_right.png",CGRect(x:197.5,y:250,width:187.5,height:750))
draw("meta/deco_harbor_flora.png",CGRect(x:290,y:325,width:75,height:75))
draw("main/hero_h01_idle.png",CGRect(x:125,y:550,width:125,height:125))
ctx.restoreGState()
label("Open center / no baked HUD",15,210)
label("Existing H-01 shown for scale only",15,180,false,12)
label("Harbor hero + diver still pending",15,150,false,12)
label("C:4/46   MVP:58/167",15,105)
label("Art inspection; no engine/device test",15,65,false,12)
for col in 1...2 {
 let x=CGFloat(col*375),dark=col==2
 draw("meta/deco_harbor_left.png",CGRect(x:x+15,y:440,width:120,height:480))
 draw("meta/deco_harbor_right.png",CGRect(x:x+215,y:440,width:120,height:480))
 label("LEFT",x+35,405,dark)
 label("RIGHT",x+250,405,dark)
 label("384x1536 / transparent",x+15,370,dark)
 draw("meta/deco_harbor_flora.png",CGRect(x:x+70,y:135,width:192,height:192))
 label("Independent crystal crate / 512x512",x+15,95,dark,12)
 label("No outer fog / no ground shadow",x+15,65,dark,12)
}
let d=CGImageDestinationCreateWithURL(root.appendingPathComponent("batch-c-review-r4.png") as CFURL,UTType.png.identifier as CFString,1,nil)!
CGImageDestinationAddImage(d,ctx.makeImage()!,nil);assert(CGImageDestinationFinalize(d))
