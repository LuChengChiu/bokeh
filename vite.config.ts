/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { playwright } from "@vitest/browser-playwright";

/**
 * The promise is that the picture never leaves the device, so the built file carries a
 * policy that cannot reach the network at all: inline scripts by hash, blob: images for
 * the decode fallback, and nothing else. Build only — the dev server needs its own
 * inline preamble and an HMR socket, neither of which the shipped file has.
 */
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

function csp(): Plugin {
  return {
    name: "csp",
    apply: "build",
    enforce: "post", // the policy has to hash the final HTML, after singlefile has inlined it
    async generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== "asset" || !asset.fileName.endsWith(".html")) continue;
        const html = String(asset.source);
        const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)];
        const hashes = await Promise.all(inline.map(async (m) => `'sha256-${await sha256(m[1])}'`));
        const policy = [
          "default-src 'none'",
          `script-src ${hashes.join(" ")}`,
          "style-src 'unsafe-inline'", // the inlined stylesheet, plus React's style attributes
          "img-src blob: data:", // the object-URL fallback in load.ts, and the inline SVG favicon
          "base-uri 'none'",
          "form-action 'none'",
        ].join("; ");
        asset.source = html.replace(
          "<head>",
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), viteSingleFile(), csp()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "app",
          include: ["src/**/*.test.ts"],
          // The product is canvas pixels. jsdom has no renderer, so every seam that
          // matters has to run in a real browser.
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
      {
        // The build test reads the emitted file. It needs no renderer, and it cannot
        // run inside one, since it drives vite itself.
        test: { name: "build", include: ["build.test.ts"], environment: "node" },
      },
    ],
  },
});
