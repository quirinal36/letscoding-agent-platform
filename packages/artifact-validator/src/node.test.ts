import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parsePolicyDocumentText } from "@letscoding/policy-contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runArtifactValidatorCli } from "./cli.js";
import {
  createZipFixture,
  generateArtifactSecurityFixtures,
} from "./fixture-generator.js";
import { inspectArtifact } from "./node.js";
import { artifactValidationPolicyFromDocument } from "./policy.js";

let root: string;
let fixtures: string;
const POLICY_PATH = fileURLToPath(
  new URL(
    "../../../policies/lounge-deploy/history/2026-08-12.2.json",
    import.meta.url,
  ),
);

async function loadPolicy() {
  const parsed = parsePolicyDocumentText(await readFile(POLICY_PATH, "utf8"));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return artifactValidationPolicyFromDocument(parsed.value);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "letscoding-artifact-test-"));
  fixtures = join(root, "fixtures");
  await generateArtifactSecurityFixtures(fixtures);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("inspectArtifact ZIP", () => {
  it.each([
    "valid-single-html.zip",
    "valid-static.zip",
    "valid-vite.zip",
    "valid-next.zip",
    "valid-utf8.zip",
  ])("passes the generated fixture %s", async (name) => {
    const result = await inspectArtifact({
      kind: "zip",
      inputPath: join(fixtures, name),
      policy: await loadPolicy(),
    });

    expect(result.pass).toBe(true);
    expect(result.metadata.sourceSha256).toMatch(/^[a-f\d]{64}$/);
    expect(result.metadata.artifactSha256).toBe(result.metadata.sourceSha256);
    expect(result.validation?.policy.version).toBe("2026-08-12.2");
  });

  it.each([
    ["invalid-wrapper.zip", "LD_ZIP_MISSING_ROOT_INDEX_HTML"],
    ["invalid-missing-root.zip", "LD_ZIP_MISSING_ROOT_INDEX_HTML"],
    ["invalid-backslash.zip", "LD_PATH_BACKSLASH"],
    ["invalid-traversal.zip", "LD_PATH_PARENT_TRAVERSAL"],
    ["invalid-absolute.zip", "LD_PATH_ABSOLUTE"],
    ["invalid-url-character.zip", "LD_PATH_URL_REINTERPRET"],
    ["invalid-env.zip", "LD_FILE_ENV_INCLUDED"],
    ["invalid-runtime-config.zip", "LD_FILE_RUNTIME_CONFIG_INCLUDED"],
    ["invalid-extension.zip", "LD_FILE_EXTENSION_NOT_ALLOWED"],
  ])("rejects %s with %s", async (name, expectedCode) => {
    const result = await inspectArtifact({
      kind: "zip",
      inputPath: join(fixtures, name),
      policy: await loadPolicy(),
    });

    expect(result.pass).toBe(false);
    expect(result.validation?.errors.map(({ code }) => code)).toContain(
      expectedCode,
    );
  });

  it.each([
    ["invalid-central-directory.zip", "ZIP_CENTRAL_DIRECTORY_INVALID"],
    ["invalid-local-name.zip", "ZIP_ENTRY_NAME_MISMATCH"],
    ["invalid-multidisk.zip", "ZIP_MULTIDISK_UNSUPPORTED"],
    ["invalid-zip64.zip", "ZIP64_UNSUPPORTED"],
    ["invalid-truncated.zip", "ZIP_EOCD_MISSING"],
  ])("fails closed for %s with %s", async (name, expectedCode) => {
    const result = await inspectArtifact({
      kind: "zip",
      inputPath: join(fixtures, name),
      policy: await loadPolicy(),
    });

    expect(result.pass).toBe(false);
    expect(result.inspectionErrors.map(({ code }) => code)).toContain(
      expectedCode,
    );
    expect(result.inspectionErrors[0]?.policyRule?.code).toBe(
      "LD_ZIP_INVALID_FORMAT",
    );
    expect(JSON.stringify(result)).not.toContain("<!doctype html>");
  });

  it("checks the EOCD count before allocating every entry", async () => {
    const policy = await loadPolicy();
    const path = join(root, "too-many.zip");
    await writeFile(
      path,
      createZipFixture(
        Array.from({ length: policy.limits.maxFiles + 1 }, (_, index) => ({
          name: index === 0 ? "index.html" : `assets/${index}.txt`,
        })),
      ),
    );

    const result = await inspectArtifact({
      kind: "zip",
      inputPath: path,
      policy,
    });
    expect(result.inspectionErrors[0]?.code).toBe("ZIP_ENTRY_LIMIT_EXCEEDED");
    expect(result.inspectionErrors[0]?.policyRule?.code).toBe(
      "LD_ZIP_TOO_MANY_ENTRIES",
    );
    expect(result.metadata.fileCount).toBe(policy.limits.maxFiles + 1);
  });

  it("accepts the exact file-count boundary", async () => {
    const policy = await loadPolicy();
    const path = join(root, "file-count-boundary.zip");
    await writeFile(
      path,
      createZipFixture(
        Array.from({ length: policy.limits.maxFiles }, (_, index) => ({
          name: index === 0 ? "index.html" : `assets/${index}.txt`,
        })),
      ),
    );
    const result = await inspectArtifact({
      kind: "zip",
      inputPath: path,
      policy,
    });
    expect(result.pass).toBe(true);
    expect(result.metadata.fileCount).toBe(policy.limits.maxFiles);
  });

  it("accepts exact compressed and uncompressed test-policy boundaries", async () => {
    const basePolicy = await loadPolicy();
    const path = join(root, "size-boundary.zip");
    const bytes = createZipFixture([
      { name: "index.html", contents: "12345", method: "deflate" },
    ]);
    await writeFile(path, bytes);
    const boundaryPolicy = {
      ...basePolicy,
      limits: {
        ...basePolicy.limits,
        maxCompressedBytes: bytes.length,
        maxUncompressedBytes: 5,
      },
    };
    const pass = await inspectArtifact({
      kind: "zip",
      inputPath: path,
      policy: boundaryPolicy,
    });
    expect(pass.pass).toBe(true);

    const compressedFail = await inspectArtifact({
      kind: "zip",
      inputPath: path,
      policy: {
        ...boundaryPolicy,
        limits: {
          ...boundaryPolicy.limits,
          maxCompressedBytes: bytes.length - 1,
        },
      },
    });
    expect(compressedFail.validation?.errors.map(({ code }) => code)).toContain(
      "LD_ZIP_COMPRESSED_TOO_LARGE",
    );
  });

  it("stops before inflating an entry whose declared size exceeds the limit", async () => {
    const policy = await loadPolicy();
    const path = join(root, "oversized-inflate.zip");
    await writeFile(
      path,
      createZipFixture(
        [{ name: "index.html", contents: "small", method: "deflate" }],
        { declaredUncompressedBytes: policy.limits.maxUncompressedBytes + 1 },
      ),
    );

    const result = await inspectArtifact({
      kind: "zip",
      inputPath: path,
      policy,
    });
    expect(result.inspectionErrors[0]?.code).toBe("ZIP_INFLATE_LIMIT_EXCEEDED");
  });

  it("enforces the actual streaming inflate limit when central sizes lie", async () => {
    const basePolicy = await loadPolicy();
    const path = join(root, "actual-inflate-overflow.zip");
    await writeFile(
      path,
      createZipFixture(
        [
          {
            name: "index.html",
            contents: "0123456789",
            method: "deflate",
          },
        ],
        { declaredUncompressedBytes: 1 },
      ),
    );
    const result = await inspectArtifact({
      kind: "zip",
      inputPath: path,
      policy: {
        ...basePolicy,
        limits: { ...basePolicy.limits, maxUncompressedBytes: 5 },
      },
    });
    expect(result.inspectionErrors[0]?.code).toBe("ZIP_INFLATE_LIMIT_EXCEEDED");
  });

  it("preserves original Windows backslashes for policy validation", async () => {
    const result = await inspectArtifact({
      kind: "zip",
      inputPath: join(fixtures, "invalid-backslash.zip"),
      policy: await loadPolicy(),
    });
    expect(result.manifest?.files[1]?.path).toBe("assets\\app.js");
  });
});

