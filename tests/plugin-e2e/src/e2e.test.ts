import { readFile, rm, writeFile, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { artifactValidationPolicyFromDocument } from "@letscoding/artifact-validator";
import { createZipFixture } from "@letscoding/artifact-validator/fixtures";
import { inspectArtifact } from "@letscoding/artifact-validator/node";
import {
  createAnalyzeProjectHandler,
  createBundledPolicySource,
  createGetPolicyHandler,
  createValidateArtifactHandler,
  type McpDomainError,
} from "@letscoding/lounge-deploy-mcp";
import { parsePolicyDocument } from "@letscoding/policy-contract";
import { describe, expect, it } from "vitest";

import { E2E_CONTEXT, runJourney } from "./harness.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const getPolicy = createGetPolicyHandler({
  sourceForPolicy: (policyId) =>
    policyId === "lounge-deploy" ? createBundledPolicySource() : null,
});

describe("fresh-install Lounge Deploy journey", () => {
  it.each([
    {
      fixture: "single-html" as const,
      expectedFramework: "single-html" as const,
      outputDirectory: "." as const,
    },
    {
      fixture: "plain-static" as const,
      expectedFramework: "plain-static" as const,
      outputDirectory: "." as const,
    },
    {
      fixture: "vite" as const,
      expectedFramework: "vite" as const,
      outputDirectory: "dist" as const,
      build: {
        binary: "vite" as const,
        args: ["build"],
        label: "vite build",
      },
    },
    {
      fixture: "next" as const,
      expectedFramework: "nextjs" as const,
      outputDirectory: "out" as const,
      build: {
        binary: "next" as const,
        args: ["build"],
        label: "next build",
      },
    },
  ])(
    "builds, packages and reports $fixture with the final policy",
    async (scenario) => {
      const result = await runJourney(scenario);

      expect(result.analysis.result.framework.key).toBe(
        scenario.expectedFramework,
      );
      expect(result.initialPolicy.version).toBe(result.finalPolicy.version);
      expect(result.validation).toMatchObject({
        pass: true,
        decision: "PASS",
        policyVersion: result.finalPolicy.version,
      });
      expect(result.report).toMatchObject({
        pass: true,
        status: "completed",
        policyVersion: result.finalPolicy.version,
        json: {
          artifact: {
            zipPath: result.zipPath,
            rootIndexHtml: true,
          },
        },
      });
      expect(result.manifestPaths).toContain("index.html");
      expect(result.manifestPaths).not.toContain(
        `${scenario.outputDirectory}/index.html`,
      );
      expect(result.report.markdown).toContain(
        "실제 Lounge 등록·공개는 수행하지 않음",
      );
    },
    150_000,
  );

  it("declares an anonymous four-tool MCP and no upload capability", async () => {
    const mcp = JSON.parse(
      await readFile(
        join(repositoryRoot, "plugins/lounge-deploy/.mcp.json"),
        "utf8",
      ),
    ) as {
      mcpServers: Record<string, { enabled_tools: string[] }>;
    };
    const encoded = JSON.stringify(mcp);

    expect(mcp.mcpServers["lounge-deploy"]?.enabled_tools).toEqual([
      "get_policy",
      "analyze_project",
      "validate_artifact",
      "create_report",
    ]);
    expect(encoded).not.toMatch(/token|authorization|secret/i);
    expect(encoded).not.toContain("upload_to_lounge");
  });
});

