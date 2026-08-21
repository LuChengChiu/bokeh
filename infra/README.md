# Deploying Bokeh

S3 (one private object) → CloudFront → Cloudflare DNS. No compute, no fixed monthly
cost. Design and rationale: [`../docs/aws-deployment.md`](../docs/aws-deployment.md).

Written for Terraform; [OpenTofu](https://opentofu.org) is a drop-in — substitute `tofu`
for `terraform` throughout.

## Already true for the target account

- AWS account exists, with admin credentials configured locally.
- `ap-east-2` (Taipei) is enabled — the opt-in step is done.
- No Route 53 hosted zone, so DNS stays free at Cloudflare.
- No conflicting CloudFront distribution, ACM certificate, or GitHub OIDC provider.

## What you need before starting

- A hostname you control, with DNS served by Cloudflare.
- Ability to add CNAME records in the Cloudflare dashboard.

Put the hostname in `infra/terraform.tfvars` (gitignored):

```hcl
domain = "bokeh.example.com"
```

## 1. Request the certificate

ACM must prove you own the domain before CloudFront will accept the certificate, and the
proof is a DNS record only you can add. So the certificate comes first, alone:

```sh
cd infra
terraform init
terraform apply -target=aws_acm_certificate.site
terraform output certificate_validation_record
```

## 2. Add the validation record at Cloudflare

Create the CNAME that the output names, **DNS only (grey cloud)** — a proxied record
hides the value ACM needs to read.

Validation usually completes within a few minutes.

## 3. Build everything else

```sh
terraform apply
```

This waits for the certificate to reach `ISSUED` (up to 60 minutes; it is normally much
faster) and then creates the bucket, the Origin Access Control, the distribution, and the
GitHub deploy role.

## 4. Point the domain at CloudFront

```sh
terraform output cloudfront_domain
```

Create a CNAME from your hostname to that value, again **DNS only (grey cloud)**.
Cloudflare's CNAME flattening makes this work at an apex domain too.

Turning the orange cloud on is a valid later hedge against bill shock — Cloudflare's free
plan has unmetered bandwidth and would absorb cache hits before they reach CloudFront —
but it needs Full (strict) SSL, and the budget alert in step 7 covers the same risk with
less machinery.

## 5. First upload

The distribution has no object yet, so it will serve an error until something is in the
bucket. Seed it from your laptop:

```sh
cd ..
BOKEH_BUCKET=$(terraform -chdir=infra output -raw bucket) \
BOKEH_DISTRIBUTION=$(terraform -chdir=infra output -raw distribution_id) \
npm run deploy
```

The site should now be live. DNS propagation through Cloudflare is usually seconds.

## 6. Hand the deploy to CI

```sh
gh variable set AWS_REGION      --body "ap-east-2"
gh variable set BUCKET          --body "$(terraform -chdir=infra output -raw bucket)"
gh variable set DISTRIBUTION_ID --body "$(terraform -chdir=infra output -raw distribution_id)"
gh variable set DOMAIN          --body "$(terraform -chdir=infra output -raw domain)"
gh secret   set AWS_DEPLOY_ROLE --body "$(terraform -chdir=infra output -raw deploy_role_arn)"
```

From then on, a push to `main` typechecks, runs the suite in real Chromium, builds,
uploads, invalidates, and smoke-checks the live URL. There are no AWS access keys
anywhere — CI authenticates by OIDC, and the role it assumes can write exactly one object
key and invalidate exactly one distribution.

## 7. Budget alert

The bill should stay under a cent a month, which only holds while nothing unexpected
happens. Set a $1 alert so a spike arrives as a notification rather than an invoice:

```sh
aws budgets create-budget --account-id "$(aws sts get-caller-identity --query Account --output text)" \
  --budget '{"BudgetName":"bokeh-monthly","BudgetLimit":{"Amount":"1","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}' \
  --notifications-with-subscribers '[{"Notification":{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":80},"Subscribers":[{"SubscriptionType":"EMAIL","Address":"YOUR@EMAIL"}]}]'
```

## Recovering lost state

State is local and gitignored, so a lost laptop means a lost state file rather than lost
infrastructure. Ten resources are recoverable with `terraform import`; the bucket, the
distribution, and the role are the ones worth importing first. Nothing here is expensive
enough that re-creating from scratch under a new name is unreasonable either.

## If Taipei ever becomes a problem

Set `bucket_region = "ap-northeast-2"` (Seoul), which is enabled by default on every
account. It costs about 30 ms more on a cold edge miss — invisible against a page that is
already interactive in under a third of a second. Changing the region replaces the bucket,
so re-run step 5 afterwards.

