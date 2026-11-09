import Foundation
import AppKit
import ImageIO
import UniformTypeIdentifiers
let root=URL(fileURLWithPath:CommandLine.arguments[1])
let ctx=CGContext(data:nil,width:1500,height:1320,bitsPerComponent:8,bytesPerRow:6000,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
NSGraphicsContext.current=NSGraphicsContext(cgContext:ctx,flipped:false)
func rect(_ c:NSColor,_ r:CGRect){c.setFill();r.fill()}
func label(_ s:String,_ x:CGFloat,_ y:CGFloat,_ dark:Bool=false,_ size:CGFloat=14){(s as NSString).draw(at:CGPoint(x:x,y:y),withAttributes:[.font:NSFont.systemFont(ofSize:size,weight:.medium),.foregroundColor:dark ? NSColor.black:NSColor.white])}
func draw(_ p:String,_ r:CGRect){let s=CGImageSourceCreateWithURL(root.appendingPathComponent(p) as CFURL,nil)!;ctx.draw(CGImageSourceCreateImageAtIndex(s,0,nil)!,in:r)}
rect(NSColor(calibratedRed:0.025,green:0.12,blue:0.18,alpha:1),CGRect(x:0,y:0,width:1500,height:1320))
rect(NSColor(calibratedRed:0.9,green:0.95,blue:0.95,alpha:1),CGRect(x:750,y:0,width:750,height:1320))
let names=["pearl","marrow","core_cyan","core_red","ticket","attack","attack_speed","move_speed","home","equipment","upgrade","tech","supply","archive","gift","blessing","sonar","silver_chest","gold_chest","locked","close","dive"]
for col in 0...1 {
 let x=CGFloat(col*750),dark=col==1
 label("C icons / 96px + 48px + 24px / "+(dark ? "light":"dark"),x+25,1275,dark,18)
 for i in 0..<names.count {
  let cx=x+20+CGFloat(i%4)*180,y=CGFloat(1110-(i/4)*195),p="meta/icon_\(names[i]).png"
  draw(p,CGRect(x:cx+30,y:y,width:96,height:96))
  draw(p,CGRect(x:cx+30,y:y-58,width:48,height:48))
  draw(p,CGRect(x:cx+102,y:y-46,width:24,height:24))
  label(names[i],cx+20,y-88,dark,13)
 }
}
let d=CGImageDestinationCreateWithURL(root.appendingPathComponent("icon-review-r6.png") as CFURL,UTType.png.identifier as CFString,1,nil)!
CGImageDestinationAddImage(d,ctx.makeImage()!,nil);assert(CGImageDestinationFinalize(d))
