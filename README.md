# Bokeh

Bokeh or black out part of a picture, in the browser. Nothing is uploaded — the picture is
decoded, composed and encoded on the device, and the build is a single self-contained HTML
file you can open from disk.

The built file carries a `default-src 'none'` content security policy — inline scripts are
allowed by hash and nothing else loads, so the page has no way to reach the network.

## Use

1. Choose a picture, drop one on the window, or paste from the clipboard.
2. Drag the region over what should be hidden; drag the handles to resize it, or use arrow
   keys (shift for 10px steps) when it's focused.
3. Pick a mode:
   - **Bokeh** keeps the region sharp and softens everything around it. A blur can
     sometimes be reversed — don't use it for secrets.
   - **Redact** fills the region with solid black. Nothing of it survives in the saved file.
4. **Save** shares the PNG on mobile (Web Share) or downloads `bokeh.png` elsewhere.

Pan with one finger or a wheel, zoom with a pinch or ctrl+wheel, double-tap to toggle
true size.

## Develop

```sh
npm install
npm run dev     # vite dev server
npm test        # vitest, real Chromium via Playwright
npm run build   # single-file bundle in dist/
```

Tests run in a real browser: the product is canvas pixels, and jsdom has no renderer.
Some tests compare against screenshots in `src/__screenshots__/` (gitignored — they are
regenerated on first run).

## Layout

| File | What it holds |
| --- | --- |
| `src/App.tsx` | State, gestures (pan/pinch/drag/double-tap), save |
| `src/render.ts` | Canvas composition — edge-safe blur, hard-edged redact |
| `src/view.ts` | Zoom/pan math and region clamping, all pure |
| `src/load.ts` | File → `ImageBitmap` with EXIF rotation, plus fallbacks |
| `src/png.ts` | Canvas → PNG blob, with the canvas-size-cap error |
| `src/Frame.tsx`, `src/Dock.tsx` | Region outline + handles, controls |

Known limits: HEIC, camera RAW, and SVGs without an intrinsic size can't be decoded;
very large pictures can exceed the browser's canvas area cap (~16.7M px on iOS Safari)
when saving.

## License

Apache-2.0 — see [LICENSE](LICENSE).
