export type Sel = { x: number; y: number; w: number; h: number };
export type Mode = "blur" | "redact";

function c2d(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c.getContext("2d")!;
}

/**
 * Canvas `filter: blur()` samples transparent pixels beyond the image edge, which
 * shows up as a dark border on all four sides. So blur a padded copy whose padding
 * is filled by stretching the outermost row and column outward, then crop back.
 * The pad is 4 sigma: at 3 sigma the tail still leaves a visible 1-2/255 of falloff
 * at the crop line, and the whole point is that there is nothing to see.
 *
 * The blur runs on a downscaled copy so cost does not grow with the radius. A phone
 * photo is ~12M px and iOS Safari caps canvas area near 16.7M, so padding a full-size
 * copy by 4r would blow past the cap on the median input. Detail lost to the
 * downscale is detail the blur was about to destroy anyway.
 */
function blurred(img: CanvasImageSource, w: number, h: number, radius: number): HTMLCanvasElement {
  const k = Math.max(1, radius / 4);
  const sigma = radius / k;
  const sw = Math.max(1, Math.round(w / k));
  const sh = Math.max(1, Math.round(h / k));
  const pad = Math.ceil(4 * sigma);
  const a = c2d(sw + 2 * pad, sh + 2 * pad);
  const A = a.canvas;
  // The downscale is the low-pass. At default quality it is a 2x2 sample out of each
  // source block, which aliases fine detail into moire instead of averaging it away.
  a.imageSmoothingQuality = "high";
  a.drawImage(img, pad, pad, sw, sh);

  a.drawImage(A, pad, pad, sw, 1, pad, 0, sw, pad);
  a.drawImage(A, pad, pad + sh - 1, sw, 1, pad, pad + sh, sw, pad);
  a.drawImage(A, pad, pad, 1, sh, 0, pad, pad, sh);
  a.drawImage(A, pad + sw - 1, pad, 1, sh, pad + sw, pad, pad, sh);
  a.drawImage(A, pad, pad, 1, 1, 0, 0, pad, pad);
  a.drawImage(A, pad + sw - 1, pad, 1, 1, pad + sw, 0, pad, pad);
  a.drawImage(A, pad, pad + sh - 1, 1, 1, 0, pad + sh, pad, pad);
  a.drawImage(A, pad + sw - 1, pad + sh - 1, 1, 1, pad + sw, pad + sh, pad, pad);

  const b = c2d(A.width, A.height);
  b.filter = `blur(${sigma}px)`;
  b.drawImage(A, 0, 0);

  // Crop to a tile that is opaque edge to edge before scaling back up. Upsampling
  // straight out of the padded canvas lets a wide resampling kernel reach past the
  // sub-rectangle and drag the padded canvas's own outer falloff back into frame.
  const tile = c2d(sw, sh);
  tile.drawImage(b.canvas, pad, pad, sw, sh, 0, 0, sw, sh);

  const out = c2d(w, h);
  out.imageSmoothingQuality = "high";
  out.drawImage(tile.canvas, 0, 0, w, h);
  return out.canvas;
}

// ponytail: one slot, keyed by identity. The app only ever holds one picture, and a
// frame drag must not pay for a re-blur. Swap for a Map if multiple regions land.
let memo: { img: CanvasImageSource; w: number; h: number; radius: number; canvas: HTMLCanvasElement } | null =
  null;

function blurredCached(img: CanvasImageSource, w: number, h: number, radius: number) {
  if (memo && memo.img === img && memo.w === w && memo.h === h && memo.radius === radius) return memo.canvas;
  const canvas = blurred(img, w, h, radius);
  memo = { img, w, h, radius, canvas };
  return canvas;
}

/** Drop the held picture and its full-size blur. Call when the picture is replaced. */
export function forgetBlur(): void {
  memo = null;
}

export function compose(
  target: HTMLCanvasElement,
  img: CanvasImageSource,
  sel: Sel,
  mode: Mode,
  radius: number,
): void {
  const { width: w, height: h } = target;
  const g = target.getContext("2d")!;
  g.clearRect(0, 0, w, h);

  // The two modes need opposite masks. Blur softens the surround and keeps the
  // region sharp; redact leaves the picture alone and destroys the region.
  if (mode === "redact") {
    g.drawImage(img, 0, 0);
    g.fillStyle = "#000";
    // Round outward. A drag leaves fractional edges, and a fractional fillRect
    // antialiases the boundary row and column, leaving half the original signal there.
    const x = Math.floor(sel.x);
    const y = Math.floor(sel.y);
    g.fillRect(x, y, Math.ceil(sel.x + sel.w) - x, Math.ceil(sel.y + sel.h) - y);
    return;
  }

  g.drawImage(radius > 0 ? blurredCached(img, w, h, radius) : img, 0, 0);
  g.save();
  g.beginPath();
  g.rect(sel.x, sel.y, sel.w, sel.h);
  g.clip();
  g.drawImage(img, 0, 0);
  g.restore();
}
