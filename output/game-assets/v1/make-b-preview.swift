import Foundation
import AppKit
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: CommandLine.arguments[1])
let width = 1125, height = 1200
let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
func rect(_ color: NSColor, _ r: CGRect) { color.setFill(); r.fill() }
func label(_ text: String, _ x: CGFloat, _ y: CGFloat, _ light: Bool = true, _ size: CGFloat = 14) {
    (text as NSString).draw(at: CGPoint(x: x, y: y), withAttributes: [.font: NSFont.systemFont(ofSize: size, weight: .medium), .foregroundColor: light ? NSColor.white : NSColor(calibratedRed: 0.03, green: 0.18, blue: 0.25, alpha: 1)])
}
func asset(_ path: String, _ r: CGRect) {
    let source = CGImageSourceCreateWithURL(root.appendingPathComponent(path) as CFURL, nil)!
    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
    ctx.draw(image, in: r)
}
rect(NSColor(calibratedRed: 0.025, green: 0.12, blue: 0.18, alpha: 1), CGRect(x: 0, y: 0, width: width, height: height))
rect(NSColor(calibratedRed: 0.9, green: 0.95, blue: 0.95, alpha: 1), CGRect(x: 750, y: 0, width: 375, height: height))
label("B batch / 375 px layered scene", 15, 1165)
label("Dark backdrop / new assets", 390, 1165)
label("Light backdrop / new assets", 765, 1165, false)
ctx.saveGState()
ctx.clip(to: CGRect(x: 0, y: 370, width: 375, height: 750))
// Background covers viewport proportionally; side canvas overflow is cropped.
asset("sunlight/bg_sunlight_far.png", CGRect(x: -62.5, y: 370, width: 500, height: 750))
asset("sunlight/deco_sunlight_left.png", CGRect(x: -28, y: 370, width: 187.5, height: 750))
asset("sunlight/deco_sunlight_right.png", CGRect(x: 247.5, y: 370, width: 187.5, height: 750))
asset("sunlight/deco_sunlight_flora.png", CGRect(x: 5, y: 400, width: 85, height: 85))
asset("main/fx_sonic_ring.png", CGRect(x: 122, y: 670, width: 140, height: 140))
asset("main/fx_thruster.png", CGRect(x: 125, y: 730, width: 48, height: 24))
asset("main/hero_h01_idle.png", CGRect(x: 145, y: 695, width: 96, height: 96))
asset("main/fx_torpedo.png", CGRect(x: 265, y: 780, width: 48, height: 24))
asset("sunlight/fx_mine.png", CGRect(x: 264, y: 580, width: 30, height: 30))
asset("main/fx_crystal_drop.png", CGRect(x: 220, y: 635, width: 20, height: 20))
asset("main/fx_crystal_drop.png", CGRect(x: 241, y: 650, width: 20, height: 20))
asset("sunlight/enemy_normal_01_moon_jelly_idle.png", CGRect(x: 90, y: 930, width: 48, height: 48))
asset("sunlight/enemy_normal_02_lantern_angler_idle.png", CGRect(x: 245, y: 880, width: 48, height: 48))
asset("sunlight/enemy_normal_03_electric_eel_idle.png", CGRect(x: 86, y: 570, width: 48, height: 48))
asset("main/fx_bubble.png", CGRect(x: 200, y: 865, width: 16, height: 16))
ctx.restoreGState()
label("Separate background / reefs / coral", 15, 330)
label("Open center / no baked HUD", 15, 300)
label("A: 8/8 checked", 15, 240)
label("B: 19/46 checked this handoff", 15, 210)
label("MVP: 27/167 total", 15, 180)
label("HUD + animation + other enemies pending", 15, 130, true, 13)
label("Art composition only; no engine test", 15, 100, true, 13)

let mounts = [("main/mount_sonic.png", "SONIC"), ("sunlight/mount_torpedo.png", "TORPEDO"), ("sunlight/mount_arc.png", "ARC"), ("sunlight/mount_mine.png", "MINE")]
let effects: [(String, String, CGFloat, CGFloat)] = [
    ("main/fx_bubble.png", "bubble", 48, 48),
    ("sunlight/fx_glow.png", "glow", 64, 64),
    ("main/fx_crystal_drop.png", "crystal", 48, 48),
    ("main/fx_sonic_ring.png", "ring", 64, 64),
    ("main/fx_torpedo.png", "torpedo", 64, 32),
    ("sunlight/fx_arc.png", "arc", 64, 16),
    ("sunlight/fx_mine.png", "mine", 48, 48),
    ("main/fx_hit.png", "hit", 48, 48),
    ("main/fx_death_particle.png", "mote", 32, 32),
    ("main/fx_thruster.png", "thruster", 64, 32)
]
for col in 1...2 {
    let x = CGFloat(col * 375), light = col == 1
    for i in 0..<4 {
        asset(mounts[i].0, CGRect(x: x + 12 + CGFloat(i * 90), y: 1070, width: 64, height: 64))
        label(mounts[i].1, x + 16 + CGFloat(i * 90), 1040, light, 11)
        asset(mounts[i].0, CGRect(x: x + 20 + CGFloat(i * 90), y: 975, width: 48, height: 48))
    }
    label("128 px mounts / 64 + 48 px preview", x + 15, 950, light, 13)
    asset("main/hero_h01_idle.png", CGRect(x: x + 30, y: 800, width: 128, height: 128))
    asset("main/hero_h01_damaged.png", CGRect(x: x + 210, y: 800, width: 128, height: 128))
    label("Normal", x + 65, 770, light)
    label("Scuffed / thruster off", x + 200, 770, light, 12)
    for i in 0..<effects.count {
        let cellX = x + 10 + CGFloat((i % 5) * 72), cellY: CGFloat = i < 5 ? 660 : 545
        let e = effects[i]
        asset(e.0, CGRect(x: cellX + (64-e.2)/2, y: cellY + (64-e.3)/2, width: e.2, height: e.3))
        label(e.1, cellX + 4, cellY - 22, light, 11)
    }
    label("10 independent particle textures", x + 15, 485, light, 13)
    asset("sunlight/deco_sunlight_left.png", CGRect(x: x + 10, y: 120, width: 80, height: 320))
    asset("sunlight/deco_sunlight_right.png", CGRect(x: x + 100, y: 120, width: 80, height: 320))
    asset("sunlight/deco_sunlight_flora.png", CGRect(x: x + 235, y: 280, width: 100, height: 100))
    label("LEFT", x + 25, 90, light, 12)
    label("RIGHT", x + 120, 90, light, 12)
    label("CORAL", x + 255, 250, light, 12)
    label("True alpha / 8 px minimum safe edge", x + 15, 35, light, 13)
}
NSGraphicsContext.restoreGraphicsState()
let dest = CGImageDestinationCreateWithURL(root.appendingPathComponent("batch-b-review-r2.png") as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
assert(CGImageDestinationFinalize(dest))
