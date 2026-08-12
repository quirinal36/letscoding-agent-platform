import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function validatePolicyChanges(changes, current, snapshot) {
  const errors = [];
  const byPath = new Map(changes.map((change) => [change.path, change.status]));
  const history = changes.filter(({ path }) =>
    path.startsWith("policies/lounge-deploy/history/"),
  );
  for (const change of history) {
    if (change.status !== "A") {
      errors.push(`POLICY_HISTORY_IMMUTABLE:${change.path}`);
    }
  }

  const currentPath = "policies/lounge-deploy/current.json";
  const guidePath = "policies/lounge-deploy/framework-guide.md";
  const currentChanged = byPath.has(currentPath);
  if (history.length > 0 && !currentChanged) {
    errors.push("POLICY_NEW_HISTORY_REQUIRES_ACTIVATION");
  }
  if (!currentChanged) return errors.sort();
  if (byPath.get(currentPath) === "D") errors.push("POLICY_POINTER_DELETED");
  if (!byPath.has(guidePath)) errors.push("POLICY_ACTIVE_GUIDE_NOT_UPDATED");
  if (current === null || snapshot === null) {
    errors.push("POLICY_ACTIVATION_INPUT_MISSING");
    return errors.sort();
  }

  const jsonPath = `policies/lounge-deploy/history/${current.version}.json`;
  const markdownPath = `policies/lounge-deploy/history/${current.version}.md`;
  if (byPath.get(jsonPath) !== "A") errors.push("POLICY_NEW_JSON_NOT_ADDED");
  if (byPath.get(markdownPath) !== "A")
    errors.push("POLICY_NEW_GUIDE_NOT_ADDED");
  if (snapshot.version !== current.version) {
    errors.push("POLICY_ACTIVATION_VERSION_MISMATCH");
  }
  if (
    typeof snapshot.changeReason !== "string" ||
    snapshot.changeReason.trim() === ""
  ) {
    errors.push("POLICY_CHANGE_REASON_MISSING");
  }
  for (const [code, value] of [
    ["POLICY_EFFECTIVE_AT_INVALID", snapshot.effectiveAt],
    ["POLICY_ACTIVATED_AT_INVALID", current.activatedAt],
  ]) {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
      errors.push(code);
  }
  return errors.sort();
}

async function main() {
  const baseIndex = process.argv.indexOf("--base");
  const base =
    baseIndex === -1
      ? process.env.POLICY_BASE_SHA
      : process.argv[baseIndex + 1];
  if (base === undefined || base === "" || /^0+$/.test(base)) {
    throw new Error("POLICY_BASE_SHA_REQUIRED");
  }
  const lines = execFileSync(
    "git",
    [
      "diff",
      "--name-status",
      "--diff-filter=ACDMRT",
      `${base}...HEAD`,
      "--",
      "policies/lounge-deploy",
    ],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  const changes = lines.map((line) => {
    const [rawStatus, ...paths] = line.split("\t");
    return { status: rawStatus[0], path: paths.at(-1) };
  });
  const currentChanged = changes.some(
    ({ path }) => path === "policies/lounge-deploy/current.json",
  );
  let current = null;
  let snapshot = null;
  if (currentChanged) {
    current = JSON.parse(
      await readFile("policies/lounge-deploy/current.json", "utf8"),
    );
    snapshot = JSON.parse(
      await readFile(
        `policies/lounge-deploy/history/${current.version}.json`,
        "utf8",
      ),
    );
  }
  const errors = validatePolicyChanges(changes, current, snapshot);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  process.stdout.write(`Policy change guard passed against ${base}.\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
