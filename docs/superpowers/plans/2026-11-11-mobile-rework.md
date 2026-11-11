# LOO-62 independent-review rework plan

**Goal:** Close the PM's one P1 and two P2 findings without changing combat rules or redoing accepted controls/camera/weapons.

**Spec:** Current LOO-62 description, PM rework order dated 2026-11-11; LOO-59 report/comment 01a1c8d7-bb9b-7aa7-bb17-50f9ebc409cc.

**Baseline:** loo-62-mobile-combat at d5b527c; existing public source e0d8e5f. In-place workspace; only this run active. Preserve independent-mobile-d5b527c and all pre-existing untracked files. One-shot wakeup already disabled.

**Architecture:** Remove AI-only avoidance metadata from player-facing rendering/tutorial; leave metadata and steering intact. Pass actual CSS viewport dimensions to HUD sizing, measure targets independently from UITransform world bounds and canvas DOM rect. Draw cached irregular, faceted rock hulls around the unchanged collision circle; sharp corners are decorative and their maximum extent is documented.

- [x] Reproduce semantic mismatch, real CSS target shrink, and round-rock presentation; preserve before screenshots/JSON.
- [x] Add RED regressions for metadata-independent world rendering and actual CSS hit bounds; geometric tests tie rock hull to the unchanged collider.
- [x] Remove false hazard cues; fix physical target conversion (including resize/DPR/short landscape/modal); improve rock silhouette/material/volume.
- [ ] Verify focused tests, full unit suite/typechecks, Cocos release, controls/camera/weapons, tutorial/ads/save/settlement, release isolation and both stress tiers.
- [ ] Commit/push, rebuild with clean source version, update existing Pages, verify local/public semantics/targets/rocks and version/hash, attach evidence and report once, return in_review for PM to reuse LOO-59.

**Review focus:** CSS pixels differ from logical and device pixels; all seven key controls must fit safe bounds. Oxygen card and modal text must fit resized controls. No red overlay may survive a fresh save, restored save, normal/tutorial or low tier. Rock vertices remain outside the collider but limited to a small decorative corner margin; no new collision or per-frame node allocation.

**Corrections:** Prior claims of real danger damage and >=44CSSpx at 320px were wrong. Current findings supersede those parts of the first report.

**Ledger:** Initial built-scene regression RED3/3 (high/low AI overlay present, 320px pause only37.55CSSpx), then GREEN3/3. Geometry RED missing hull implementation then GREEN. Full unit148/148; three typechecks pass. Original UI/controls/ads/quality/weapons/tutorial regression9/9 passed. Read-only reviewer found compact modal clipping at844×390 and375×400; reproduced real rescue text height23.28 vs3×14 needed, then corrected compact CSS target/typography and threshold; expanded regression GREEN at six viewports and DPR1/3. Source battle/shared unchanged. Exact final build/deployment and performance recorded in the rework report.
