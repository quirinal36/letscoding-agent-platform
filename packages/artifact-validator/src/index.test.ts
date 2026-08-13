import { describe, expect, it } from "vitest";

import {
  ARTIFACT_VALIDATION_RULE_IDS,
  validateArtifact,
  type ArtifactManifest,
  type ArtifactManifestFile,
  type ArtifactValidationPolicy,
  type ArtifactValidationRule,
  type ArtifactValidationRuleId,
} from "./index.js";

const MEBIBYTE = 1024 * 1024;
const VALID_SHA256 = "a".repeat(64);

const rules = Object.fromEntries(
  ARTIFACT_VALIDATION_RULE_IDS.map((ruleId) => [
    ruleId,
    {
      code: ruleId.toUpperCase().replaceAll("-", "_"),
      severity: "error",
      message: `Validation failed: ${ruleId}.`,
    },
  ]),
) as Readonly<Record<ArtifactValidationRuleId, ArtifactValidationRule>>;

const policy: ArtifactValidationPolicy = {
  id: "lounge-deploy",
  version: "2026-08-12.1",
  limits: {
    maxCompressedBytes: 30 * MEBIBYTE,
    maxUncompressedBytes: 100 * MEBIBYTE,
    maxFiles: 500,
    maxPathLength: 180,
  },
  files: {
    allowedExtensions: [
      "html",
      "htm",
      "css",
      "js",
      "mjs",
      "json",
      "md",
      "txt",
      "png",
      "jpg",
      "jpeg",
      "gif",
      "svg",
      "webp",
      "ico",
      "mp3",
      "wav",
      "ogg",
      "mp4",
      "woff",
      "woff2",
      "ttf",
    ],
    blockedFileNames: ["runtime-config.js"],
    blockedSegmentPrefixes: [".env"],
    blockedPaths: ["private/reserved.json"],
  },
  paths: {
    forbidBackslashes: true,
    forbidAbsolutePaths: true,
    forbidDotSegments: true,
    forbidEmptySegments: true,
    forbidControlCharacters: true,
    forbiddenUrlCharacters: "%?#;",
  },
  structure: {
    rootFile: "index.html",
    forbidWrapperDirectory: true,
  },
  rules,
};

function file(
  path: string,
  sizeBytes = 1,
  sha256 = VALID_SHA256,
): ArtifactManifestFile {
  return { path, sizeBytes, sha256 };
}

function manifest(
  files: readonly ArtifactManifestFile[] = [file("index.html")],
  compressedBytes = 1,
): ArtifactManifest {
  return { kind: "zip", compressedBytes, files };
}

function validate(
  artifact: ArtifactManifest = manifest(),
  selectedPolicy: ArtifactValidationPolicy = policy,
) {
  return validateArtifact({ policy: selectedPolicy, manifest: artifact });
}

function errorRuleIds(artifact: ArtifactManifest): ArtifactValidationRuleId[] {
  return validate(artifact).errors.map(({ ruleId }) => ruleId);
}

