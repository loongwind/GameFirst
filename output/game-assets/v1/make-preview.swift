import Foundation
import AppKit
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: CommandLine.arguments[1])
let width = 1125, height = 900
let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
func rect(_ color: NSColor, _ r: CGRect) { color.setFill(); r.fill() }
func label(_ text: String, _ x: CGFloat, _ y: CGFloat, _ light: Bool = true, _ size: CGFloat = 15) {
    (text as NSString).draw(at: CGPoint(x: x, y: y), withAttributes: [.font: NSFont.systemFont(ofSize: size, weight: .medium), .foregroundColor: light ? NSColor.white : NSColor(calibratedRed: 0.03, green: 0.18, blue: 0.25, alpha: 1)])
}
func asset(_ path: String, _ r: CGRect) {
    let source = CGImageSourceCreateWithURL(root.appendingPathComponent(path) as CFURL, nil)!
    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
    ctx.draw(image, in: r)
}
rect(NSColor(calibratedRed: 0.025, green: 0.12, blue: 0.18, alpha: 1), CGRect(x: 0, y: 0, width: width, height: height))
rect(NSColor(calibratedRed: 0.9, green: 0.95, blue: 0.95, alpha: 1), CGRect(x: 750, y: 0, width: 375, height: height))
label("A batch / 375 px viewport", 18, 865)
label("Dark backdrop / native assets", 392, 865)
label("Light backdrop / native assets", 767, 865, false)
asset("main/bg_sunlight_lite.png", CGRect(x: 0, y: 80, width: 375, height: 750))
asset("main/hero_h01_idle.png", CGRect(x: 140, y: 400, width: 96, height: 96))
let enemies = ["sunlight/enemy_normal_01_moon_jelly_idle.png", "sunlight/enemy_normal_02_lantern_angler_idle.png", "sunlight/enemy_normal_03_electric_eel_idle.png"]
asset(enemies[0], CGRect(x: 70, y: 580, width: 48, height: 48))
asset(enemies[1], CGRect(x: 265, y: 520, width: 48, height: 48))
asset(enemies[2], CGRect(x: 60, y: 285, width: 48, height: 48))
asset("main/icon_oxygen.png", CGRect(x: 24, y: 760, width: 24, height: 24))
asset("meta/icon_crystal.png", CGRect(x: 62, y: 760, width: 24, height: 24))
label("Ship 96 px / creatures 48 px / icons 24 px", 12, 44, true, 13)
label("Button pending; no UI placeholder included", 12, 20, true, 12)
for col in 1...2 {
    let x = CGFloat(col * 375), light = col == 1
    asset("main/hero_h01_idle.png", CGRect(x: x + 62, y: 565, width: 250, height: 250))
    label("H-01 / 512 x 512 / right-facing", x + 20, 540, light)
    for i in 0..<3 { asset(enemies[i], CGRect(x: x + 13 + CGFloat(i * 120), y: 390, width: 110, height: 110)) }
    label("192 px masters / distinct silhouettes", x + 20, 365, light)
    for i in 0..<3 { asset(enemies[i], CGRect(x: x + 45 + CGFloat(i * 100), y: 280, width: 48, height: 48)) }
    label("48 px readability", x + 20, 250, light)
    asset("main/icon_oxygen.png", CGRect(x: x + 45, y: 130, width: 96, height: 96))
    asset("meta/icon_crystal.png", CGRect(x: x + 205, y: 130, width: 96, height: 96))
    asset("main/icon_oxygen.png", CGRect(x: x + 80, y: 70, width: 24, height: 24))
    asset("meta/icon_crystal.png", CGRect(x: x + 240, y: 70, width: 24, height: 24))
    label("Icons / 96 px source + 24 px preview", x + 20, 35, light, 13)
}
NSGraphicsContext.restoreGraphicsState()
let dest = CGImageDestinationCreateWithURL(root.appendingPathComponent("batch-a-review.png") as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
assert(CGImageDestinationFinalize(dest))
