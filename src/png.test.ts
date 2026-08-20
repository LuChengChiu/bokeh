import { expect, test } from "vitest";
import { compose } from "./render";
import { toPng } from "./png";
import { decode, rgba, stripes, target } from "./fixtures";

test("nothing of the redacted region survives in the exported file", async () => {
  const src = stripes();
  const out = target();
  const sel = { x: 20, y: 20, w: 24, h: 24 };

  compose(out, src, sel, "redact", 0);
  const saved = await decode(await toPng(out));

  // Every pixel of the region is black in the decoded file. The source had white
  // stripes running through it, so any leak shows up here.
  for (let y = sel.y; y < sel.y + sel.h; y++) {
    for (let x = sel.x; x < sel.x + sel.w; x++) {
      expect({ x, y, px: rgba(saved, x, y) }).toEqual({ x, y, px: [0, 0, 0, 255] });
    }
  }

  // And the rest of the picture came through untouched.
  for (const [x, y] of [[0, 0], [10, 32], [14, 32], [63, 63], [32, 5], [50, 50]]) {
    expect(rgba(saved, x, y)).toEqual(rgba(src, x, y));
  }
});

test("a region with fractional edges leaves no half-covered pixel behind", async () => {
  const out = target();
  // Any drag leaves fractional edges; a fractional fillRect antialiases the boundary.
  const sel = { x: 20.4, y: 20.6, w: 24.3, h: 23.7 };

  compose(out, stripes(), sel, "redact", 0);
  const saved = await decode(await toPng(out));

  for (let y = Math.floor(sel.y); y < Math.ceil(sel.y + sel.h); y++) {
    for (let x = Math.floor(sel.x); x < Math.ceil(sel.x + sel.w); x++) {
      expect({ x, y, px: rgba(saved, x, y) }).toEqual({ x, y, px: [0, 0, 0, 255] });
    }
  }
});
