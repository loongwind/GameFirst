import Foundation
import AppKit
import ImageIO
import UniformTypeIdentifiers
let root=URL(fileURLWithPath:CommandLine.arguments[1])
let ctx=CGContext(data:nil,width:1125,height:1250,bitsPerComponent:8,bytesPerRow:4500,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
NSGraphicsContext.current=NSGraphicsContext(cgContext:ctx,flipped:false)
func rect(_ c:NSColor,_ r:CGRect){c.setFill();r.fill()}
func label(_ s:String,_ x:CGFloat,_ y:CGFloat,_ dark:Bool=false,_ size:CGFloat=13){(s as NSString).draw(at:CGPoint(x:x,y:y),withAttributes:[.font:NSFont.systemFont(ofSize:size,weight:.medium),.foregroundColor:dark ? NSColor.black:NSColor.white])}
func im(_ p:String)->CGImage{let s=CGImageSourceCreateWithURL(root.appendingPathComponent(p) as CFURL,nil)!;return CGImageSourceCreateImageAtIndex(s,0,nil)!}
func draw(_ p:String,_ r:CGRect){ctx.draw(im(p),in:r)}
let checks=try! JSONSerialization.jsonObject(with:Data(contentsOf:root.appendingPathComponent("technical-checks.json"))) as! [[String:Any]]
func normalized(_ id:String,_ p:String,_ r:CGRect){
 let a=checks.first{$0["id"] as? String==id}!["alpha_bbox"] as! [Int]
 let part=im(p).cropping(to:CGRect(x:a[0],y:a[1],width:a[2]-a[0],height:a[3]-a[1]))!
 let s=min(r.width/CGFloat(part.width),r.height/CGFloat(part.height)),w=CGFloat(part.width)*s,h=CGFloat(part.height)*s
 ctx.draw(part,in:CGRect(x:r.midX-w/2,y:r.midY-h/2,width:w,height:h))
}
rect(NSColor(calibratedRed:0.025,green:0.12,blue:0.18,alpha:1),CGRect(x:0,y:0,width:1125,height:1250))
rect(NSColor(calibratedRed:0.9,green:0.95,blue:0.95,alpha:1),CGRect(x:750,y:0,width:375,height:1250))
label("Same-master weapon comparison",15,1210)
label("8 equipment / dark / 128 + 48 px",390,1210)
label("8 equipment / light / 128 + 48 px",765,1210,true)
let names=["sonic","torpedo","arc","mine","searchlight","fin","armor","magnet"]
for i in 0..<4 {
 let y=CGFloat(1000-i*230),kind=names[i]
 let p=(i==0 ? "main/":"sunlight/")+"mount_\(kind).png"
 normalized("mount_\(kind)",p,CGRect(x:25,y:y,width:130,height:130))
 normalized("equip_\(kind)","meta/equip_\(kind).png",CGRect(x:210,y:y,width:130,height:130))
 label("MOUNT",65,y-25);label("EQUIP",250,y-25)
 label(kind+" / identical source master",25,y-55,false,12)
}
label("Four new-size exports / no redesign",15,140,false,12)
label("Four other modules newly generated",15,110,false,12)
label("256x256 / PNG / sRGB / true alpha",15,65,false,12)
for col in 1...2 {
 let x=CGFloat(col*375),dark=col==2
 for i in 0..<8 {
  let cx=x+20+CGFloat(i%2)*175,y=CGFloat(1010-(i/2)*260),kind=names[i]
  let p="meta/equip_\(kind).png"
  draw(p,CGRect(x:cx,y:y,width:128,height:128))
  draw(p,CGRect(x:cx+40,y:y-65,width:48,height:48))
  label(kind,cx+25,y-95,dark,12)
 }
 label("No quality frame / no pedestal / 8px edge",x+15,65,dark,12)
}
let d=CGImageDestinationCreateWithURL(root.appendingPathComponent("equipment-review-r5.png") as CFURL,UTType.png.identifier as CFString,1,nil)!
CGImageDestinationAddImage(d,ctx.makeImage()!,nil);assert(CGImageDestinationFinalize(d))
