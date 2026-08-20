import {
  artifactValidationPolicyFromDocument,
  validateArtifact,
  type ArtifactManifestFile,
} from "@letscoding/artifact-validator";
import { parsePolicyDocument } from "@letscoding/policy-contract";
import { describe, expect, it } from "vitest";

import { createValidateArtifactHandler } from "./artifact-validation.js";
import { createBundledPolicySource } from "./bundled-policy-source.js";
import { createGetPolicyHandler } from "./policy-repository.js";
import {
  validateArtifactInputSchema,
  type GetPolicyData,
  type ValidateArtifactInput,
} from "./schemas.js";

const V1 = "2026-08-12.1";
const V2 = "2026-08-12.2";
const ACTIVE_VERSION = "2026-08-20.1";
const HASH = "a".repeat(64);
const ARTIFACT_HASH = "b".repeat(64);
const context = {
  requestId: "artifact-test",
  signal: new AbortController().signal,
};
const source = createBundledPolicySource();
const getPolicy = createGetPolicyHandler({
  sourceForPolicy: (policyId) => (policyId === "lounge-deploy" ? source : null),
});
const validate = createValidateArtifactHandler({ getPolicy });

function file(
  path: string,
  sizeBytes = 10,
  sha256 = HASH,
): ArtifactManifestFile {
  return { path, sizeBytes, sha256 };
}

async function inputFor(
  files: readonly ArtifactManifestFile[],
  options: {
    readonly policyVersion?: string;
    readonly localPass?: boolean;
    readonly localCodes?: readonly string[];
    readonly warningWaivers?: ValidateArtifactInput["warningWaivers"];
  } = {},
): Promise<ValidateArtifactInput> {
  const policyVersion = options.policyVersion ?? ACTIVE_VERSION;
  const selected = await getPolicy(
    { policyId: "lounge-deploy", version: policyVersion },
    context,
  );
  const parsed = parsePolicyDocument(selected.policy);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const compressedBytes = 100;
  const validation = validateArtifact({
    policy: artifactValidationPolicyFromDocument(parsed.value),
    manifest: { kind: "zip", compressedBytes, files },
  });
  const uncompressedBytes = files.reduce(
    (total, entry) => total + entry.sizeBytes,
    0,
  );
  return {
    policyId: "lounge-deploy",
    policyVersion,
    manifest: {
      kind: "zip",
      compressedBytes,
      uncompressedBytes,
      fileCount: files.length,
      artifactSha256: ARTIFACT_HASH,
      files: [...files],
    },
    localValidation: {
      pass: options.localPass ?? true,
      policyVersion,
      artifactSha256: ARTIFACT_HASH,
      fileSetSha256: validation.summary.hashes.fileSetSha256,
      fileCount: files.length,
      totalUncompressedBytes: uncompressedBytes,
      codes: [...(options.localCodes ?? [])],
    },
    ...(options.warningWaivers === undefined
      ? {}
      : { warningWaivers: options.warningWaivers }),
  };
}