describe("failure and policy transition journeys", () => {
  it.each([
    ["backslash", "assets\\app.js", "LD_PATH_BACKSLASH"],
    ["environment", ".env.production", "LD_FILE_ENV_INCLUDED"],
  ])(
    "never reports an invalid %s ZIP as complete",
    async (_name, path, code) => {
      const root = await mkdtemp(join(tmpdir(), "lounge-e2e-invalid-"));
      try {
        const zipPath = join(root, "invalid.zip");
        await writeFile(
          zipPath,
          createZipFixture([
            { name: "index.html", contents: "<!doctype html>" },
            { name: path, contents: "redacted" },
          ]),
        );
        const active = await getPolicy(
          { policyId: "lounge-deploy" },
          E2E_CONTEXT,
        );
        const policy = parsedPolicy(active.policy);
        const result = await inspectArtifact({
          kind: "zip",
          inputPath: zipPath,
          policy: artifactValidationPolicyFromDocument(policy),
        });
        const codes = [
          ...result.inspectionErrors.map((finding) => finding.code),
          ...(result.validation?.errors.map((finding) => finding.code) ?? []),
        ];

        expect(result.pass).toBe(false);
        expect(codes).toContain(code);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it("requires revalidation when the active policy changes during work", async () => {
    const root = await mkdtemp(join(tmpdir(), "lounge-e2e-policy-"));
    try {
      const zipPath = join(root, "artifact.zip");
      await writeFile(
        zipPath,
        createZipFixture([{ name: "index.html", contents: "<!doctype html>" }]),
      );
      const old = await getPolicy(
        { policyId: "lounge-deploy", version: "2026-08-12.1" },
        E2E_CONTEXT,
      );
      const oldInspection = await inspectArtifact({
        kind: "zip",
        inputPath: zipPath,
        policy: artifactValidationPolicyFromDocument(parsedPolicy(old.policy)),
      });
      const validate = createValidateArtifactHandler({ getPolicy });
      const stale = await validate(
        inputFromInspection(old.version, oldInspection),
        E2E_CONTEXT,
      );

      expect(stale).toMatchObject({
        pass: false,
        decision: "REVALIDATION_REQUIRED",
        startingPolicyVersion: "2026-08-12.1",
        policyVersion: "2026-08-20.1",
      });

      const current = await getPolicy(
        { policyId: "lounge-deploy" },
        E2E_CONTEXT,
      );
      const currentInspection = await inspectArtifact({
        kind: "zip",
        inputPath: zipPath,
        policy: artifactValidationPolicyFromDocument(
          parsedPolicy(current.policy),
        ),
      });
      const final = await validate(
        inputFromInspection(current.version, currentInspection),
        E2E_CONTEXT,
      );
      expect(final).toMatchObject({ pass: true, decision: "PASS" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed when the policy service is unavailable", async () => {
    const unavailable = createGetPolicyHandler({
      sourceForPolicy: () => ({
        readText() {
          throw new Error("simulated outage");
        },
      }),
    });

    await expect(
      unavailable({ policyId: "lounge-deploy" }, E2E_CONTEXT),
    ).rejects.toEqual(
      expect.objectContaining<Partial<McpDomainError>>({
        code: "POLICY_SERVICE_UNAVAILABLE",
      }),
    );
  });
});

describe("actionable project diagnostics", () => {
  it.each([
    [
      "Vite base",
      [
        packageJson({
          devDependencies: { vite: "8.1.5" },
          scripts: { build: "vite build" },
        }),
        {
          path: "vite.config.mjs",
          sizeBytes: 28,
          content: 'export default { base: "/" }',
        },
      ],
      "PROJECT_VITE_BASE_MISSING",
    ],
    [
      "Next static export",
      [
        packageJson({
          dependencies: { next: "16.2.12" },
          scripts: { build: "next build" },
        }),
        {
          path: "next.config.mjs",
          sizeBytes: 17,
          content: "export default {}",
        },
      ],
      "PROJECT_NEXT_OUTPUT_EXPORT_MISSING",
    ],
    [
      "Next server route",
      [
        packageJson({
          dependencies: { next: "16.2.12" },
          scripts: { build: "next build" },
        }),
        {
          path: "next.config.mjs",
          sizeBytes: 94,
          content:
            'export default { output: "export", assetPrefix: "./", trailingSlash: true, images: { unoptimized: true } }',
        },
        {
          path: "app/api/private/route.ts",
          sizeBytes: 30,
          content: "export function GET() {}",
        },
      ],
      "LD_NEXT_SERVER_RUNTIME_REQUIRED",
    ],
  ])(
    "returns a stable code for invalid %s settings",
    async (_name, files, code) => {
      const analyze = createAnalyzeProjectHandler({ getPolicy });
      const result = await analyze(
        { policyId: "lounge-deploy", files },
        E2E_CONTEXT,
      );
      expect(result.result.pass).toBe(false);
      expect(result.result.findings.map((finding) => finding.code)).toContain(
        code,
      );
    },
  );

  it("reports runtime env, external origin/CSP and root-absolute asset review without values", async () => {
    const marker = "private-runtime-value";
    const analyze = createAnalyzeProjectHandler({ getPolicy });
    const result = await analyze(
      {
        policyId: "lounge-deploy",
        files: [
          packageJson({
            devDependencies: { vite: "8.1.5" },
            scripts: { build: "vite build" },
          }),
          {
            path: "vite.config.mjs",
            sizeBytes: 82,
            content:
              'export default ({ command }) => ({ base: command === "build" ? "./" : "/" })',
          },
          {
            path: "src/app.js",
            sizeBytes: 180,
            content: `const key=import.meta.env.VITE_KEY; fetch("https://api.example.com/${marker}"); document.body.innerHTML='<img src="/assets/a.png">'`,
          },
        ],
      },
      E2E_CONTEXT,
    );
    const codes = result.result.findings.map((finding) => finding.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "PROJECT_RUNTIME_ENV_MIGRATION_REQUIRED",
        "LD_EXTERNAL_ORIGIN_REVIEW_REQUIRED",
        "LD_ASSET_ROOT_ABSOLUTE",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain(marker);
    expect(JSON.stringify(result)).not.toContain("VITE_KEY");
  });
});

function packageJson(value: object) {
  const content = JSON.stringify(value);
  return {
    path: "package.json",
    sizeBytes: Buffer.byteLength(content),
    content,
  };
}

function parsedPolicy(value: Record<string, unknown>) {
  const parsed = parsePolicyDocument(value);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.value;
}

function inputFromInspection(
  version: string,
  inspection: Awaited<ReturnType<typeof inspectArtifact>>,
) {
  const { manifest, validation, metadata } = inspection;
  if (
    manifest === null ||
    validation === null ||
    metadata.artifactSha256 === null ||
    metadata.uncompressedBytes === null
  ) {
    throw new Error("successful inspection required");
  }
  return {
    policyId: "lounge-deploy",
    policyVersion: version,
    manifest: {
      kind: "zip" as const,
      compressedBytes: manifest.compressedBytes ?? 0,
      uncompressedBytes: metadata.uncompressedBytes,
      fileCount: manifest.files.length,
      artifactSha256: metadata.artifactSha256,
      files: [...manifest.files],
    },
    localValidation: {
      pass: validation.pass,
      policyVersion: version,
      artifactSha256: metadata.artifactSha256,
      fileSetSha256: validation.summary.hashes.fileSetSha256,
      fileCount: manifest.files.length,
      totalUncompressedBytes: metadata.uncompressedBytes,
      codes: [...validation.errors, ...validation.warnings].map(
        ({ code }) => code,
      ),
    },
  };
}