describe("validateArtifact", () => {
  it("passes a valid ZIP and records policy and aggregate metadata", () => {
    const result = validate(
      manifest(
        [file("index.html", 10), file("assets/app.js", 20, "B".repeat(64))],
        30,
      ),
    );

    expect(result).toMatchObject({
      pass: true,
      policy: { id: "lounge-deploy", version: "2026-08-12.1" },
      errors: [],
      warnings: [],
      warningWaivers: [],
      summary: {
        fileCount: 2,
        totalUncompressedBytes: 30,
        compressedBytes: 30,
        hashes: { validSha256Count: 2, invalidSha256Count: 0 },
      },
    });
    expect(result.summary.hashes.fileSetSha256).toMatch(/^[a-f\d]{64}$/);
  });

  it("accepts the exact 30 MiB compressed-size boundary", () => {
    expect(validate(manifest([file("index.html")], 30 * MEBIBYTE)).pass).toBe(
      true,
    );
    expect(
      errorRuleIds(manifest([file("index.html")], 30 * MEBIBYTE + 1)),
    ).toContain("compressed-size-exceeded");
  });

  it("accepts the exact 100 MiB uncompressed-size boundary", () => {
    expect(validate(manifest([file("index.html", 100 * MEBIBYTE)])).pass).toBe(
      true,
    );
    expect(
      errorRuleIds(manifest([file("index.html", 100 * MEBIBYTE + 1)])),
    ).toContain("uncompressed-size-exceeded");
  });

  it("accepts exactly 500 files and rejects 501", () => {
    const atLimit = [
      file("index.html"),
      ...Array.from({ length: 499 }, (_, index) =>
        file(`assets/file-${index}.txt`),
      ),
    ];
    const overLimit = [...atLimit, file("assets/one-too-many.txt")];

    expect(validate(manifest(atLimit)).pass).toBe(true);
    expect(errorRuleIds(manifest(overLimit))).toContain("file-count-exceeded");
  });

  it("collects independent path violations instead of stopping at the first one", () => {
    const paths = [
      "folder\\app.js",
      "/absolute.js",
      "C:/absolute.js",
      "assets/../app.js",
      "assets//app.js",
      `${"a".repeat(181)}.js`,
      "assets/app%20.js",
      "assets/control\u0000.js",
    ];
    const result = validate(
      manifest([file("index.html"), ...paths.map((path) => file(path))]),
    );

    expect(new Set(result.errors.map(({ ruleId }) => ruleId))).toEqual(
      new Set([
        "path-backslash",
        "path-absolute",
        "path-dot-segment",
        "path-empty-segment",
        "path-too-long",
        "path-url-character",
        "path-control-character",
      ]),
    );
  });

  it("rejects empty paths without attempting unsafe derived checks", () => {
    const invalidFile = { ...file("ignored.js"), path: "" };
    expect(errorRuleIds(manifest([file("index.html"), invalidFile]))).toContain(
      "path-invalid",
    );
  });

  it("rejects disallowed extensions, .env segments, runtime config, and reserved paths", () => {
    const result = validate(
      manifest([
        file("index.html"),
        file("assets/module.wasm"),
        file("config/.env.production"),
        file("generated/RUNTIME-CONFIG.JS"),
        file("PRIVATE/RESERVED.JSON"),
      ]),
    );

    expect(
      result.errors.filter(({ ruleId }) => ruleId === "blocked-file"),
    ).toHaveLength(3);
    expect(
      result.errors.filter(({ ruleId }) => ruleId === "extension-not-allowed"),
    ).toHaveLength(2);
  });

  it("reports exact duplicates and case-insensitive path collisions separately", () => {
    const result = validate(
      manifest([
        file("index.html"),
        file("assets/app.js"),
        file("assets/app.js"),
        file("ASSETS/App.js"),
      ]),
    );

    expect(
      result.errors.find(({ ruleId }) => ruleId === "path-duplicate")
        ?.fileIndexes,
    ).toEqual([1, 2]);
    expect(
      result.errors.find(({ ruleId }) => ruleId === "path-case-collision")
        ?.fileIndexes,
    ).toEqual([1, 2, 3]);
  });

  it("detects a wrapped output directory as well as the missing root file", () => {
    const result = validate(
      manifest([file("dist/index.html"), file("dist/assets/app.js")]),
    );

    expect(result.errors.map(({ ruleId }) => ruleId)).toEqual(
      expect.arrayContaining(["root-file-missing", "wrapper-directory"]),
    );
  });

  it("requires an exact, case-sensitive root filename", () => {
    expect(errorRuleIds(manifest([file("INDEX.HTML")]))).toContain(
      "root-file-missing",
    );
  });

  it("rejects missing, negative, non-finite, and unsafe ZIP sizes", () => {
    const missing = {
      kind: "zip",
      files: [file("index.html")],
    } satisfies ArtifactManifest;
    const invalidSizes = [
      -1,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ];

    expect(errorRuleIds(missing)).toContain("compressed-size-required");
    for (const compressedBytes of invalidSizes) {
      expect(
        errorRuleIds(manifest([file("index.html")], compressedBytes)),
      ).toContain("compressed-size-invalid");
    }
  });

  it("rejects invalid file sizes and detects safe-integer total overflow", () => {
    const invalid = validate(
      manifest([file("index.html", -1), file("assets/app.js", Number.NaN)]),
    );
    expect(
      invalid.errors.filter(({ ruleId }) => ruleId === "file-size-invalid"),
    ).toHaveLength(2);
    expect(invalid.summary.totalUncompressedBytes).toBeNull();

    const overflow = validate(
      manifest([
        file("index.html", Number.MAX_SAFE_INTEGER),
        file("assets/app.js", Number.MAX_SAFE_INTEGER),
      ]),
    );
    expect(overflow.errors.map(({ ruleId }) => ruleId)).toEqual(
      expect.arrayContaining([
        "total-size-overflow",
        "uncompressed-size-exceeded",
      ]),
    );
    expect(overflow.summary.totalUncompressedBytes).toBeNull();
  });

  it("validates SHA-256 metadata without returning individual hashes", () => {
    const secretHash = "c".repeat(63);
    const result = validate(manifest([file("index.html", 1, secretHash)]));

    expect(result.errors.map(({ ruleId }) => ruleId)).toContain(
      "sha256-invalid",
    );
    expect(result.summary.hashes).toMatchObject({
      validSha256Count: 0,
      invalidSha256Count: 1,
    });
    expect(JSON.stringify(result)).not.toContain(secretHash);
  });

  it("does not copy a sensitive or malicious path into findings", () => {
    const sensitivePath = ".env.SECRET_VALUE=do-not-log";
    const result = validate(
      manifest([file("index.html"), file(sensitivePath)]),
    );

    expect(result.pass).toBe(false);
    expect(JSON.stringify(result)).not.toContain(sensitivePath);
    expect(
      result.errors.some(({ fileIndexes }) => fileIndexes.includes(1)),
    ).toBe(true);
  });

  it("uses policy-defined codes, severity, and messages", () => {
    const warningRule: ArtifactValidationRule = {
      code: "CUSTOM_EXTENSION_WARNING",
      severity: "warning",
      message: "Review this extension.",
    };
    const warningPolicy: ArtifactValidationPolicy = {
      ...policy,
      rules: { ...policy.rules, "extension-not-allowed": warningRule },
    };
    const result = validate(
      manifest([file("index.html"), file("asset.bin")]),
      warningPolicy,
    );

    expect(result.pass).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      {
        ruleId: "extension-not-allowed",
        code: "CUSTOM_EXTENSION_WARNING",
        severity: "warning",
        message: "Review this extension.",
        fileIndexes: [1],
        waived: false,
      },
    ]);
  });

  it("records warning waivers only when both code and user reason are valid", () => {
    const warningPolicy: ArtifactValidationPolicy = {
      ...policy,
      rules: {
        ...policy.rules,
        "extension-not-allowed": {
          code: "EXTENSION_REVIEW",
          severity: "warning",
          message: "Review this extension.",
        },
      },
    };
    const result = validateArtifact({
      policy: warningPolicy,
      manifest: manifest([file("index.html"), file("asset.bin")]),
      warningWaivers: [
        { code: "EXTENSION_REVIEW", reason: "Approved static asset." },
      ],
    });

    expect(result.pass).toBe(true);
    expect(result.warnings[0]).toMatchObject({
      code: "EXTENSION_REVIEW",
      waived: true,
      waiverReason: "Approved static asset.",
    });
    expect(result.warningWaivers).toEqual([
      {
        code: "EXTENSION_REVIEW",
        reason: "Approved static asset.",
        waivedWarningCount: 1,
      },
    ]);
  });

  it("does not waive a warning that policy marks non-waivable", () => {
    const warningPolicy: ArtifactValidationPolicy = {
      ...policy,
      rules: {
        ...policy.rules,
        "extension-not-allowed": {
          code: "EXTENSION_REVIEW",
          severity: "warning",
          waivable: false,
          message: "Review this extension.",
        },
      },
    };
    const result = validateArtifact({
      policy: warningPolicy,
      manifest: manifest([file("index.html"), file("asset.bin")]),
      warningWaivers: [
        { code: "EXTENSION_REVIEW", reason: "Tried to approve." },
      ],
    });

    expect(result.pass).toBe(false);
    expect(result.warningWaivers).toEqual([]);
    expect(result.warnings[0]?.waived).toBe(false);
    expect(result.errors.map(({ ruleId }) => ruleId)).toContain(
      "warning-waiver-invalid",
    );
  });

  it("does not apply empty, duplicate, unknown, or error-code waivers", () => {
    const warningPolicy: ArtifactValidationPolicy = {
      ...policy,
      rules: {
        ...policy.rules,
        "extension-not-allowed": {
          code: "EXTENSION_REVIEW",
          severity: "warning",
          message: "Review this extension.",
        },
      },
    };
    const result = validateArtifact({
      policy: warningPolicy,
      manifest: manifest([file("index.html"), file("asset.bin")]),
      warningWaivers: [
        { code: "EXTENSION_REVIEW", reason: "" },
        { code: "EXTENSION_REVIEW", reason: "First duplicate." },
        { code: "EXTENSION_REVIEW", reason: "Second duplicate." },
        { code: "UNKNOWN", reason: "No matching warning." },
        {
          code: rules["blocked-file"].code,
          reason: "An error cannot be waived.",
        },
      ],
    });

    expect(result.pass).toBe(false);
    expect(result.warningWaivers).toEqual([]);
    expect(
      result.warnings.find(({ code }) => code === "EXTENSION_REVIEW")?.waived,
    ).toBe(false);
    expect(
      result.errors.filter(({ ruleId }) => ruleId === "warning-waiver-invalid"),
    ).toHaveLength(4);
  });

  it("returns byte-for-byte stable logical results for the same input", () => {
    const input = {
      policy,
      manifest: manifest([
        file("wrapper/index.html"),
        file("wrapper/.env.production", -1, "not-a-hash"),
        file("wrapper/app.exe"),
      ]),
    };

    expect(validateArtifact(input)).toEqual(validateArtifact(input));
  });

  it("creates an order-independent aggregate file-set digest", () => {
    const left = validate(
      manifest([file("index.html"), file("assets/app.js", 2, "b".repeat(64))]),
    );
    const right = validate(
      manifest([file("assets/app.js", 2, "B".repeat(64)), file("index.html")]),
    );

    expect(left.summary.hashes.fileSetSha256).toBe(
      right.summary.hashes.fileSetSha256,
    );
  });

  it("validates directory manifests without requiring a compressed size", () => {
    const result = validate({ kind: "directory", files: [file("index.html")] });

    expect(result.pass).toBe(true);
    expect(result.summary.compressedBytes).toBeNull();
  });
});