describe("validate_artifact handler", () => {
  it("passes only a locally successful manifest independently revalidated by the active policy", async () => {
    const input = await inputFor([file("index.html")]);
    const result = await validate(input, context);

    expect(result).toMatchObject({
      policyId: "lounge-deploy",
      policyVersion: ACTIVE_VERSION,
      startingPolicyVersion: ACTIVE_VERSION,
      decision: "PASS",
      pass: true,
      revalidationRequired: false,
      metadata: { artifactSha256: ARTIFACT_HASH, fileCount: 1 },
      result: { pass: true, policy: { version: ACTIVE_VERSION } },
    });
  });

  it("does not trust client pass=true when server policy rejects the manifest", async () => {
    const input = await inputFor([file("app.js")]);
    const result = await validate(input, context);

    expect(result).toMatchObject({
      decision: "VALIDATION_FAILED",
      pass: false,
      result: { pass: false },
    });
    expect(result.result.errors.map(({ code }) => code)).toContain(
      "LD_ZIP_MISSING_ROOT_INDEX_HTML",
    );
  });

  it.each([
    [
      "Windows backslash",
      [file("assets\\app.js"), file("index.html")],
      "LD_PATH_BACKSLASH",
    ],
    [
      "environment file",
      [file("config/.ENV.local"), file("index.html")],
      "LD_FILE_ENV_INCLUDED",
    ],
    [
      "reserved runtime file",
      [file("assets/runtime-config.js"), file("index.html")],
      "LD_FILE_RUNTIME_CONFIG_INCLUDED",
    ],
    [
      "uncompressed limit",
      [file("index.html", 104_857_601)],
      "LD_ZIP_UNCOMPRESSED_TOO_LARGE",
    ],
  ])("rejects %s fixture", async (_name, files, expectedCode) => {
    const result = await validate(await inputFor(files), context);
    expect(result.pass).toBe(false);
    expect(result.result.errors.map(({ code }) => code)).toContain(
      expectedCode,
    );
  });

  it("rejects a manifest over the policy file-count limit", async () => {
    const files = [
      file("index.html"),
      ...Array.from({ length: 500 }, (_, index) =>
        file(`assets/file-${index}.js`, 1),
      ),
    ];
    const result = await validate(await inputFor(files), context);
    expect(result.pass).toBe(false);
    expect(result.result.errors.map(({ code }) => code)).toContain(
      "LD_ZIP_TOO_MANY_FILES",
    );
  });

  it("keeps local inspection failure from becoming a server success", async () => {
    const result = await validate(
      await inputFor([file("index.html")], {
        localPass: false,
        localCodes: ["ZIP_CRC_MISMATCH"],
      }),
      context,
    );
    expect(result).toMatchObject({
      decision: "LOCAL_VALIDATION_FAILED",
      pass: false,
      localValidation: {
        pass: false,
        codes: ["ZIP_CRC_MISMATCH"],
      },
    });
  });

  it("returns REVALIDATION_REQUIRED and the final policy when active version changes", async () => {
    const selected = [
      await getPolicy({ policyId: "lounge-deploy", version: V1 }, context),
      await getPolicy({ policyId: "lounge-deploy", version: V2 }, context),
    ];
    let index = 0;
    const switching = createValidateArtifactHandler({
      getPolicy: () => Promise.resolve(selected[index++] ?? selected[1]!),
    });
    const result = await switching(
      await inputFor([file("index.html")], { policyVersion: V1 }),
      context,
    );

    expect(result).toMatchObject({
      policyVersion: V2,
      startingPolicyVersion: V1,
      decision: "REVALIDATION_REQUIRED",
      pass: false,
      revalidationRequired: true,
      result: { policy: { version: V2 } },
    });
  });

  it("preserves an approved warning code and reason in the result", async () => {
    const selected = await getPolicy(
      { policyId: "lounge-deploy", version: V2 },
      context,
    );
    const policy = structuredClone(selected.policy);
    const checks = policy.checks;
    if (!Array.isArray(checks)) throw new Error("checks missing");
    const extension = checks.find(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        entry.code === "LD_FILE_EXTENSION_NOT_ALLOWED",
    );
    if (typeof extension !== "object" || extension === null) {
      throw new Error("extension check missing");
    }
    extension.severity = "warning";
    extension.waivable = true;
    const warningPolicy: GetPolicyData = { ...selected, policy };
    const warningHandler = createValidateArtifactHandler({
      getPolicy: () => Promise.resolve(warningPolicy),
    });
    const input = await inputFor([file("index.html"), file("asset.bin")], {
      warningWaivers: [
        {
          code: "LD_FILE_EXTENSION_NOT_ALLOWED",
          reason: "사용자가 정적 자산 형식을 확인함",
        },
      ],
    });
    const result = await warningHandler(input, context);

    expect(result.result.warningWaivers).toEqual([
      {
        code: "LD_FILE_EXTENSION_NOT_ALLOWED",
        reason: "사용자가 정적 자산 형식을 확인함",
        waivedWarningCount: 1,
      },
    ]);
    expect(result.requestedWarningWaivers).toEqual(input.warningWaivers);
  });

  it("rejects a local file-set digest that does not describe the manifest", async () => {
    const input = await inputFor([file("index.html")]);
    await expect(
      validate(
        {
          ...input,
          localValidation: {
            ...input.localValidation,
            fileSetSha256: "c".repeat(64),
          },
        },
        context,
      ),
    ).rejects.toMatchObject({ code: "ARTIFACT_MANIFEST_INCONSISTENT" });
  });
});

describe("validate_artifact input contract", () => {
  it("rejects invalid hashes and contradictory manifest totals", async () => {
    const valid = await inputFor([file("index.html")]);
    expect(
      validateArtifactInputSchema.safeParse({
        ...valid,
        manifest: { ...valid.manifest, artifactSha256: "not-a-hash" },
      }).success,
    ).toBe(false);
    expect(
      validateArtifactInputSchema.safeParse({
        ...valid,
        manifest: { ...valid.manifest, uncompressedBytes: 999 },
      }).success,
    ).toBe(false);
    expect(
      validateArtifactInputSchema.safeParse({
        ...valid,
        manifest: { ...valid.manifest, fileCount: 999 },
      }).success,
    ).toBe(false);
  });

  it("requires a non-empty, control-character-free warning waiver reason", async () => {
    const valid = await inputFor([file("index.html")]);
    for (const reason of ["", "   ", "bad\nreason"]) {
      expect(
        validateArtifactInputSchema.safeParse({
          ...valid,
          warningWaivers: [{ code: "LD_WARNING", reason }],
        }).success,
      ).toBe(false);
    }
  });
});
