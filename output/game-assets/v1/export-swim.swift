// Pack image_gen poses; use one common scale and a stable reference anchor.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let a = CommandLine.arguments
let layout = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: a[2]))) as! [String: Any]
let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, nil)!
let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
let ctx = CGContext(data: nil, width: 768, height: 192, bitsPerComponent: 8, bytesPerRow: 768*4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.clear(CGRect(x: 0, y: 0, width: 768, height: 192))
ctx.interpolationQuality = .high
let scale = layout["scale"] as! Double
let target = layout["target_anchor"] as! [Double]
let frames = layout["frames"] as! [[String: Any]]
for i in 0..<4 {
    let f = frames[i], crop = f["crop"] as! [Int], anchor = f["anchor"] as! [Double]
    let piece = image.cropping(to: CGRect(x: crop[0], y: crop[1], width: crop[2], height: crop[3]))!
    let dw = Double(crop[2])*scale, dh = Double(crop[3])*scale
    let dx = Double(i*192) + target[0] + (Double(crop[0])-anchor[0])*scale
    let top = target[1] + (Double(crop[1])-anchor[1])*scale
    ctx.saveGState()
    ctx.clip(to: CGRect(x: i*192+2, y: 2, width: 188, height: 188))
    ctx.draw(piece, in: CGRect(x: dx, y: 192-top-dh, width: dw, height: dh))
    ctx.restoreGState()
}
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[3]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
assert(CGImageDestinationFinalize(dest))
