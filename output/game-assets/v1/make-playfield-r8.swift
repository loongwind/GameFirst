import Foundation
import AppKit
import ImageIO
import UniformTypeIdentifiers
let root=URL(fileURLWithPath:CommandLine.arguments[1])
let c=CGContext(data:nil,width:750,height:1000,bitsPerComponent:8,bytesPerRow:3000,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
NSGraphicsContext.current=NSGraphicsContext(cgContext:c,flipped:false)
func draw(_ p:String,_ r:CGRect) {
 let s=CGImageSourceCreateWithURL(root.appendingPathComponent(p) as CFURL,nil)!
 c.draw(CGImageSourceCreateImageAtIndex(s,0,nil)!,in:r)
}
func label(_ s:String,_ x:CGFloat,_ y:CGFloat,_ size:CGFloat=13) {
 (s as NSString).draw(at:CGPoint(x:x,y:y),withAttributes:[.font:NSFont.systemFont(ofSize:size,weight:.medium),.foregroundColor:NSColor.white])
}
c.setFillColor(CGColor(red:0.02,green:0.08,blue:0.14,alpha:1));c.fill(CGRect(x:0,y:0,width:750,height:1000))
let groups=[("twilight",["13_crystal_crab","14_blue_ring_squid","15_ghost_jelly","16_violet_fish"]),("abyss",["17_firefly_squid","18_abyss_angler","19_tube_worm","20_armored_isopod","21_siphonophore","22_sea_spider","23_deep_starfish","24_glass_sponge"])]
let positions:[CGPoint]=[CGPoint(x:85,y:795),CGPoint(x:240,y:735),CGPoint(x:60,y:640),CGPoint(x:260,y:575),CGPoint(x:75,y:365),CGPoint(x:245,y:285),CGPoint(x:80,y:205),CGPoint(x:240,y:155)]
for (col,g) in groups.enumerated() {
 let x=CGFloat(col*375),zone=g.0
 label("R8 / \(zone.uppercased()) / 375px",x+15,960)
 c.saveGState();c.clip(to:CGRect(x:x,y:130,width:375,height:800))
 draw("\(zone)/bg_\(zone)_far.png",CGRect(x:x-79.1667,y:130,width:533.3333,height:800))
 draw("\(zone)/deco_\(zone)_left.png",CGRect(x:x-10,y:130,width:200,height:800))
 draw("\(zone)/deco_\(zone)_right.png",CGRect(x:x+185,y:130,width:200,height:800))
 draw("\(zone)/deco_\(zone)_flora.png",CGRect(x:x+300,y:150,width:65,height:65))
 for (i,s) in g.1.enumerated() {
  let p=positions[zone=="twilight" ? [0,2,5,7][i]:i]
  draw("\(zone)/enemy_normal_\(s)_idle.png",CGRect(x:x+p.x,y:p.y,width:48,height:48))
 }
 draw("main/hero_h01_idle.png",CGRect(x:x+155.5,y:465,width:64,height:64))
 draw("main/fx_crystal_drop.png",CGRect(x:x+170,y:400,width:24,height:24))
 draw("main/fx_torpedo.png",CGRect(x:x+196,y:550,width:32,height:32))
 c.restoreGState()
 label("\(g.1.count) new species / enemies at48px",x+15,95,12)
 label("Existing H-01 / scene / FX reused for scale",x+15,65,11)
 label("Art composite; no engine/device test",x+15,35,11)
}
let out=CGImageDestinationCreateWithURL(root.appendingPathComponent("playfield-review-r8.png") as CFURL,UTType.png.identifier as CFString,1,nil)!
CGImageDestinationAddImage(out,c.makeImage()!,nil);assert(CGImageDestinationFinalize(out))
