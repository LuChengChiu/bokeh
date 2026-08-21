variable "domain" {
  description = "Hostname to serve Bokeh from, e.g. bokeh.example.com. DNS must be at Cloudflare."
  type        = string
}

variable "bucket_name" {
  description = "S3 bucket name. Defaults to the domain, which keeps it unambiguous."
  type        = string
  default     = null
}

variable "bucket_region" {
  description = <<-EOT
    Where the single object lives. ap-east-2 (Taipei) is nearest the audience and the
    cheapest of the candidate regions; it is an opt-in region and must be enabled on the
    account first. ap-northeast-2 (Seoul) is the no-opt-in fallback, ~30ms slower on a
    cold edge miss.
  EOT
  type        = string
  default     = "ap-east-2"
}

variable "github_repo" {
  description = "owner/repo allowed to assume the deploy role, main branch only."
  type        = string
  default     = "LuChengChiu/bokeh"
}

locals {
  bucket = coalesce(var.bucket_name, var.domain)
}
