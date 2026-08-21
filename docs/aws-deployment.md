# Spec: Publish Bokeh on AWS

Status: ready-for-agent
Scope: deployment infrastructure and the build-output contract that guards it.

## Problem Statement

Bokeh works, but it only exists on the machine that built it. Someone who needs to
redact a screenshot right now cannot be handed a link — they have to clone the repo,
install a toolchain, and run a build, which nobody is going to do to blur a phone
number out of a receipt. The `dist/index.html` file can be opened from disk, but
sending a stranger an HTML file and asking them to trust it and open it locally is a
worse ask than sending a URL.

At the same time, the whole promise of the product is that the picture never leaves the
device. Publishing it must not quietly weaken that. A host that terminates TLS badly, a
CDN that injects a script, an analytics tag, or any origin that could receive an upload
turns the README's central claim into a lie — and the person redacting a passport scan
has no way to tell from the outside.

The maintainer also does not want to pay for this. A personal tool that gets a few
thousand views a month should not carry a monthly bill, and it definitely should not
carry a fixed monthly floor that accrues whether anyone visits or not.

## Solution

Publish the existing single-file build at a custom domain, served as one static object
from a CDN, with no backend of any kind. Pushing to `main` builds, tests, and deploys
automatically.

The deployed page is byte-for-byte the same self-contained file that already ships from
`npm run build`: one HTML document carrying its own `Content-Security-Policy` meta tag
with `default-src 'none'`. There is no server that could receive a picture, because
there is no server — only an object in a bucket behind a cache. The privacy claim
becomes verifiable by anyone who opens devtools and watches the network tab stay empty
after the initial document loads.

Cost is effectively zero: the design deliberately avoids every AWS service that charges
a fixed monthly fee, and sits inside CloudFront's permanent free tier.

Alongside the infrastructure, one new test locks the property that makes publishing
safe: that the built artifact really is self-contained and its CSP really does cover
the scripts it ships.

## User Stories

**Reaching the tool**

1. As someone who needs to redact a screenshot, I want to open Bokeh at a URL, so that I can use it without installing anything.
2. As someone recommending Bokeh, I want to send a friend a link, so that they can try it without me talking them through a build.
3. As a mobile user, I want the page to load on my phone over cellular, so that I can redact a photo where I took it.
4. As a first-time visitor, I want the page to be interactive in well under a second, so that I don't bounce before it renders.
5. As a repeat visitor, I want the page to load instantly from browser cache, so that reaching for the tool feels free.
6. As a visitor in Taiwan, I want the page served from a nearby edge, so that latency is measured in tens of milliseconds rather than hundreds.
7. As a visitor anywhere else in the world, I want the same page from my own nearest edge, so that the tool isn't only fast for its author.

**Trusting the tool**

8. As a privacy-conscious user, I want the site served over HTTPS end to end, so that nothing between me and the origin can read or alter the page.
9. As a privacy-conscious user, I want the deployed page to make zero network requests after the document loads, so that I can confirm my picture cannot be uploaded.
10. As a privacy-conscious user, I want the shipped `Content-Security-Policy` to forbid all network destinations, so that even a compromised dependency could not exfiltrate my picture.
11. As a security reviewer, I want the CSP hashes in the deployed file to actually match the scripts it runs, so that the policy is real enforcement rather than decoration.
12. As a visitor, I want no analytics, no tag manager, and no third-party fonts on the page, so that visiting the tool isn't itself a tracked event.
13. As a visitor, I want standard security headers on the response, so that the page gets HSTS, nosniff, and framing protection on top of its own policy.
14. As a maintainer, I want the S3 bucket to be private with no public access, so that the CDN is the only path to the object and there is no second, unhardened URL.

**Deploying**

15. As a maintainer, I want a push to `main` to build, test, and deploy automatically, so that shipping a fix does not require remembering a sequence of commands.
16. As a maintainer, I want the deploy to abort if the test suite fails, so that a broken build cannot reach visitors.
17. As a maintainer, I want the deploy to abort if the built file fails its self-containment checks, so that a regression in the CSP plugin cannot silently ship a page that can reach the network.
18. As a maintainer, I want a new deploy to be live within minutes, so that I don't have to explain to someone that they're seeing a stale version.
19. As a maintainer, I want CI to authenticate to AWS without long-lived access keys, so that a leaked secret in the repo or the Actions log cannot be replayed.
20. As a maintainer, I want the CI role scoped to exactly one bucket key and one distribution, so that a compromise of the workflow cannot touch anything else in the account.
21. As a maintainer, I want a smoke check against the live URL after deploying, so that a green pipeline means the page is actually up and not merely uploaded.
22. As a maintainer, I want to deploy from my laptop with one command when I need to, so that I am not blocked when Actions is down.

