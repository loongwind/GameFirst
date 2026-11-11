# Mobile combat repair implementation plan

**Goal:** Implement LOO-62's five phone playtest fixes in the existing Cocos 3.8.8 game.

**Architecture:** Keep combat and economy rules intact. Use one shared camera projection for all world presentation, a floating single-owner touch gesture, and a compact instrument HUD with contextual prompts.

**Tech Stack:** Cocos Creator 3.8.8, TypeScript, node:test, Playwright/CDP touch input.

**Spec:** Multica LOO-62, parent LOO-61 (read 2026-11-11).

## Constraints and choices

- Continue in place on `loo-62-mobile-combat` from `83984ea`; preserve all pre-existing untracked files and main/tag.
- Detailed issue authorizes implementation and safe update to existing Pages preview. No merge or new tag.
- Use restrained submarine instruments: two compact rows, small depth marker, bottom actions; tutorial/status shown in context. No new bitmap art required.
- A dead zone (48 horizontal / 64 vertical logical pixels) allows visible player travel before following. Share interpolation and projection across sprites, hazards, projectiles, loot and text.
- Preserve circular collision footprints with textured scalloped rocks following the same boundary, striped red danger areas, directional torpedoes, expanding sonic waves, anchored mines and electric arcs.
- No balance, reward, collision or fire-rate changes; reuse Graphics and existing pools, low tier drops decorative trails/text while retaining danger and hit cues.

## Tasks

- [x] Capture actual baseline at 375×667, 390×844, 320×640 with safe insets; compare public preview to local release.
- [x] Add failing full-area input and compact-layout regressions; add projection invariants. Run RED before implementation.
- [x] Implement gesture ownership, button exclusion, cancellation/lifecycle cleanup, floating visual feedback.
- [x] Implement camera and shared world rendering, player heading/swim feedback, rocks/hazards and weapon/hit presentation.
- [ ] Verify unit suite and type checks; real Creator debug/release builds; browser input, lifecycle, ads, tutorial, save and quality regressions; stress both tiers at 80/200/100/30.
- [ ] Capture matching after screenshots and movement recording; write exact limits and five-item results; commit, push, PR if available, update existing preview with version manifest and verify public build.
- [ ] Deliver one final issue comment with artifacts; set in_review for PM and existing LOO-59 independent retest.

## Review focus

- Second finger cannot steal movement, including when first finger is released.
- Disabled visible buttons still reserve their area; transparent labels and nonblocking card backgrounds do not reserve combat space.
- Stop on cancel/blur/pause/resize; keyboard and neutral manual sonar takeover retain their intended priority.
- Viewport resize and restored saves must not split the HUD and sprite coordinate systems.
- Headless desktop measurements cannot establish physical phone performance.

## Evidence ledger

- Baseline actual local/public capture: center drag x/y stayed 0/0, legacy area moved x ≈74.4; errors empty.
- Baseline `npm test`: 143/144. Existing `effect checkpoint failure after claim is retried, reload reconciles claimed rescue before decline` fails because restored state is PendingSettlement instead of Running (fixture restores using wall clock rather than injected Nov 10 clock). Preserve and diagnose separately from visual repair.
- Resolved the test fixture clock leak without altering its assertions or production reward logic. Full suite 147/147 and all type checks pass.
- Read-only reviewer found the first interpolation getter was reading Battle's inactive accumulator. Added a RED→GREEN session-clock regression, moved getter to DiveSession, and corrected HUD wiring. Reviewer confirmed no remaining important findings.
- CDP partial `touchEnd` takes released points; event tracing confirmed the first multi-touch test accidentally released finger 2. Corrected the test to release the owner and verified the surviving finger cannot move. No production workaround added.
- Final release/debug mobile regression covers 375×667, 390×844 and 320×640 safe areas, all five start regions, neutral origin, single owner, cancel, buttons, pause, blur, keyboard and actor/world offsets. Debug Mock entry passes using the pre-existing untracked driver; its prior clean-checkout delivery omission remains outside this repair and the file is preserved.
- Ruling: PR should target `loo-58-rework` at 83984ea, keeping prior economics separate from this delta. GitHub CLI has no authenticated account; SSH push is checked separately. No main/tag changes.
