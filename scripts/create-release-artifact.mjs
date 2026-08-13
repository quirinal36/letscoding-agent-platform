import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const dirty = execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
});
if (dirty !== "") throw new Error("RELEASE_WORKTREE_NOT_CLEAN");

const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const current = JSON.parse(
  await readFile("policies/lounge-deploy/current.json", "utf8"),
);
const output = resolve(process.env.RELEASE_OUTPUT_DIR ?? "artifacts/release");
const archive = resolve(output, `letscoding-agent-platform-${revision}.tar.gz`);
await mkdir(output, { recursive: true });
execFileSync("git", [
  "archive",
  "--format=tar.gz",
  `--prefix=letscoding-agent-platform-${revision}/`,
  `--output=${archive}`,
  revision,
]);
const archiveSha256 = createHash("sha256")
  .update(await readFile(archive))
  .digest("hex");
const manifest = {
  schemaVersion: 1,
  revision,
  policy: { id: current.policyId, version: current.version },
  sourceArchive: { file: basename(archive), sha256: archiveSha256 },
};
await writeFile(
  resolve(output, "release-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(manifest)}\n`);
