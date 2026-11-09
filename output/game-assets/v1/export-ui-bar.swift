// Normalize an image_gen fill strip using the authorized horizontal 8px slices.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let a = CommandLine.arguments
let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, nil)!
let whole = CGImageSourceCreateImageAtIndex(source, 0, nil)!
let crop = CGRect(x: Int(a[3])!, y: Int(a[4])!, width: Int(a[5])!, height: Int(a[6])!)
let image = whole.cropping(to: crop)!
let ctx = CGContext(data: nil, width: 128, height: 16, bitsPerComponent: 8, bytesPerRow: 512, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.clear(CGRect(x: 0, y: 0, width: 128, height: 16))
ctx.interpolationQuality = .high
let cap = CGFloat(image.height) / 2
let sx: [CGFloat] = [0, cap, CGFloat(image.width)-cap, CGFloat(image.width)]
let dx: [CGFloat] = [0, 8, 120, 128]
for i in 0..<3 {
    let piece = image.cropping(to: CGRect(x: sx[i], y: 0, width: sx[i+1]-sx[i], height: CGFloat(image.height)))!
    ctx.draw(piece, in: CGRect(x: dx[i], y: 0, width: dx[i+1]-dx[i], height: 16))
}
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
assert(CGImageDestinationFinalize(dest))
