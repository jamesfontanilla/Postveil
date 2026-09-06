# Production verification

Run the non-destructive smoke check after each hosted deployment:

```text
npm run test:prod
```

The check only reads the public health/config endpoints, confirms unsafe
methods are rejected, confirms a private route still requires authentication,
and verifies the browser isolation headers. It does not sign in, create an
account, send mail, mutate D1, access B2, or read mailbox content.

## Current release evidence

- CI runs typecheck, the test suite, the production build, and a high-severity
  production-dependency audit on pushes and pull requests to `main`.
- CodeQL runs for JavaScript/TypeScript, and dependency review blocks high-risk
  dependency changes in pull requests.
- SES publishing is configured through the `postveil-events` configuration set
  and its SNS destination. A real owned-recipient delivery test is still an
  operator task; simulator tests do not prove production deliverability.
- Attachment ingestion is deliberately disabled until an antivirus scanner and
  quarantine workflow are connected.

## Release gate

Passing this check means the deployed surface matches the expected baseline. It
does not prove legal readiness, provider reputation, malware detection,
customer-domain routing, independent backup recovery, paid-plan WAF rules, or
tenant-isolation under load.
