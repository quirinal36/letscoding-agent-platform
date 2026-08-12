import { existsSync } from "node:fs";

const userAgent = process.env.npm_config_user_agent ?? "";
const disallowedLockfiles = [
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "yarn.lock",
];
const foundLockfiles = disallowedLockfiles.filter((path) => existsSync(path));

if (!userAgent.startsWith("pnpm/")) {
  throw new Error(
    "This repository must be installed with the pnpm version pinned in package.json.",
  );
}

if (foundLockfiles.length > 0) {
  throw new Error(
    `Unsupported package manager lockfile(s): ${foundLockfiles.join(", ")}`,
  );
}
