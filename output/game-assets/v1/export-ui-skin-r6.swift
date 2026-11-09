// Nine-slice source export with one center texel; preserves generated edge art.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let a=CommandLine.arguments
let s=CGImageSourceCreateWithURL(URL(fileURLWithPath:a[1]) as CFURL,nil)!
let whole=CGImageSourceCreateImageAtIndex(s,0,nil)!
let w=Int(a[3])!,h=Int(a[4])!
let l=CGFloat(Int(a[5])!),t=CGFloat(Int(a[6])!),r=CGFloat(Int(a[7])!),b=CGFloat(Int(a[8])!)
let im=whole.cropping(to:CGRect(x:Int(a[9])!,y:Int(a[10])!,width:Int(a[11])!,height:Int(a[12])!))!
let sw=CGFloat(im.width),sh=CGFloat(im.height),W=CGFloat(w),H=CGFloat(h)
let lx=(sw*(l-8)/(W-16)).rounded(),rx=(sw*(r-8)/(W-16)).rounded()
let ty=(sh*(t-8)/(H-16)).rounded(),by=(sh*(b-8)/(H-16)).rounded()
let dx:[CGFloat]=[8,l,W-r,W-8],dy:[CGFloat]=[8,t,H-b,H-8]
let ctx=CGContext(data:nil,width:w,height:h,bitsPerComponent:8,bytesPerRow:w*4,space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.clear(CGRect(x:0,y:0,width:w,height:h));ctx.interpolationQuality = .high
for y in 0..<3 {for x in 0..<3 {
 let sx=x==0 ? 0 : (x==1 ? (sw/2).rounded() : sw-rx)
 let sy=y==0 ? 0 : (y==1 ? (sh/2).rounded() : sh-by)
 let cw=x==0 ? lx : (x==1 ? 1 : rx),ch=y==0 ? ty : (y==1 ? 1 : by)
 let part=im.cropping(to:CGRect(x:sx,y:sy,width:cw,height:ch))!
 ctx.draw(part,in:CGRect(x:dx[x],y:H-dy[y+1],width:dx[x+1]-dx[x],height:dy[y+1]-dy[y]))
}}
let d=CGImageDestinationCreateWithURL(URL(fileURLWithPath:a[2]) as CFURL,UTType.png.identifier as CFString,1,nil)!
CGImageDestinationAddImage(d,ctx.makeImage()!,nil);assert(CGImageDestinationFinalize(d))
