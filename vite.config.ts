/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  test: {
    // The product is canvas pixels. jsdom has no renderer, so every seam that
    // matters has to run in a real browser.
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
