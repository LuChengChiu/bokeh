# GitHub Actions authenticates by OIDC. No access keys are stored as repository secrets,
# so there is nothing in the repo or the workflow logs that can be replayed.

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # AWS no longer verifies thumbprints for well-known providers, but the API still
  # requires the field.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # This repository, main branch only. A fork or a PR branch cannot assume the role.
    # Two spellings: GitHub is moving the subject to owner@id/repo@id, and which one a
    # token carries is GitHub's call, not ours — matching only the old form gets an
    # AccessDenied that looks exactly like a misconfigured role.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repo}:ref:refs/heads/main",
        "repo:${var.github_repo_immutable}:ref:refs/heads/main",
      ]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "bokeh-deploy"
  description        = "Uploads the bokeh bundle and invalidates its distribution."
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

# Exactly one object key and exactly one distribution. Compromising the workflow gets an
# attacker the ability to replace the page, and nothing else in the account.
data "aws_iam_policy_document" "deploy" {
  statement {
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.site.arn}/index.html"]
  }

  # GetInvalidation is what `aws cloudfront wait invalidation-completed` polls, so the
  # workflow can confirm the cache actually dropped before it smoke-checks the URL.
  statement {
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [aws_cloudfront_distribution.site.arn]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "bokeh-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
