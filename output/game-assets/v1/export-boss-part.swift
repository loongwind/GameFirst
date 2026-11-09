// Place the sampled opaque root at Cocos anchor (0.5, 0.9), bottom-left origin.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let a=CommandLine.arguments
let layout=try! JSONSerialization.jsonObject(with:Data(contentsOf:URL(fileURLWithPath:a[2]))) as! [String:Any]
let crop=layout["crop"] as! [Int], root=layout["source_root"] as! [Double]
let scale=layout["scale"] as! Double
let input=CGImageSourceCreateWithURL(URL(fileURLWithPath:a[1]) as CFURL,nil)!
let im=CGImageSourceCreateImageAtIndex(input,0,nil)!.cropping(to:CGRect(x:crop[0],y:crop[1],width:crop[2],height:crop[3]))!
let c=CGContext(data:nil,width:512,height:512,bitsPerComponent:8,bytesPerRow:2048,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
c.clear(CGRect(x:0,y:0,width:512,height:512));c.interpolationQuality = .high
let dx=256+(Double(crop[0])-root[0])*scale
let top=51.2+(Double(crop[1])-root[1])*scale
c.draw(im,in:CGRect(x:dx,y:512-top-Double(crop[3])*scale,width:Double(crop[2])*scale,height:Double(crop[3])*scale))
let dest=CGImageDestinationCreateWithURL(URL(fileURLWithPath:a[3]) as CFURL,UTType.png.identifier as CFString,1,nil)!
CGImageDestinationAddImage(dest,c.makeImage()!,nil);assert(CGImageDestinationFinalize(dest))
