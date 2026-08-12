# Privacy Notice — Lounge Deploy Plugin and MCP

Effective date: 2026-08-13

The Lounge Deploy Plugin analyzes and builds a project locally. The public MCP receives only the
bounded metadata/configuration excerpts and structured manifests needed to return the current
policy, compatibility findings, final validation, and a report.

The service does not intentionally receive or store full source files, ZIP bytes, `.env` values,
credentials, report bodies, email addresses, user/organization claims, or student information.
Do not submit those values. The first release has no account login and no automatic Lounge upload.

Operational audit events may contain timestamp, environment/revision, request ID, anonymous
actor, a daily rotating HMAC network pseudonym, tool name, policy ID/version, result/finding code,
latency, and artifact sizes/file count/SHA-256. The recommended raw-event retention is 14 days,
with access limited to designated platform/security operators. Raw IP addresses are not audit
fields. Vercel processes requests as the hosting provider; Codex/OpenAI processing is governed by
the user's applicable OpenAI terms and settings.

For access or deletion questions, contact the repository owner through
https://github.com/quirinal36 without posting personal information publicly. For a security issue,
use the private route in `SECURITY.md`. Production is blocked until the operator approves and
configures the stated retention and access controls.

Material expansion of data collection, identity, storage, or automatic upload requires a new ADR,
notice update, and user approval before release.
