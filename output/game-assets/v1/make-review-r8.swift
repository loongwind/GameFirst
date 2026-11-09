import Foundation
import AppKit
import ImageIO
import UniformTypeIdentifiers
let root=URL(fileURLWithPath:CommandLine.arguments[1])
func source(_ path:String)->CGImage {
 let s=CGImageSourceCreateWithURL(root.appendingPathComponent(path) as CFURL,nil)!
 return CGImageSourceCreateImageAtIndex(s,0,nil)!
}
func context(_ w:Int,_ h:Int)->CGContext {
 CGContext(data:nil,width:w,height:h,bitsPerComponent:8,bytesPerRow:w*4,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
}
func label(_ s:String,_ x:CGFloat,_ y:CGFloat,_ light:Bool=true,_ size:CGFloat=14) {
 (s as NSString).draw(at:CGPoint(x:x,y:y),withAttributes:[.font:NSFont.systemFont(ofSize:size,weight:.medium),.foregroundColor:light ? NSColor.white:NSColor(calibratedRed:0.03,green:0.18,blue:0.25,alpha:1)])
}
func background(_ c:CGContext,_ w:Int,_ h:Int) {
 c.setFillColor(CGColor(red:0.025,green:0.12,blue:0.18,alpha:1));c.fill(CGRect(x:0,y:0,width:w,height:h))
 c.setFillColor(CGColor(red:0.90,green:0.95,blue:0.95,alpha:1));c.fill(CGRect(x:w/2,y:0,width:w-w/2,height:h))
}
func review(_ bundle:String,_ all:[String]) {
 let names=all.filter { FileManager.default.fileExists(atPath:root.appendingPathComponent("\(bundle)/enemy_normal_\($0)_swim.png").path) }
 if names.isEmpty {return}
 let h=150+names.count*250,c=context(1500,150+names.count*250)
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:c,flipped:false)
 background(c,1500,h)
 for col in 0..<2 {
  let x=CGFloat(col*750),light=col==0
  label("R8 / \(bundle.uppercased()) / dark + light",x+15,CGFloat(h-40),light)
  label("Idle192px +48px / four swim frames at96px",x+15,CGFloat(h-70),light,13)
  for (i,s) in names.enumerated() {
   let y=CGFloat(h-335-i*250)
   label(s,x+15,y+205,light)
   let idle=source("\(bundle)/enemy_normal_\(s)_idle.png")
   c.draw(idle,in:CGRect(x:x+5,y:y,width:192,height:192))
   c.draw(idle,in:CGRect(x:x+220,y:y+72,width:48,height:48))
   let sheet=source("\(bundle)/enemy_normal_\(s)_swim.png")
   for f in 0..<4 {
    let frame=sheet.cropping(to:CGRect(x:f*192,y:0,width:192,height:192))!
    c.draw(frame,in:CGRect(x:x+320+CGFloat(f*100),y:y+48,width:96,height:96))
   }
   label("idle",x+75,y-4,light,11);label("48px",x+225,y+35,light,11)
  }
  label("192px cells /4 poses /6fps target / art inspection only",x+15,20,light,12)
 }
 NSGraphicsContext.restoreGraphicsState()
 let png=CGImageDestinationCreateWithURL(root.appendingPathComponent("\(bundle)-review-r8.png") as CFURL,UTType.png.identifier as CFString,1,nil)!
 CGImageDestinationAddImage(png,c.makeImage()!,nil);assert(CGImageDestinationFinalize(png))
 let gh=120+names.count*140
 let gif=CGImageDestinationCreateWithURL(root.appendingPathComponent("\(bundle)-swim-review-r8.gif") as CFURL,UTType.gif.identifier as CFString,4,nil)!
 CGImageDestinationSetProperties(gif,[kCGImagePropertyGIFDictionary:[kCGImagePropertyGIFLoopCount:0]] as CFDictionary)
 for f in 0..<4 {
  let gc=context(800,gh)
  NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:gc,flipped:false)
  background(gc,800,gh)
  label("\(bundle.uppercased()) / four-pose loop",15,CGFloat(gh-40));label("Light backdrop / approx6fps",415,CGFloat(gh-40),false)
  for (i,s) in names.enumerated() {
   let y=CGFloat(gh-190-i*140),sheet=source("\(bundle)/enemy_normal_\(s)_swim.png")
   let frame=sheet.cropping(to:CGRect(x:f*192,y:0,width:192,height:192))!
   for col in 0..<2 {
    let x=CGFloat(col*400)
    label(s,x+15,y+60,col==0,12)
    gc.draw(frame,in:CGRect(x:x+250,y:y,width:128,height:128))
   }
  }
  NSGraphicsContext.restoreGraphicsState()
  CGImageDestinationAddImage(gif,gc.makeImage()!,[kCGImagePropertyGIFDictionary:[kCGImagePropertyGIFDelayTime:1.0/6.0,kCGImagePropertyGIFUnclampedDelayTime:1.0/6.0]] as CFDictionary)
 }
 assert(CGImageDestinationFinalize(gif))
 print(bundle,names.count,"creature pairs previewed")
}
review("twilight",["13_crystal_crab","14_blue_ring_squid","15_ghost_jelly","16_violet_fish"])
review("abyss",["17_firefly_squid","18_abyss_angler","19_tube_worm","20_armored_isopod","21_siphonophore","22_sea_spider","23_deep_starfish","24_glass_sponge"])