**Paying for it**

23. As a maintainer, I want the monthly bill to round to zero at normal traffic, so that the project costs nothing to keep alive.
24. As a maintainer, I want no service in the stack that bills a fixed monthly fee, so that the cost stays proportional to use rather than to existence.
25. As a maintainer, I want a budget alert if spend ever crosses a dollar, so that a traffic spike or a misconfiguration surfaces as a notification and not as a surprise invoice.
26. As a maintainer, I want to understand what would have to happen for this to start costing money, so that I can judge whether the risk is worth managing.

**Rebuilding and understanding it**

27. As a maintainer, I want the infrastructure defined as code, so that I can see what exists without clicking through a console.
28. As a maintainer, I want to re-create the whole stack from scratch with one command, so that tearing it down is not a one-way door.
29. As a maintainer returning in a year, I want the DNS records and manual steps written down, so that I am not reverse-engineering my own setup.
30. As a contributor, I want the deployment story documented in the repo, so that I understand where the thing I'm changing ends up.
31. As an agent implementing this spec, I want the region choices and their reasons recorded, so that I don't "helpfully" move the bucket to us-east-1.

## Implementation Decisions

### Topology

One S3 bucket holding a single object, fronted by one CloudFront distribution, with DNS
at Cloudflare. No compute, no database, no API, no load balancer.

```
Cloudflare DNS (CNAME, DNS-only)
        ↓
  CloudFront distribution ── ACM certificate (us-east-1)
        ↓ Origin Access Control, SigV4
  S3 bucket (private) — one object: index.html
```

### Regions

- **S3 bucket: `ap-east-2` (Taipei).** Nearest region to the primary audience; the
  origin fetch on a cold edge miss drops to roughly 45–60 ms, most of which is S3's own
  time-to-first-byte rather than network. It is also the cheapest of the candidate
  regions on every S3 line item.
- **ACM certificate: `us-east-1`.** Not a choice — CloudFront only accepts viewer
  certificates from that region.
- **CloudFront: global.** Edge selection is automatic.

`ap-east-2` is an **opt-in region**, disabled by default on new accounts. It must be
enabled once before any resource can be created there. Two consequences for the
implementation:

- The Terraform run and the CI role both need the region enabled first; this is a
  prerequisite step, not something Terraform can bootstrap.
- Opt-in regions reject STS session tokens minted from the legacy *global* STS
  endpoint. If the CI role fails against the bucket with a credential error while
  working fine elsewhere, set `AWS_STS_REGIONAL_ENDPOINTS=regional`.

### Why not the obvious cheaper shortcuts

- **No Route 53.** A hosted zone is a fixed $0.50/month — half the entire cost target,
  for DNS that Cloudflare already provides free. DNS stays at Cloudflare.
- **No S3 static website endpoint.** It serves HTTP only, which would force Cloudflare
  Flexible SSL and leave the Cloudflare↔AWS leg unencrypted. For an app whose central
  claim is privacy, that is not an acceptable trade to save one resource.
- **No public bucket.** Origin Access Control (not the legacy OAI), so CloudFront is
  the only reader and there is no second URL serving the same file without the
  security headers.
- **No WAF, no CloudFront standard logging, no Origin Shield.** WAF has a ~$5/month
  floor. Logging costs storage and PUTs for data nobody will read. Origin Shield helps
  high-traffic origins, not this one. Free CloudWatch metrics are sufficient.

### Cloudflare

A `CNAME` from the chosen hostname to the CloudFront distribution domain, **DNS-only
(grey cloud)**, plus the `CNAME` that ACM requires for certificate validation. Apex
domains work via Cloudflare's CNAME flattening.

DNS records are created **by hand**, not by Terraform. Adding the Cloudflare provider
and provisioning an API token to manage two records that are set once is more moving
parts than the thing it automates. The records and their values go in the deploy doc.

Proxying through Cloudflare (orange cloud) is documented as an optional hedge against
bill shock — Cloudflare's free plan has unmetered bandwidth and would absorb cache hits
before they reach CloudFront — but is **not** implemented. It requires Full (strict)
SSL and adds a hop for a risk that a budget alert already surfaces.

### Caching and compression

- Object uploaded with `Cache-Control: public, max-age=300, s-maxage=31536000`.
  The CDN holds the file indefinitely; browsers get five minutes of true instant loads
  before revalidating. `max-age=0` was rejected because it makes every repeat visit pay
  a conditional round trip for a file already on disk.
- Deploys issue a CloudFront invalidation for `/*`, which counts as **one path** against
  the 1,000-per-month free allowance.
