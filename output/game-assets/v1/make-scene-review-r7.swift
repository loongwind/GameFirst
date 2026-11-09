import Foundation
import AppKit
import ImageIO
import UniformTypeIdentifiers
let root=URL(fileURLWithPath:CommandLine.arguments[1])
let ctx=CGContext(data:nil,width:1500,height:1200,bitsPerComponent:8,bytesPerRow:6000,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
NSGraphicsContext.current=NSGraphicsContext(cgContext:ctx,flipped:false)
func rect(_ c:NSColor,_ r:CGRect){c.setFill();r.fill()}
func label(_ s:String,_ x:CGFloat,_ y:CGFloat,_ dark:Bool=false,_ size:CGFloat=13){(s as NSString).draw(at:CGPoint(x:x,y:y),withAttributes:[.font:NSFont.systemFont(ofSize:size,weight:.medium),.foregroundColor:dark ? NSColor.black:NSColor.white])}
func draw(_ p:String,_ r:CGRect){let s=CGImageSourceCreateWithURL(root.appendingPathComponent(p) as CFURL,nil)!;ctx.draw(CGImageSourceCreateImageAtIndex(s,0,nil)!,in:r)}
rect(NSColor(calibratedRed:0.02,green:0.08,blue:0.14,alpha:1),CGRect(x:0,y:0,width:1500,height:1200))
rect(NSColor(calibratedRed:0.9,green:0.95,blue:0.95,alpha:1),CGRect(x:1125,y:0,width:375,height:1200))
label("D / TWILIGHT / 375px",15,1160)
label("D / ABYSS / 375px",390,1160)
label("Independent layers / dark",765,1160)
label("Independent layers / light",1140,1160,true)
for (i,zone) in ["twilight","abyss"].enumerated(){
 let x=CGFloat(i*375)
 ctx.saveGState();ctx.clip(to:CGRect(x:x,y:300,width:375,height:800))
 draw("\(zone)/bg_\(zone)_far.png",CGRect(x:x-79.1667,y:300,width:533.3333,height:800))
 draw("\(zone)/deco_\(zone)_left.png",CGRect(x:x-10,y:300,width:200,height:800))
 draw("\(zone)/deco_\(zone)_right.png",CGRect(x:x+185,y:300,width:200,height:800))
 draw("\(zone)/deco_\(zone)_flora.png",CGRect(x:x+300,y:355,width:65,height:65))
 draw("main/hero_h01_idle.png",CGRect(x:x+155.5,y:690,width:64,height:64))
 draw("sunlight/enemy_normal_01_moon_jelly_idle.png",CGRect(x:x+80,y:800,width:48,height:48))
 draw("main/fx_torpedo.png",CGRect(x:x+171,y:785,width:32,height:32))
 draw("main/fx_sonic_ring.png",CGRect(x:x+123.5,y:658,width:128,height:128))
 ctx.restoreGState()
 label("1024x1536 background / opaque",x+15,255)
 label("384x1536 walls / alpha",x+15,225)
 label("512x512 flora / alpha",x+15,195)
 label("H-01 + existing SUN foe/FX for scale",x+15,155,false,12)
 label("Open center; no floor / baked HUD",x+15,120,false,12)
 label("Art inspection only / no engine test",x+15,80,false,12)
}
for col in 2...3 {
 let x=CGFloat(col*375), dark=col==3
 for (i,zone) in ["twilight","abyss"].enumerated(){
  let y=CGFloat(675-i*540)
  draw("\(zone)/deco_\(zone)_left.png",CGRect(x:x+10,y:y,width:90,height:360))
  draw("\(zone)/deco_\(zone)_right.png",CGRect(x:x+105,y:y,width:90,height:360))
  draw("\(zone)/deco_\(zone)_flora.png",CGRect(x:x+205,y:y+90,width:160,height:160))
  label(zone.uppercased(),x+15,y-30,dark)
  label("L / R distinct contours; true alpha",x+15,y-55,dark,12)
 }
}
let out=CGImageDestinationCreateWithURL(root.appendingPathComponent("scene-review-r7.png") as CFURL,UTType.png.identifier as CFString,1,nil)!
CGImageDestinationAddImage(out,ctx.makeImage()!,nil);assert(CGImageDestinationFinalize(out))
