/**
 * Encode the composed canvas. `toBlob` hands back null rather than throwing when the
 * canvas is past the browser's area cap (~16.7M px on iOS Safari), so that case has
 * to be caught here or it surfaces as silence.
 */
export function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else
        reject(
          new Error(
            `Couldn't save — ${canvas.width} × ${canvas.height} is past this browser's canvas limit. Try a smaller picture.`,
          ),
        );
    }, "image/png");
  });
}
