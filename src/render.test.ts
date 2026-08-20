import { expect, test } from "vitest";
import { compose } from "./render";
import { at, flat, rgba, stripes, target } from "./fixtures";




test("blur keeps the region sharp and softens everything around it", () => {
  const out = target();

  compose(out, stripes(), { x: 20, y: 20, w: 24, h: 24 }, "blur", 6);

  // Inside the region the stripes are untouched, so they are still pure black and white.
  expect(at(out, 25, 32)).toBe(0);
  expect(at(out, 29, 32)).toBe(255);

  // Outside, a blur wide enough to span several stripes leaves grey: no pure value survives.
  const outside = at(out, 10, 32);
  expect(outside).toBeGreaterThan(40);
  expect(outside).toBeLessThan(215);
});

test("redact does the opposite: the region is destroyed, the surround is untouched", () => {
  const out = target();

  compose(out, stripes(), { x: 20, y: 20, w: 24, h: 24 }, "redact", 6);

  // Outside the region nothing happened at all, so the stripes are still hard-edged.
  expect(at(out, 10, 32)).toBe(0);
  expect(at(out, 14, 32)).toBe(255);

  // Inside, the white stripe is gone as completely as the black one: no information left.
  expect(at(out, 25, 32)).toBe(0);
  expect(at(out, 29, 32)).toBe(0);
});



test("blurring a flat image changes nothing, so no dark edge appears at any radius", () => {
  for (const radius of [4, 20, 40]) {
    const out = target();
    compose(out, flat(), { x: 28, y: 28, w: 8, h: 8 }, "blur", radius);

    // A Gaussian of a constant is that constant. Every border pixel must still be
    // opaque mid-grey; anything less is the blur sampling past the image edge.
    for (const [x, y] of [[0, 0], [63, 0], [0, 63], [63, 63], [32, 0], [0, 32], [63, 32], [32, 63]]) {
      const [r, , , a] = rgba(out, x, y);
      expect(a).toBe(255);
      expect(Math.abs(r - 128)).toBeLessThanOrEqual(3);
    }
  }
});
