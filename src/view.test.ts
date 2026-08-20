import { expect, test } from "vitest";
import { clampSel, fitScale, minSel, moveSel, toImage, zoomAt, type View } from "./view";

test("zooming about a point keeps that point over the same image pixel", () => {
  const before: View = { s: 0.31, tx: 40, ty: 120 };
  const px = 180;
  const py = 300;
  const anchor = toImage(before, px, py);

  const after = zoomAt(before, px, py, 1);

  expect(after.s).toBe(1);
  const pinned = toImage(after, px, py);
  expect(pinned.x).toBeCloseTo(anchor.x, 6);
  expect(pinned.y).toBeCloseTo(anchor.y, 6);

  // Guard against a do-nothing implementation passing: everywhere else must move.
  expect(toImage(after, px + 100, py).x).not.toBeCloseTo(toImage(before, px + 100, py).x, 2);
});

test("a picture narrower than the handles still gets a region inside it", () => {
  // A 1179x25000 screenshot fits a phone at s=0.0338, where the handle minimum (48/s)
  // is wider than the picture itself. The region must not invert out of frame.
  const iw = 1179;
  const ih = 25000;
  const sel = clampSel({ x: 294, y: 6250, w: 589, h: 12500 }, iw, ih, minSel(fitScale(iw, ih, 390, 844)));

  expect(sel.x).toBeGreaterThanOrEqual(0);
  expect(sel.y).toBeGreaterThanOrEqual(0);
  expect(sel.x + sel.w).toBeLessThanOrEqual(iw);
  expect(sel.y + sel.h).toBeLessThanOrEqual(ih);
});

test("moving a region never resizes it, however far it is pushed", () => {
  const sel = { x: 100, y: 100, w: 30, h: 30 };

  for (const [dx, dy] of [[1, 0], [-9999, 0], [0, 9999]]) {
    const moved = moveSel({ ...sel, x: sel.x + dx, y: sel.y + dy }, 3000, 2000);
    expect([moved.w, moved.h]).toEqual([sel.w, sel.h]);
    expect(moved.x).toBeGreaterThanOrEqual(0);
    expect(moved.y + moved.h).toBeLessThanOrEqual(2000);
  }
});
