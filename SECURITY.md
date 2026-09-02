# Security Policy

## Supported Version

The latest commit on `main` is the supported version. Releases are not yet
published, so deployments should record the exact commit they run.

## Scope and limitations

Postveil is a self-hosted reference implementation. Operators are responsible
for their Cloudflare, Supabase, Brevo, Backblaze, DNS, identity, backup, and
monitoring configuration. Static attachment checks do not provide antivirus
protection, and a public deployment must add quotas, abuse controls, backups,
and malware scanning appropriate to its risk.

## Reporting a Vulnerability

Please do not disclose suspected vulnerabilities in a public issue. Use GitHub's private vulnerability reporting for this repository, or contact the repository maintainer privately through GitHub if that channel is unavailable.

Include the affected endpoint or component, reproduction steps that do not access other people's data, and the potential impact. Do not include passwords, API keys, access tokens, mailbox contents, or other sensitive data in a report.

Please allow reasonable time for triage and remediation before public
disclosure. Security fixes should include a regression test where practical.
