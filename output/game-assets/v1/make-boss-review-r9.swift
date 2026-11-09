import Foundation
import AppKit
import ImageIO
import UniformTypeIdentifiers
let root=URL(fileURLWithPath:CommandLine.arguments[1])
func src(_ path:String)->CGImage {let s=CGImageSourceCreateWithURL(root.appendingPathComponent(path) as CFURL,nil)!;return CGImageSourceCreateImageAtIndex(s,0,nil)!}
func ctx(_ w:Int,_ h:Int)->CGContext {CGContext(data:nil,width:w,height:h,bitsPerComponent:8,bytesPerRow:w*4,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!}
func png(_ c:CGContext,_ name:String){let d=CGImageDestinationCreateWithURL(root.appendingPathComponent(name) as CFURL,UTType.png.identifier as CFString,1,nil)!;CGImageDestinationAddImage(d,c.makeImage()!,nil);assert(CGImageDestinationFinalize(d))}
func label(_ s:String,_ x:Double,_ y:Double,_ light:Bool=true){(s as NSString).draw(at:CGPoint(x:x,y:y),withAttributes:[.font:NSFont.systemFont(ofSize:14,weight:.medium),.foregroundColor:light ? NSColor.white:NSColor.darkGray])}
let data=try! JSONSerialization.jsonObject(with:Data(contentsOf:root.appendingPathComponent("boss-rigs-r9.json"))) as! [String:Any]
let rigs=data["rigs"] as! [[String:Any]]
func assembly(_ rig:[String:Any],_ swing:Double)->CGImage {
 let c=ctx(900,1000),body=src(rig["body"] as! String),part=src(rig["part"] as! String)
 c.interpolationQuality = .high
 c.draw(body,in:CGRect(x:60,y:180,width:768,height:768))
 let point=rig["body_socket_top_left_px"] as! [Double],scale=rig["part_scale"] as! Double
 for angle in rig["part_instances_angles_deg"] as! [Double] {
  c.saveGState();c.translateBy(x:60+point[0],y:180+768-point[1]);c.rotate(by:(angle+swing)*Double.pi/180)
  c.draw(part,in:CGRect(x:-256*scale,y:-460.8*scale,width:512*scale,height:512*scale));c.restoreGState()
 }
 return c.makeImage()!
}
let c=ctx(1500,2680)
c.setFillColor(CGColor(red:0.025,green:0.10,blue:0.16,alpha:1));c.fill(CGRect(x:0,y:0,width:1500,height:2680))
c.setFillColor(CGColor(red:0.90,green:0.95,blue:0.95,alpha:1));c.fill(CGRect(x:750,y:0,width:750,height:2680))
NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:c,flipped:false)
for (i,rig) in rigs.enumerated(){for col in 0..<2 {
 let x=Double(col*750),y=Double(2680-650*(i+1))
 label(rig["id"] as! String,x+12,y+610,col==0)
 c.draw(assembly(rig,0),in:CGRect(x:x+5,y:y+25,width:540,height:600))
 c.draw(src(rig["part"] as! String),in:CGRect(x:x+550,y:y+315,width:160,height:160))
 label("512px part / root (0.5,0.9)",x+515,y+285,col==0)
 label("768px body + movable part / art assembly",x+12,y+8,col==0)
}}
NSGraphicsContext.restoreGraphicsState();png(c,"boss-review-r9.png")
let gif=CGImageDestinationCreateWithURL(root.appendingPathComponent("boss-swing-review-r9.gif") as CFURL,UTType.gif.identifier as CFString,4,nil)!
CGImageDestinationSetProperties(gif,[kCGImagePropertyGIFDictionary:[kCGImagePropertyGIFLoopCount:0]] as CFDictionary)
for swing in [-12.0,0.0,12.0,0.0]{let g=ctx(1200,1400);g.setFillColor(CGColor(red:0.025,green:0.10,blue:0.16,alpha:1));g.fill(CGRect(x:0,y:0,width:1200,height:1400))
 for(i,rig) in rigs.enumerated(){g.draw(assembly(rig,swing),in:CGRect(x:(i%2)*600,y:(1-i/2)*700,width:600,height:667))}
 CGImageDestinationAddImage(gif,g.makeImage()!,[kCGImagePropertyGIFDictionary:[kCGImagePropertyGIFDelayTime:0.22]] as CFDictionary)
};assert(CGImageDestinationFinalize(gif))
let f=ctx(1125,660)
f.setFillColor(CGColor(red:0.025,green:0.10,blue:0.16,alpha:1));f.fill(CGRect(x:0,y:0,width:1125,height:660))
f.setFillColor(CGColor(red:0.90,green:0.95,blue:0.95,alpha:1));f.fill(CGRect(x:563,y:0,width:562,height:660))
NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:f,flipped:false)
for col in 0..<2 {let x=Double(col)*562.5
 label("R9 / telegraphs256 + projectile64,32,16",x+16,620,col==0)
 for(i,name) in ["fx_telegraph_violet","fx_telegraph_amber"].enumerated(){f.draw(src("abyss/\(name).png"),in:CGRect(x:x+Double(i)*260,y:310,width:256,height:256))}
 let bullet=src("abyss/fx_boss_projectile.png")
 for(i,n) in [64,32,16].enumerated(){f.draw(bullet,in:CGRect(x:x+80+Double(i)*140,y:180,width:Double(n),height:Double(n)))}
 label("Clear center / no full-screen bloom",x+16,80,col==0)
};NSGraphicsContext.restoreGraphicsState();png(f,"fx-review-r9.png")
let poses=ctx(900,1400)
poses.setFillColor(CGColor(red:0.025,green:0.10,blue:0.16,alpha:1));poses.fill(CGRect(x:0,y:0,width:900,height:1400))
for(i,rig) in rigs.enumerated(){for(j,angle) in [-12.0,0.0,12.0].enumerated(){poses.draw(assembly(rig,angle),in:CGRect(x:j*300,y:(3-i)*350,width:300,height:333))}}
png(poses,"boss-poses-review-r9.png")
let field=ctx(1500,1000)
field.setFillColor(CGColor(red:0.02,green:0.08,blue:0.14,alpha:1));field.fill(CGRect(x:0,y:0,width:1500,height:1000))
NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:field,flipped:false)
let zones=["sunlight","twilight","abyss","abyss"]
let elites=[["01_storm_eel","02_iron_hermit"],["04_royal_jelly","06_mirror_ray"],["07_abyss_stalker","08_violet_nautilus"],["03_spear_guard","05_crystal_octopus"]]
for i in 0..<4 {let x=Double(i*375),zone=zones[i]
 field.saveGState();field.clip(to:CGRect(x:x,y:120,width:375,height:800))
 field.draw(src("\(zone)/bg_\(zone)_far.png"),in:CGRect(x:x-79.17,y:120,width:533.33,height:800))
 for side in ["left","right"] {field.draw(src("\(zone)/deco_\(zone)_\(side).png"),in:CGRect(x:x+(side=="left" ? -20:195),y:120,width:200,height:800))}
 field.draw(assembly(rigs[i],0),in:CGRect(x:x+25,y:535,width:325,height:361))
 field.draw(src("abyss/fx_telegraph_violet.png"),in:CGRect(x:x+25,y:265,width:120,height:120))
 field.draw(src("abyss/fx_telegraph_amber.png"),in:CGRect(x:x+235,y:195,width:100,height:100))
 for j in 0..<2 {let bundle=(i==3 ? (j==0 ? "sunlight":"twilight"):zone)
  field.draw(src("\(bundle)/enemy_elite_\(elites[i][j])_idle.png"),in:CGRect(x:x+45+Double(j)*205,y:440-Double(j)*50,width:64,height:64))
 }
 field.draw(src("main/hero_h01_idle.png"),in:CGRect(x:x+155,y:310,width:64,height:64))
 for j in 0..<3 {field.draw(src("abyss/fx_boss_projectile.png"),in:CGRect(x:x+135+Double(j)*40,y:470,width:20,height:20))}
 field.restoreGState();label("375px / \(zone) / boss\(i+1)",x+15,960)
 label("Art composite / base FX only",x+15,65);label("No engine or device test",x+15,35)
}
NSGraphicsContext.restoreGraphicsState();png(field,"playfield-review-r9.png")
