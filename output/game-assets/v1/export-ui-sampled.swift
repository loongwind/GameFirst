// Deterministic nine-slice export of image_gen artwork. The stretchable center
// samples the source center texel; borders and corners remain generated artwork.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let a = CommandLine.arguments
let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, nil)!
let whole = CGImageSourceCreateImageAtIndex(src, 0, nil)!
let crop = CGRect(x: Int(a[4])!, y: Int(a[5])!, width: Int(a[6])!, height: Int(a[7])!)
let im = whole.cropping(to: crop)!
let panel = a[3] == "panel"
let w = 128, h = panel ? 128 : 32
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w*4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.clear(CGRect(x: 0, y: 0, width: w, height: h))
ctx.interpolationQuality = .high
let sw = CGFloat(im.width), sh = CGFloat(im.height)
if panel {
    let capX = (sw * 16 / 112).rounded(), capY = (sh * 16 / 112).rounded()
    let dx: [CGFloat] = [8,24,104,120], dy: [CGFloat] = [8,24,104,120]
    for y in 0..<3 { for x in 0..<3 {
        let sx = x == 0 ? 0 : (x == 1 ? (sw/2).rounded() : sw-capX)
        let sy = y == 0 ? 0 : (y == 1 ? (sh/2).rounded() : sh-capY)
        let cw = x == 1 ? 1 : capX, ch = y == 1 ? 1 : capY
        let part = im.cropping(to: CGRect(x:sx,y:sy,width:cw,height:ch))!
        ctx.draw(part, in:CGRect(x:dx[x],y:CGFloat(h)-dy[y+1],width:dx[x+1]-dx[x],height:dy[y+1]-dy[y]))
    }}
} else {
    let cap = (sh/2).rounded()
    let sx: [CGFloat] = [0,cap,sw-cap,sw], dx: [CGFloat] = [8,12,116,120]
    for x in 0..<3 {
        let part = im.cropping(to:CGRect(x:sx[x],y:0,width:sx[x+1]-sx[x],height:sh))!
        ctx.draw(part,in:CGRect(x:dx[x],y:8,width:dx[x+1]-dx[x],height:16))
    }
}
let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath:a[2]) as CFURL,UTType.png.identifier as CFString,1,nil)!
CGImageDestinationAddImage(dst,ctx.makeImage()!,nil)
assert(CGImageDestinationFinalize(dst))
