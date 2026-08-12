import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const files = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
const rules = [
  ["PRIVATE_KEY", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GITHUB_TOKEN", /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/],
  ["AWS_ACCESS_KEY", /\bAKIA[0-9A-Z]{16}\b/],
  ["SLACK_TOKEN", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["VERCEL_TOKEN", /\b(?:VERCEL_TOKEN\s*=\s*)[A-Za-z0-9]{20,}\b/],
];
const findings = [];

for (const path of files) {
  const bytes = await readFile(path);
  if (bytes.includes(0) || bytes.length > 5 * 1024 * 1024) continue;
  const content = bytes.toString("utf8");
  for (const [code, pattern] of rules) {
    if (pattern.test(content)) findings.push(`${code}:${path}`);
  }
}

if (findings.length > 0) {
  process.stderr.write(`${findings.sort().join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Tracked secret scan passed (${files.length} files).\n`);
}
