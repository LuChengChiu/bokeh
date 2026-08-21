# Paste this into Cloudflare as a CNAME (DNS only) before the certificate can issue.
output "certificate_validation_record" {
  description = "CNAME proving domain ownership to ACM."
  value = {
    for o in aws_acm_certificate.site.domain_validation_options :
    o.domain_name => { name = o.resource_record_name, value = o.resource_record_value }
  }
}

# And this one is the site itself: CNAME the domain here, DNS only (grey cloud).
output "cloudfront_domain" {
  description = "Point the site's CNAME at this."
  value       = aws_cloudfront_distribution.site.domain_name
}

output "distribution_id" {
  description = "Repository variable DISTRIBUTION_ID."
  value       = aws_cloudfront_distribution.site.id
}

output "bucket" {
  description = "Repository variable BUCKET."
  value       = aws_s3_bucket.site.id
}

output "deploy_role_arn" {
  description = "Repository secret AWS_DEPLOY_ROLE."
  value       = aws_iam_role.deploy.arn
}

output "domain" {
  description = "Repository variable DOMAIN."
  value       = var.domain
}
