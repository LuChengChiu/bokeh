import { expect, test } from "vitest";
import { build, type Rollup } from "vite";

/**
 * The promise is that the picture never leaves the device, and on a deployed page the
 * only thing enforcing that is the built file itself: one document, no subresources,
 * and a policy that cannot reach the network. These run the real build and read the
 * real bytes — nothing here should care how the CSP got there, only that it is correct.
 */
// Vite decides development vs production from NODE_ENV, not from the build mode, and
// vitest sets it to "test". Without this the suite would assert against a development
// bundle — different code, different hashes — and never see the file that ships.
// @types/node is deliberately not installed, so declare the one field this needs.
declare const process: { env: { NODE_ENV: string } };
process.env.NODE_ENV = "production";

// write: false keeps the whole build in memory, so running the suite never touches dist/.
const bundle = (await build({ logLevel: "silent", build: { write: false } })) as Rollup.RollupOutput;
const entry = bundle.output.find((o) => o.fileName === "index.html");
if (!entry || entry.type !== "asset") throw new Error("the build emitted no index.html");
const html = entry.source.toString();

const inline = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;

function policy(): string {
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
  if (!meta) throw new Error("no Content-Security-Policy meta tag in the built file");
  return meta[1];
}

test("the built file carries a policy that cannot reach the network", () => {
  expect(policy()).toContain("default-src 'none'");

  // Whatever the policy does allow has to be a destination that stays on the device.
  for (const directive of policy().split(";").map((d) => d.trim())) {
    expect(directive).not.toMatch(/https?:/);
  }
});

test("the built file pulls in nothing from outside itself", () => {
  // Every asset is inlined, so the shipped bundle is one document and nothing else.
  expect(bundle.output.map((o) => o.fileName)).toEqual(["index.html"]);

  // Scan the markup only. The inlined bundle is full of strings like `+e.href+` that
  // look like attributes but are JavaScript, so script and style bodies come out first.
  const markup = html.replace(inline, "<script></script>").replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");

  // A src or href reaching off the device would be a request the CSP has to refuse.
  // Better to never emit one than to rely on the policy catching it. blob: and data: only,
  // since those are all the policy allows and neither leaves the device.
  for (const [, url] of markup.matchAll(/\s(?:src|href)="([^"]*)"/g)) {
    expect({ url, ok: /^(blob|data):/.test(url) }).toEqual({ url, ok: true });
  }
});

test("every inline script is hashed in the policy", async () => {
  const scripts = [...html.matchAll(inline)];
  expect(scripts.length).toBeGreaterThan(0);

  for (const [, body] of scripts) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
    const hash = `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`;
    // A stale hash is the failure mode of the csp() plugin: the page ships, and every
    // script on it is silently refused.
    expect({ hash, listed: policy().includes(hash) }).toEqual({ hash, listed: true });
  }
});
