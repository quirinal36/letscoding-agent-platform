import { readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadActivePolicy,
  loadPolicyVersion,
  parseCurrentPointerText,
  type PolicySource,
} from "@letscoding/policy-contract";
import { createFileSystemPolicySource } from "@letscoding/policy-contract/node";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = join(appRoot, "..", "..");
const policyId = "lounge-deploy";
const policyDirectory = join(repositoryRoot, "policies", policyId);
const outputPath = join(appRoot, "src", "generated", "policy-bundle.ts");
const source = createFileSystemPolicySource(policyDirectory);

const active = await loadActivePolicy(source, { policyId });
if (!active.ok) throw new Error(JSON.stringify(active.issues));

const historyFiles = (await readdir(join(policyDirectory, "history")))
  .filter((name) => /^\d{4}-\d{2}-\d{2}\.\d+\.json$/.test(name))
  .sort();
for (const file of historyFiles) {
  const version = file.slice(0, -".json".length);
  const loaded = await loadPolicyVersion(source, { policyId, version });
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.issues));
}

const files: Record<string, string> = {};
files["current.json"] = await requireText(source, "current.json");
const pointer = parseCurrentPointerText(files["current.json"]);
if (!pointer.ok || pointer.value.version !== active.value.document.version) {
  throw new Error("Active pointer changed during policy bundle generation.");
}
for (const jsonFile of historyFiles) {
  const version = jsonFile.slice(0, -".json".length);
  files[`history/${jsonFile}`] = await requireText(
    source,
    `history/${jsonFile}`,
  );
  files[`history/${version}.md`] = await requireText(
    source,
    `history/${version}.md`,
  );
}

const generated = `/**\n * scripts/generate-policy-bundle.ts가 검증된 policies/ 트리에서 생성했다.\n * 직접 수정하지 않는다.\n */\nexport const POLICY_BUNDLE_FILES: Readonly<Record<string, string>> = ${JSON.stringify(files, null, 2)};\n`;
await writeFile(outputPath, generated, "utf8");

async function requireText(
  selectedSource: PolicySource,
  path: string,
): Promise<string> {
  const text = await selectedSource.readText(path);
  if (text === null) throw new Error(`Missing policy bundle file: ${path}`);
  return text;
}
