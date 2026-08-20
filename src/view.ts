/** Where the picture sits in the workspace: a scale and a translation, in CSS pixels. */
export type View = { s: number; tx: number; ty: number };

/** Workspace coordinates -> image pixels. */
export function toImage(v: View, cx: number, cy: number): { x: number; y: number } {
  return { x: (cx - v.tx) / v.s, y: (cy - v.ty) / v.s };
}

/**
 * Scale about a point, keeping whatever is under that point exactly where it is.
 * Without the translation correction the zoom anchors to the top-left corner and
 * the picture shoots away from your fingers.
 */
export function zoomAt(v: View, px: number, py: number, next: number): View {
  const k = next / v.s;
  return { s: next, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k };
}

import type { Sel } from "./render";

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Scale that shows the whole picture. Never scales up: small pictures sit at true size. */
export function fitScale(iw: number, ih: number, ww: number, wh: number): number {
  return Math.min(1, Math.min(ww / iw, wh / ih));
}

// ponytail: hard clamp, no rubber-band or momentum. The picture is always flush to the
// window edge. If that reads rigid rather than tight, a velocity tracker and a spring
// go here — about 60 lines.
export function clampView(v: View, iw: number, ih: number, ww: number, wh: number): View {
  const w = iw * v.s;
  const h = ih * v.s;
  return {
    s: v.s,
    tx: w <= ww ? (ww - w) / 2 : clamp(v.tx, ww - w, 0),
    ty: h <= wh ? (wh - h) / 2 : clamp(v.ty, wh - h, 0),
  };
}

/** Smallest region, in image pixels: 24 by spec, but never smaller than the handles. */
export const minSel = (scale: number) => Math.max(24, 48 / scale);

export function clampSel(sel: Sel, iw: number, ih: number, min: number): Sel {
  // A minimum wider than the picture inverts the clamps and pushes the region off the
  // edge. A long screenshot drawn narrower than the handles hits this on the first fit.
  const m = Math.min(min, iw, ih);
  const w = clamp(sel.w, m, iw);
  const h = clamp(sel.h, m, ih);
  return { x: clamp(sel.x, 0, iw - w), y: clamp(sel.y, 0, ih - h), w, h };
}

/** Moving is not resizing: dragging a region must never grow it to the current minimum. */
export function moveSel(sel: Sel, iw: number, ih: number): Sel {
  return {
    ...sel,
    x: clamp(sel.x, 0, Math.max(0, iw - sel.w)),
    y: clamp(sel.y, 0, Math.max(0, ih - sel.h)),
  };
}

export function resizeSel(handle: string, start: Sel, ix: number, iy: number, iw: number, ih: number, min: number): Sel {
  const m = Math.min(min, iw, ih);
  let x1 = start.x;
  let y1 = start.y;
  let x2 = start.x + start.w;
  let y2 = start.y + start.h;
  if (handle.includes("n")) y1 = Math.min(iy, y2 - m);
  if (handle.includes("s")) y2 = Math.max(iy, y1 + m);
  if (handle.includes("w")) x1 = Math.min(ix, x2 - m);
  if (handle.includes("e")) x2 = Math.max(ix, x1 + m);
  return clampSel({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, iw, ih, m);
}
