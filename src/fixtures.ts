/** 64x64 of hard 4px black/white vertical stripes: a sharp pixel is exactly 0 or 255. */
export function stripes(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  for (let x = 0; x < 64; x += 8) {
    g.fillStyle = "#000";
    g.fillRect(x, 0, 4, 64);
    g.fillStyle = "#fff";
    g.fillRect(x + 4, 0, 4, 64);
  }
  return c;
}

export function flat(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgb(128,128,128)";
  g.fillRect(0, 0, 64, 64);
  return c;
}

export function target(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  return c;
}

/** Red channel at a pixel; the fixtures are greyscale so one channel says everything. */
export const at = (c: HTMLCanvasElement, x: number, y: number) =>
  c.getContext("2d")!.getImageData(x, y, 1, 1).data[0];

/** Full RGBA at a pixel. */
export const rgba = (c: HTMLCanvasElement, x: number, y: number) =>
  Array.from(c.getContext("2d")!.getImageData(x, y, 1, 1).data);

/** Decode an encoded image back into a canvas, so tests read the saved file, not the preview. */
export async function decode(blob: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  return c;
}
