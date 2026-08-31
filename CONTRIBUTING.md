# Contributing to Parcel

Thanks for helping improve Parcel. Please keep changes focused, explain the
security or user-facing impact, and avoid committing provider credentials,
personal mailbox data, generated build output, or deployment-specific values.

## Before opening a pull request

Run:

```text
npm ci
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Security vulnerabilities must not be reported in a public issue. Follow the
process in `SECURITY.md` instead.

Database changes belong in a new ordered migration under
`supabase/migrations/` and should include allow/deny coverage in
`supabase/tests/`. Do not apply migrations to someone else's project.

## Pull requests

Describe what changed, why it changed, how it was tested, and any deployment
or migration steps. Keep provider-specific configuration in deployment
secrets or local environment files.
