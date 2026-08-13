import { readFile } from "node:fs/promises";

import { parsePolicyDocumentText } from "@letscoding/policy-contract";
import { describe, expect, it } from "vitest";

import { validateArtifact } from "./index.js";
import { artifactValidationPolicyFromDocument } from "./policy.js";

async function loadPolicy() {
  const text = await readFile(
    new URL(
      "../../../policies/lounge-deploy/history/2026-08-12.2.json",
      import.meta.url,
    ),
    "utf8",
  );
  const parsed = parsePolicyDocumentText(text);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return artifactValidationPolicyFromDocument(parsed.value);
}

describe("artifactValidationPolicyFromDocument", () => {
  it("preserves policy-specific blocked filename and path codes", async () => {
    const policy = await loadPolicy();
    const result = validateArtifact({
      policy,
      manifest: {
        kind: "zip",
        compressedBytes: 10,
        files: [
          { path: "index.html", sizeBytes: 1, sha256: "a".repeat(64) },
          {
            path: "config/.env.production/value.js",
            sizeBytes: 1,
            sha256: "b".repeat(64),
          },
          {
            path: "nested/RUNTIME-CONFIG.JS",
            sizeBytes: 1,
            sha256: "c".repeat(64),
          },
          { path: "assets/../app.js", sizeBytes: 1, sha256: "d".repeat(64) },
          { path: "assets/./app.js", sizeBytes: 1, sha256: "e".repeat(64) },
        ],
      },
    });

    expect(result.errors.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "LD_FILE_ENV_INCLUDED",
        "LD_FILE_RUNTIME_CONFIG_INCLUDED",
        "LD_PATH_PARENT_TRAVERSAL",
        "LD_PATH_NOT_NORMALIZED",
      ]),
    );
  });

  it("uses central size, count, extension, and root-index rules", async () => {
    const policy = await loadPolicy();
    const result = validateArtifact({
      policy,
      manifest: {
        kind: "zip",
        compressedBytes: policy.limits.maxCompressedBytes + 1,
        files: [{ path: "asset.exe", sizeBytes: 1, sha256: "a".repeat(64) }],
      },
    });

    expect(result.errors.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "LD_ZIP_COMPRESSED_TOO_LARGE",
        "LD_ZIP_MISSING_ROOT_INDEX_HTML",
        "LD_FILE_EXTENSION_NOT_ALLOWED",
      ]),
    );
  });

  it("maps entry count, path length, and parser failure policy codes", async () => {
    const policy = await loadPolicy();
    expect(policy.limits).toMatchObject({
      maxEntries: 500,
      maxPathLength: 180,
    });
    expect(policy.rules["path-too-long"]?.code).toBe("LD_PATH_TOO_LONG");
    expect(policy.inspection).toMatchObject({
      allowZip64: false,
      allowMultiDisk: false,
      invalidFormat: { code: "LD_ZIP_INVALID_FORMAT" },
      tooManyEntries: { code: "LD_ZIP_TOO_MANY_ENTRIES" },
      invalidEntrySize: { code: "LD_ENTRY_SIZE_INVALID" },
    });
  });
});
