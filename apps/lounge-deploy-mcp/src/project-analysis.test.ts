import { describe, expect, it } from "vitest";

import { createBundledPolicySource } from "./bundled-policy-source.js";
import { createGetPolicyHandler } from "./policy-repository.js";
import { createAnalyzeProjectHandler } from "./project-analysis.js";
import { analyzeProjectInputSchema } from "./schemas.js";

const context = {
  requestId: "analysis-test",
  signal: new AbortController().signal,
};
const source = createBundledPolicySource();
const getPolicy = createGetPolicyHandler({
  sourceForPolicy: (policyId) => (policyId === "lounge-deploy" ? source : null),
});
const analyze = createAnalyzeProjectHandler({ getPolicy });

function packageJson(value: object) {
  const content = JSON.stringify(value);
  return { path: "package.json", sizeBytes: content.length, content };
}

describe("analyze_project handler", () => {
  it("uses the selected active policy and returns a build-free HTML checklist", async () => {
    const result = await analyze(
      {
        policyId: "lounge-deploy",
        files: [{ path: "index.html", sizeBytes: 120 }],
      },
      context,
    );

    expect(result).toMatchObject({
      policyId: "lounge-deploy",
      policyVersion: "2026-08-12.2",
      result: {
        pass: true,
        framework: { key: "single-html", confidence: "high" },
        build: { command: null, outputDirectory: "." },
      },
    });
    expect(result.result.checklist.map(({ id }) => id)).toEqual(
      expect.arrayContaining(["root-index", "validate-final-policy"]),
    );
  });

  it("pins policy-specific results for the same Vite fixture", async () => {
    const files = [
      packageJson({
        packageManager: "pnpm@11",
        devDependencies: { vite: "7.1.0" },
        scripts: { build: "vite build" },
      }),
      { path: "pnpm-lock.yaml", sizeBytes: 100 },
      {
        path: "vite.config.ts",
        sizeBytes: 100,
        content:
          'export default ({ command }) => ({ base: command === "build" ? "./" : "/" })',
      },
    ];
    const oldResult = await analyze(
      { policyId: "lounge-deploy", version: "2026-08-12.1", files },
      context,
    );
    const activeResult = await analyze(
      { policyId: "lounge-deploy", version: "2026-08-12.2", files },
      context,
    );

    expect(oldResult).toMatchObject({
      policyVersion: "2026-08-12.1",
      result: { framework: { key: "vite" }, pass: true },
    });
    expect(activeResult).toMatchObject({
      policyVersion: "2026-08-12.2",
      result: { framework: { key: "vite" }, pass: true },
    });
  });

  it("returns actionable Next.js blockers without reflecting source content", async () => {
    const secretMarker = "private-marker-must-not-be-returned";
    const result = await analyze(
      {
        policyId: "lounge-deploy",
        files: [
          packageJson({
            dependencies: { next: "16.0.0" },
            scripts: { build: "next build" },
          }),
          {
            path: "next.config.ts",
            sizeBytes: 20,
            content: "export default {}",
          },
          {
            path: "app/api/private/route.ts",
            sizeBytes: 100,
            content: `export function GET() { return "${secretMarker}" }`,
          },
        ],
      },
      context,
    );

    expect(result.result.pass).toBe(false);
    expect(result.result.findings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "PROJECT_NEXT_OUTPUT_EXPORT_MISSING",
        "LD_NEXT_SERVER_RUNTIME_REQUIRED",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain(secretMarker);
  });

  it("returns an explicit generic diagnosis for an unsupported framework", async () => {
    const result = await analyze(
      {
        policyId: "lounge-deploy",
        files: [
          packageJson({
            dependencies: { astro: "6" },
            scripts: { build: "astro build" },
          }),
          { path: "astro.config.mjs", sizeBytes: 10 },
        ],
      },
      context,
    );
    expect(result.result.framework.key).toBe("generic-static");
    expect(result.result.findings.map(({ code }) => code)).toContain(
      "PROJECT_FRAMEWORK_UNSUPPORTED",
    );
  });
});

describe("analyze_project input contract", () => {
  it.each([".env", ".ENV.local", "config/.env-secret", "pnpm-lock.yaml"])(
    "rejects content for metadata-only path %s",
    (path) => {
      expect(
        analyzeProjectInputSchema.safeParse({
          policyId: "lounge-deploy",
          files: [{ path, sizeBytes: 10, content: "sensitive" }],
        }).success,
      ).toBe(false);
    },
  );

  it("enforces UTF-8 byte and aggregate content limits", () => {
    expect(
      analyzeProjectInputSchema.safeParse({
        files: [
          {
            path: "src/large.ts",
            sizeBytes: 40_000,
            content: "가".repeat(11_000),
          },
        ],
      }).success,
    ).toBe(false);

    const files = Array.from({ length: 17 }, (_, index) => ({
      path: `src/file-${index}.ts`,
      sizeBytes: 32_000,
      content: "x".repeat(32_000),
    }));
    expect(analyzeProjectInputSchema.safeParse({ files }).success).toBe(false);
  });

  it("rejects duplicate paths", () => {
    expect(
      analyzeProjectInputSchema.safeParse({
        files: [
          { path: "index.html", sizeBytes: 10 },
          { path: "index.html", sizeBytes: 10 },
        ],
      }).success,
    ).toBe(false);
  });
});
