import { SEA_BANDS, SEA_LAYERS } from '../battle/SeaContent';

const WINDOW_TICKS = 36;   // 1.2s at the fixed 30Hz battle clock
const FADE_TICKS = 6;      // 0.2s in / 0.2s out
const REARM_MARGIN = 140;  // band half-width 60 + the design's 80m exit margin

/** "暮光层 · 800m" nameplate for band crossings (LOO-70 §3): fades in and out within a
 *  1.2s window, never repeats while the diver oscillates inside a band, and re-arms only
 *  after leaving the band by at least 80m on either side. */
export class LayerAnnouncer {
  visible = false;
  label = '';
  alpha = 0;
  private showing?: { boundary: number; startTick: number };
  private suppressed = Number.NaN;

  update(depth: number, tick: number): void {
    if (this.showing && tick - this.showing.startTick > WINDOW_TICKS) {
      this.suppressed = this.showing.boundary;
      this.showing = undefined;
    }
    if (!this.showing) {
      const band = SEA_BANDS.find(b => depth >= b.lo && depth <= b.hi);
      if (!band) {
        // Outside any band the plate never shows; leaving one by ≥80m re-arms its boundary.
        if (!Number.isNaN(this.suppressed)) {
          const left = SEA_BANDS.find(b => b.boundary === this.suppressed)!;
          if (Math.abs(depth - left.boundary) >= REARM_MARGIN) this.suppressed = Number.NaN;
        }
      } else if (this.suppressed !== band.boundary) {
        this.suppressed = Number.NaN;
        this.showing = { boundary: band.boundary, startTick: tick };
      }
    }
    this.visible = false;
    this.alpha = 0;
    const showing = this.showing;
    if (!showing) return;
    const elapsed = tick - showing.startTick;
    const layer = SEA_LAYERS.find(l => l.minDepth === showing.boundary)!;
    this.label = `${layer.name} · ${showing.boundary}m`;
    this.visible = true;
    // 0.2s in, steady, 0.2s out (6 ticks each at 30Hz).
    this.alpha = Math.min(1, elapsed / FADE_TICKS, (WINDOW_TICKS - elapsed) / FADE_TICKS);
  }
}