- **Compression must be enabled** on the default cache behavior, with the managed
  `CachingOptimized` cache policy so `Accept-Encoding` is forwarded and varied on
  correctly. Without it the page ships 226 KB instead of roughly 70 KB — a difference
  worth several hundred milliseconds on a slow mobile connection.
- Pre-compressing and uploading with an explicit `Content-Encoding` was rejected: it
  buys about 8 KB over CloudFront's edge Brotli and costs a second object plus `Vary`
  handling.
- `index.html` is the distribution's default root object.

### Response headers

Attach the AWS managed `SecurityHeadersPolicy` response headers policy (HSTS,
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).

Do **not** add a `Content-Security-Policy` response header. The meta tag emitted by the
`csp()` plugin in the Vite config is the single source of truth for that policy; a
second definition at the edge means two places to keep in sync and a confusing
intersection when they disagree.

### CI/CD

A GitHub Actions workflow on push to `main`:

1. install, typecheck, run the existing test suite
2. `npm run build`
3. run the build-output contract test against the production build (see Testing Decisions)
4. assume an AWS role via **GitHub OIDC** — no long-lived access keys stored as secrets
5. upload the object with the cache headers above, then create the `/*` invalidation and
   wait for it to complete — one step, so a cancelled run cannot leave a published object
   with no invalidation queued behind a year-long cached copy of the old one
6. smoke-check the live URL, asserting the CSP script hash of the build just uploaded so
   that a stale cache reads as a failure rather than a pass

The deploy role's policy grants `s3:PutObject` on the single object key and
`cloudfront:CreateInvalidation`/`GetInvalidation` on the single distribution ARN, and
nothing else. The trust policy is scoped to this repository and the `main` ref.

The same upload and invalidation steps are available as an npm script so a deploy can be
run from a laptop when needed.

### Terraform

An `infra/` directory covering: the S3 bucket and its public-access block and policy,
the Origin Access Control, the CloudFront distribution with its cache and response
headers policies, the ACM certificate, and the GitHub OIDC provider plus deploy role.
Domain name, bucket name, and region are variables.

State is **local and gitignored**. A remote S3 backend for a three-resource personal
stack is chicken-and-egg overhead; if the state file is ever lost, the resources are
recoverable with `terraform import` and the doc should say so. State must never be
committed — it can contain resource metadata that shouldn't be in a public repo.

`dist/` stays gitignored. The deployed artifact is built in CI, never committed.

## Testing Decisions

### What a good test is here

The existing suite sets the standard and the new test should match it: assert on the
real artifact's observable behavior, never on how it was produced. `png.test.ts`
decodes the actual PNG and inspects pixels rather than checking that `compose()` called
`fillRect` — the product is the output file, so the output file is what gets examined.

The same applies here. The test must parse the actual built HTML and assert properties
of it. It must not assert that the `csp()` plugin ran, inspect Vite's plugin pipeline,
or mock any part of the build. If the plugin is rewritten or replaced, a correct
implementation should still pass unchanged.

Tests follow the established style: plain `test()` and `expect()` from vitest,
descriptive full-sentence names, no mocking, comments only where the *why* isn't
obvious from the assertion.

### The seam

**One seam: the emitted `index.html`, as produced by a real production `vite build`.**

The test drives `vite build` itself with `write: false`, so it never touches `dist/`. It
sets `NODE_ENV=production` first: vite decides development vs production from `NODE_ENV`
rather than from the build mode, and vitest sets it to `test`, so without that the suite
would assert against a development bundle whose hashes have nothing to do with what
ships.

This is the highest available seam — it takes the entire build pipeline as input and
asserts on the shipped bytes. It was chosen because publishing is precisely the moment
the build's self-containment stops being a nice property and becomes the thing
strangers are trusting, and because `vite.config.ts`'s `csp()` plugin is currently
untested despite being the enforcement point for the product's central claim.

Two tests at that seam:

1. **The built file cannot reach the network.** Exactly one file is emitted, with no
   sibling `.js` or `.css` assets. No `src` or `href` attribute points anywhere except
   `blob:`, which is the only fetch the policy permits. The CSP meta tag is present and
   contains `default-src 'none'`.

2. **Every inline script is hashed in the policy.** Hash each inline `<script>` body
   with SHA-256 and assert that each resulting hash appears in the policy's `script-src`
   directive. This is the test that earns its place: a stale or mismatched hash is the
   actual failure mode of that plugin, and it ships either a blank page or — if someone
   "fixes" it by loosening the directive — a page that can be made to talk to the
   network.

### Test environment

