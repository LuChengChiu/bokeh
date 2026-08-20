export type Picture = { src: ImageBitmap | HTMLImageElement; w: number; h: number };

/** OS pickers routinely mis-report .jpeg and .jfif, so fall back to the extension. */
const IMAGE_EXT = /\.(png|jpe?g|jfif|pjpeg|gif|webp|bmp|avif|svg)$/i;

function viaObjectURL(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // An SVG with no intrinsic width and height loads fine and measures 0x0.
      if (img.naturalWidth && img.naturalHeight) resolve(img);
      else reject(new Error("no intrinsic size"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

export async function loadPicture(file: File): Promise<Picture> {
  const looksLikeImage =
    /^image\//.test(file.type) ||
    ((!file.type || file.type === "application/octet-stream") && IMAGE_EXT.test(file.name));
  if (!looksLikeImage) {
    throw new Error(`Not an image: ${file.name || "unnamed file"} (${file.type || "no file type reported"}).`);
  }

  // createImageBitmap decodes the blob directly and applies EXIF rotation, so phone
  // photos are not sideways and no URL is involved.
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (!bmp.width || !bmp.height) throw new Error("no intrinsic size");
    return { src: bmp, w: bmp.width, h: bmp.height };
  } catch {
    try {
      const img = await viaObjectURL(file);
      return { src: img, w: img.naturalWidth, h: img.naturalHeight };
    } catch {
      throw new Error(
        `Could not decode ${file.name || "that file"}. HEIC, camera RAW and SVGs without a fixed width and height aren't supported here — export a JPEG or PNG and try again.`,
      );
    }
  }
}
