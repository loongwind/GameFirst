import Foundation
import AppKit
import ImageIO
import UniformTypeIdentifiers
let root=URL(fileURLWithPath:CommandLine.arguments[1])
let species=["01_moon_jelly","02_lantern_angler","03_electric_eel","04_needlefish","05_hermit_crab","06_glass_shrimp","07_moon_snail","08_comb_jelly"]
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
func stretchBar(_ ctx:CGContext,_ image:CGImage,_ r:CGRect) {
    let sx:[CGFloat]=[0,8,120,128],dx:[CGFloat]=[r.minX,r.minX+8,r.maxX-8,r.maxX]
    for i in 0..<3 {
        let p=image.cropping(to:CGRect(x:sx[i],y:0,width:sx[i+1]-sx[i],height:16))!
        ctx.draw(p,in:CGRect(x:dx[i],y:r.minY,width:dx[i+1]-dx[i],height:16))
    }
}
let ctx=context(1125,1280)
NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:ctx,flipped:false)
background(ctx,1125,1280)
for col in 0..<2 {
    let x=CGFloat(col*563),light=col==0
    label("R3 / thin fills + sunlight creatures",x+15,1240,light)
    label("128x16 source / 330x16 horizontal stretch",x+15,1210,light,12)
    for (i,name) in ["cyan","amber"].enumerated() {
        let image=source("main/ui_bar_\(name).png"),y=CGFloat(1175-i*42)
        ctx.draw(image,in:CGRect(x:x+20,y:y,width:128,height:16))
        stretchBar(ctx,image,CGRect(x:x+195,y:y,width:330,height:16))
    }
    label("No full transparent top/bottom row; L/R slice 8px",x+15,1095,light,12)
    label("Idle at48px / four swim frames at72px",x+15,1065,light,13)
    for (i,s) in species.enumerated() {
        let y=CGFloat(950-i*112)
        label(s,x+15,y+76,light,12)
        ctx.draw(source("sunlight/enemy_normal_\(s)_idle.png"),in:CGRect(x:x+45,y:y+12,width:48,height:48))
        let sheet=source("sunlight/enemy_normal_\(s)_swim.png")
        for f in 0..<4 {
            let frame=sheet.cropping(to:CGRect(x:f*192,y:0,width:192,height:192))!
            ctx.draw(frame,in:CGRect(x:x+130+CGFloat(f*100),y:y,width:72,height:72))
        }
    }
    label("192px cells / 4 poses / 6fps target / source identity preserved",x+15,45,light,11)
}
NSGraphicsContext.restoreGraphicsState()
let png=CGImageDestinationCreateWithURL(root.appendingPathComponent("batch-b-review-r3.png") as CFURL,UTType.png.identifier as CFString,1,nil)!
CGImageDestinationAddImage(png,ctx.makeImage()!,nil);assert(CGImageDestinationFinalize(png))

let gif=CGImageDestinationCreateWithURL(root.appendingPathComponent("sunlight-swim-review-r3.gif") as CFURL,UTType.gif.identifier as CFString,4,nil)!
CGImageDestinationSetProperties(gif,[kCGImagePropertyGIFDictionary:[kCGImagePropertyGIFLoopCount:0]] as CFDictionary)
for f in 0..<4 {
    let frameCtx=context(800,900)
    NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:frameCtx,flipped:false)
    background(frameCtx,800,900)
    label("Four-pose loop / approx6fps / preview",15,865)
    label("Light backdrop",415,865,false)
    for (i,s) in species.enumerated() {
        let y=CGFloat(740-i*94),sheet=source("sunlight/enemy_normal_\(s)_swim.png")
        let image=sheet.cropping(to:CGRect(x:f*192,y:0,width:192,height:192))!
        for col in 0..<2 {
            let x=CGFloat(col*400)
            label(s,x+15,y+40,col==0,12)
            frameCtx.draw(image,in:CGRect(x:x+250,y:y,width:96,height:96))
        }
    }
    NSGraphicsContext.restoreGraphicsState()
    CGImageDestinationAddImage(gif,frameCtx.makeImage()!,[kCGImagePropertyGIFDictionary:[kCGImagePropertyGIFDelayTime:1.0/6.0,kCGImagePropertyGIFUnclampedDelayTime:1.0/6.0]] as CFDictionary)
}
assert(CGImageDestinationFinalize(gif))
