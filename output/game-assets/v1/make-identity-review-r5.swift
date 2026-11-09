import Foundation
import AppKit
import ImageIO
import UniformTypeIdentifiers
let root=URL(fileURLWithPath:CommandLine.arguments[1])
let ctx=CGContext(data:nil,width:1125,height:1100,bitsPerComponent:8,bytesPerRow:4500,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
NSGraphicsContext.current=NSGraphicsContext(cgContext:ctx,flipped:false)
func rect(_ c:NSColor,_ r:CGRect){c.setFill();r.fill()}
func label(_ s:String,_ x:CGFloat,_ y:CGFloat,_ dark:Bool=false,_ size:CGFloat=13){(s as NSString).draw(at:CGPoint(x:x,y:y),withAttributes:[.font:NSFont.systemFont(ofSize:size,weight:.medium),.foregroundColor:dark ? NSColor.black:NSColor.white])}
func im(_ p:String)->CGImage{let s=CGImageSourceCreateWithURL(root.appendingPathComponent(p) as CFURL,nil)!;return CGImageSourceCreateImageAtIndex(s,0,nil)!}
func draw(_ p:String,_ r:CGRect){ctx.draw(im(p),in:r)}
let checks=try! JSONSerialization.jsonObject(with:Data(contentsOf:root.appendingPathComponent("technical-checks.json"))) as! [[String:Any]]
func normalized(_ id:String,_ p:String,_ r:CGRect){
 let a=checks.first{$0["id"] as? String==id}!["alpha_bbox"] as! [Int]
 let part=im(p).cropping(to:CGRect(x:a[0],y:a[1],width:a[2]-a[0],height:a[3]-a[1]))!
 let s=min(r.width/CGFloat(part.width),r.height/CGFloat(part.height))
 let w=CGFloat(part.width)*s,h=CGFloat(part.height)*s
 ctx.draw(part,in:CGRect(x:r.midX-w/2,y:r.midY-h/2,width:w,height:h))
}
rect(NSColor(calibratedRed:0.025,green:0.12,blue:0.18,alpha:1),CGRect(x:0,y:0,width:1125,height:1100))
rect(NSColor(calibratedRed:0.9,green:0.95,blue:0.95,alpha:1),CGRect(x:750,y:0,width:375,height:1100))
label("C identity / 375px harbor",15,1060)
label("Dark / battle vs harbor",390,1060)
label("Light / battle vs harbor",765,1060,true)
ctx.saveGState();ctx.clip(to:CGRect(x:0,y:250,width:375,height:750))
draw("meta/bg_harbor_far.png",CGRect(x:-62.5,y:250,width:500,height:750))
draw("meta/deco_harbor_left.png",CGRect(x:-10,y:250,width:187.5,height:750))
draw("meta/deco_harbor_right.png",CGRect(x:197.5,y:250,width:187.5,height:750))
draw("meta/hero_h01_harbor.png",CGRect(x:100,y:530,width:185,height:185))
draw("meta/npc_diver_harbor.png",CGRect(x:70,y:420,width:75,height:100))
draw("meta/deco_harbor_flora.png",CGRect(x:285,y:335,width:75,height:75))
ctx.restoreGState()
label("Isolated harbor hero + diver",15,205)
label("Single round porthole / two weapon pods",15,175,false,12)
label("White / orange / cyan identity retained",15,145,false,12)
label("Visual art inspection only",15,90)
for col in 1...2 {
 let x=CGFloat(col*375),dark=col==2
 normalized("hero_ship","main/hero_h01_idle.png",CGRect(x:x+25,y:835,width:150,height:150))
 normalized("hero_harbor","meta/hero_h01_harbor.png",CGRect(x:x+200,y:835,width:150,height:150))
 label("BATTLE",x+65,805,dark,12);label("HARBOR",x+235,805,dark,12)
 label("Matched visible bounds / same view",x+15,770,dark,12)
 draw("meta/npc_diver_harbor.png",CGRect(x:x+15,y:300,width:288,height:384))
 draw("meta/avatar_diver.png",CGRect(x:x+248,y:540,width:112,height:112))
 draw("meta/avatar_diver.png",CGRect(x:x+280,y:450,width:48,height:48))
 draw("meta/avatar_diver.png",CGRect(x:x+292,y:390,width:24,height:24))
 label("FULL BODY",x+90,270,dark,12)
 label("AVATAR",x+270,350,dark,12)
 label("Same helmet / no badge or backdrop",x+15,220,dark,12)
 label("768x768 / 384x512 / 128x128",x+15,150,dark)
 label("PNG / sRGB / true alpha / 8px edge",x+15,110,dark,12)
}
let dst=CGImageDestinationCreateWithURL(root.appendingPathComponent("identity-review-r5.png") as CFURL,UTType.png.identifier as CFString,1,nil)!
CGImageDestinationAddImage(dst,ctx.makeImage()!,nil);assert(CGImageDestinationFinalize(dst))