The current Vitest config enables browser mode globally, because the existing tests need
a real renderer for canvas pixels. These new tests inspect a file and need no renderer,
so the config needs to accommodate both — via Vitest `projects`: one browser project for
the existing `src/*.test.ts` suite, one Node project for the build-output test. This is
a real change to `vite.config.ts` and should not be worked around with per-file
environment comments, which browser mode does not honour.

The test needs a build to inspect. It should invoke the build itself or depend on a
build step that runs first; it must not silently pass when `dist/` is absent.

### Deploy-time smoke check

A step in the workflow, deliberately **not** a Vitest seam: `curl` the live URL and
assert a 200, a `text/html` content type, a `content-encoding` of `br` or `gzip`, and
the presence of the CSP string in the body. It verifies the deployment, not the code,
and belongs in the pipeline rather than the suite.

### Explicitly not tested

AWS's own behavior, Terraform's correctness, and CloudFront cache semantics. A test
asserting that a Terraform plan sets `compress = true` restates the `.tf` file back to
itself and fails only when someone edits both in sync. The smoke check covers the
handful of edge behaviors that actually matter, against the real deployment.

## Out of Scope

- Route 53, WAF, CloudFront access logging, Origin Shield, and analytics of any kind.
- A staging environment or per-PR preview deployments. One environment, one branch.
- Terraform management of Cloudflare DNS records.
- Implementing the Cloudflare orange-cloud proxy. Documented as an option only.
- Reducing bundle size. Swapping React for Preact or hand-rolled DOM would cut the
  226 KB substantially, but 300 ms cold is already fine and the rewrite is its own
  project.
- Any change to the application itself — decoding, rendering, gestures, or save
  behavior. This spec adds infrastructure and one test; it touches `vite.config.ts`
  only to accommodate the test project split.
- Custom error pages, redirects, or a `www` variant beyond the single hostname.
- Any backend, ever. Adding one would contradict the product.

## Further Notes

### Expected cost

At roughly 10k views/month of a 226 KB file (about 70 KB compressed on the wire):

| Line item | Rate | Cost |
| --- | --- | --- |
| CloudFront egress | 1 TB/month always-free | $0 |
| CloudFront requests | 10M/month always-free | $0 |
| ACM certificate | free with CloudFront | $0 |
| S3 → CloudFront origin transfer | free from all regions | $0 |
| S3 storage (0.000226 GB @ $0.0225) | | $0.000005 |
| S3 GETs and PUTs | | $0.0003 |
| DNS | Cloudflare free plan | $0 |

Total: **under a cent per month.** The CloudFront free tier is permanent, not a
12-month trial. Leaving it requires roughly five million page loads in a month.

### Expected performance

Cold (edge cache miss, Taipei viewer, Taipei origin): TTFB around 100–120 ms, interactive
around 220–300 ms on desktop and 500–800 ms on a mid-range phone over 4G. Warm edge hit
roughly halves that.

Cold is the common case for a low-traffic site — CloudFront evicts by LRU and the object
will not stay resident at most PoPs. Optimize for the cold number.

The single-file build is a genuine advantage here: a conventional SPA pays three or four
sequential round trips for HTML, JS, CSS, and fonts. This pays one. On mobile, JavaScript
parse and React mount is roughly half the cold number, not the network.

### AWS account setup

Since July 2025, new AWS accounts choose a Free plan or a Paid plan at signup. The Free
plan **auto-closes the account** after six months or when credits run out. Choose the
**Paid plan** — the always-free tiers this design relies on keep working indefinitely,
and the bill will be a rounding error regardless.

Set a **$1 AWS Budget alert** during setup. It is free, and it is the mechanism that
makes the "no fixed cost" claim safe to rely on.

One honest gap: `ap-east-2`'s published price list contains no data-transfer SKUs yet,
where Seoul and Tokyo explicitly list CloudFront egress at $0.00/GB. This is a
publication gap in a young region rather than evidence of a charge — the S3-to-CloudFront
waiver applies region-wide — but the budget alert makes the first month's bill the
confirmation.

### Repo conventions

This repository has no `CLAUDE.md`, no domain glossary, and no ADRs at the time of
writing, so this spec uses the vocabulary established by the README: *picture*, *region*,
*blur*, *redact*, *single-file bundle*. If `/setup-matt-pocock-skills` is run later and a
glossary is established, this spec should be reconciled against it.

### Fallback if Taipei is a problem

If enabling the opt-in region turns out to be friction — an account restriction, an
STS issue that resists fixing, or a service gap — `ap-northeast-2` (Seoul) is enabled by
default and costs about 30 ms more on cold misses. That difference is invisible against
a page that is already interactive in under a third of a second. Take Seoul and move on
rather than fighting the region.
