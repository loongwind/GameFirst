import Foundation
import AppKit
import ImageIO
import UniformTypeIdentifiers
let root=URL(fileURLWithPath:CommandLine.arguments[1])
let species=["09_ribbon_eel","10_umbrella_octopus","11_hatchetfish","12_lantern_shrimp"]
func source(_ path:String)->CGImage {
 let s=CGImageSourceCreateWithURL(root.appendingPathComponent(path) as CFURL,nil)!
 return CGImageSourceCreateImageAtIndex(s,0,nil)!
}
func context(_ w:Int,_ h:Int)->CGContext {
 return CGContext(data:nil,width:w,height:h,bitsPerComponent:8,bytesPerRow:w*4,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
}
func label(_ s:String,_ x:CGFloat,_ y:CGFloat,_ light:Bool=true,_ size:CGFloat=14) {
 (s as NSString).draw(at:CGPoint(x:x,y:y),withAttributes:[.font:NSFont.systemFont(ofSize:size,weight:.medium),.foregroundColor:light ? NSColor.white : NSColor(calibratedRed:0.03,green:0.18,blue:0.25,alpha:1)])
}
func background(_ ctx:CGContext,_ w:Int,_ h:Int) {
 ctx.setFillColor(CGColor(red:0.025,green:0.12,blue:0.18,alpha:1));ctx.fill(CGRect(x:0,y:0,width:w,height:h))
 ctx.setFillColor(CGColor(red:0.90,green:0.95,blue:0.95,alpha:1));ctx.fill(CGRect(x:w/2,y:0,width:w-w/2,height:h))
}
let ctx=context(1500,1150)
NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:ctx,flipped:false)
background(ctx,1500,1150)
for col in 0..<2 {
 let x=CGFloat(col*750),light=col==0
 label("D / twilight creatures / dark + light",x+15,1110,light)
 label("Idle192px +48px / four swim frames at96px",x+15,1080,light,13)
 for (i,s) in species.enumerated() {
  let y=CGFloat(815-i*250)
  label(s,x+15,y+205,light,14)
  let idle=source("twilight/enemy_normal_\(s)_idle.png")
  ctx.draw(idle,in:CGRect(x:x+5,y:y,width:192,height:192))
  ctx.draw(idle,in:CGRect(x:x+220,y:y+72,width:48,height:48))
  let sheet=source("twilight/enemy_normal_\(s)_swim.png")
  for f in 0..<4 {
   let frame=sheet.cropping(to:CGRect(x:f*192,y:0,width:192,height:192))!
   ctx.draw(frame,in:CGRect(x:x+320+CGFloat(f*100),y:y+48,width:96,height:96))
  }
  label("idle",x+75,y-4,light,11);label("48px",x+225,y+35,light,11)
 }
 label("192px cells /4 poses /6fps target / art inspection only",x+15,20,light,12)
}
NSGraphicsContext.restoreGraphicsState()
let png=CGImageDestinationCreateWithURL(root.appendingPathComponent("creature-review-r7.png") as CFURL,UTType.png.identifier as CFString,1,nil)!
CGImageDestinationAddImage(png,ctx.makeImage()!,nil);assert(CGImageDestinationFinalize(png))
let gif=CGImageDestinationCreateWithURL(root.appendingPathComponent("twilight-swim-review-r7.gif") as CFURL,UTType.gif.identifier as CFString,4,nil)!
CGImageDestinationSetProperties(gif,[kCGImagePropertyGIFDictionary:[kCGImagePropertyGIFLoopCount:0]] as CFDictionary)
for f in 0..<4 {
 let c=context(800,650)
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:c,flipped:false)
 background(c,800,650)
 label("TWILIGHT / four-pose loop",15,612);label("Light backdrop / approx6fps",415,612,false)
 for (i,s) in species.enumerated() {
  let y=CGFloat(460-i*140),sheet=source("twilight/enemy_normal_\(s)_swim.png")
  let frame=sheet.cropping(to:CGRect(x:f*192,y:0,width:192,height:192))!
  for col in 0..<2 {
   let x=CGFloat(col*400)
   label(s,x+15,y+60,col==0,12)
   c.draw(frame,in:CGRect(x:x+250,y:y,width:128,height:128))
  }
 }
 NSGraphicsContext.restoreGraphicsState()
 CGImageDestinationAddImage(gif,c.makeImage()!,[kCGImagePropertyGIFDictionary:[kCGImagePropertyGIFDelayTime:1.0/6.0,kCGImagePropertyGIFUnclampedDelayTime:1.0/6.0]] as CFDictionary)
}
assert(CGImageDestinationFinalize(gif))
