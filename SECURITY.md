# Security Policy

## Supported scope

Security fixes target the current `main` revision, the active Lounge Deploy policy, the public
MCP endpoint, and the current Plugin version. Historical policy snapshots remain immutable; a
security policy correction is published as a new version.

## Reporting a vulnerability

Do not open a public issue with credentials, personal data, source code, ZIP content, exploit
details, or student information. Use GitHub Private Vulnerability Reporting:

https://github.com/quirinal36/letscoding-agent-platform/security/advisories/new

If that private form is unavailable, do not post the report publicly. Contact the repository
owner through https://github.com/quirinal36 and wait for a private channel. Production release is
blocked until Private Vulnerability Reporting is enabled and tested.

Include the affected revision, policy version, request ID when safe, reproduction steps, and
impact. Do not include live secrets. The operator acknowledges a valid private report, contains
active exploitation first, and follows the emergency policy runbook.

## Disclosure and secrets

- Never commit a real Vercel, GitHub, API, HMAC, or student credential.
- Rotate exposed credentials before investigating code changes.
- Public audit examples must use synthetic hashes and request IDs.
- Automatic Lounge upload and policy administration are outside the public MCP scope.