describe("inspectArtifact directory", () => {
  it("recursively hashes a normal output folder with POSIX manifest paths", async () => {
    const output = join(root, "output");
    await mkdir(join(output, "assets"), { recursive: true });
    await writeFile(join(output, "index.html"), "<!doctype html>");
    await writeFile(join(output, "assets", "app.js"), "export{}");

    const result = await inspectArtifact({
      kind: "directory",
      inputPath: output,
      policy: await loadPolicy(),
    });
    expect(result.pass).toBe(true);
    expect(result.manifest?.files.map(({ path }) => path)).toEqual([
      "assets/app.js",
      "index.html",
    ]);
    expect(result.metadata.artifactSha256).toMatch(/^[a-f\d]{64}$/);
  });

  it.runIf(process.platform !== "win32")(
    "rejects symlinks without following them",
    async () => {
      const output = join(root, "symlink-output");
      await mkdir(output);
      await writeFile(join(output, "index.html"), "<!doctype html>");
      await symlink(join(root, "outside-secret"), join(output, "linked.js"));

      const result = await inspectArtifact({
        kind: "directory",
        inputPath: output,
        policy: await loadPolicy(),
      });
      expect(result.inspectionErrors[0]?.code).toBe(
        "ARTIFACT_DIRECTORY_SYMLINK",
      );
      expect(JSON.stringify(result)).not.toContain("outside-secret");
    },
  );
});

describe("artifact validator CLI", () => {
  it.each([
    ["valid-single-html.zip", 0],
    ["invalid-env.zip", 1],
  ])("returns the documented exit code for %s", async (name, expected) => {
    let stdout = "";
    let stderr = "";
    const code = await runArtifactValidatorCli(
      ["--policy", POLICY_PATH, "--zip", join(fixtures, name)],
      {
        stdout: { write: (text) => (stdout += text) },
        stderr: { write: (text) => (stderr += text) },
      },
    );

    expect(code).toBe(expected);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toHaveProperty("policy.version", "2026-08-12.2");
  });

  it("uses exit code 2 for invalid invocation without exposing local errors", async () => {
    let stderr = "";
    const code = await runArtifactValidatorCli([], {
      stdout: { write: () => undefined },
      stderr: { write: (text) => (stderr += text) },
    });
    expect(code).toBe(2);
    expect(JSON.parse(stderr)).toHaveProperty(
      "error.code",
      "CLI_INTERNAL_ERROR",
    );
  });
});
