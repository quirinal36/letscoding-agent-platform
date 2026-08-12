import { readFile } from "node:fs/promises";

import { parsePolicyDocumentText } from "@letscoding/policy-contract";
import { beforeAll, describe, expect, it } from "vitest";

import {
  analyzeProject,
  PROJECT_ANALYZER_LIMITS,
  type ProjectFileInput,
} from "./index.js";

let policy: Parameters<typeof analyzeProject>[0]["policy"];

beforeAll(async () => {
  const text = await readFile(
    new URL(
      "../../../policies/lounge-deploy/history/2026-08-12.2.json",
      import.meta.url,
    ),
    "utf8",
  );
  const parsed = parsePolicyDocumentText(text);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  policy = parsed.value;
});

function analyze(files: readonly ProjectFileInput[]) {
  return analyzeProject({ policy, files });
}

function packageJson(value: object): ProjectFileInput {
  const content = JSON.stringify(value);
  return {
    path: "package.json",
    sizeBytes: Buffer.byteLength(content),
    content,
  };
}

function codes(result: ReturnType<typeof analyzeProject>): string[] {
  return result.findings.map(({ code }) => code);
}

describe("framework detection", () => {
  it("detects one index.html as a build-free single HTML artifact", () => {
    const result = analyze([{ path: "index.html", sizeBytes: 10 }]);

    expect(result).toMatchObject({
      pass: true,
      framework: { key: "single-html", confidence: "high", version: null },
      packageManager: "unknown",
      build: { command: null, outputDirectory: "." },
      policy: { id: "lounge-deploy", version: "2026-08-12.2" },
    });
  });

  it("detects a plain HTML/CSS/JS project", () => {
    const result = analyze([
      { path: "index.html", sizeBytes: 10 },
      { path: "styles.css", sizeBytes: 10 },
      { path: "app.js", sizeBytes: 10 },
    ]);
    expect(result.framework.key).toBe("plain-static");
    expect(result.pass).toBe(true);
  });

  it("detects Vite version, pnpm, build command, and custom output", () => {
    const result = analyze([
      packageJson({
        packageManager: "pnpm@11",
        devDependencies: { vite: "^7.0.0" },
        scripts: { build: "vite build" },
      }),
      { path: "pnpm-lock.yaml", sizeBytes: 10 },
      {
        path: "vite.config.ts",
        sizeBytes: 100,
        content:
          'export default defineConfig(({ command }) => ({ base: command === "build" ? "./" : "/", build: { outDir: "release" } }))',
      },
      { path: "src/main.ts", sizeBytes: 10 },
    ]);

    expect(result).toMatchObject({
      pass: true,
      framework: { key: "vite", version: "^7.0.0", confidence: "high" },
      packageManager: "pnpm",
      build: { command: "pnpm build", outputDirectory: "release" },
    });
    expect(codes(result)).not.toContain("PROJECT_VITE_BASE_MISSING");
  });

  it("reports an incomplete Vite config with actionable findings", () => {
    const result = analyze([
      packageJson({
        devDependencies: { vite: "7" },
        scripts: { build: "vite build" },
      }),
      { path: "package-lock.json", sizeBytes: 10 },
      {
        path: "vite.config.ts",
        sizeBytes: 40,
        content: "export default defineConfig({ plugins: [] })",
      },
    ]);

    expect(result.pass).toBe(false);
    expect(codes(result)).toContain("PROJECT_VITE_BASE_MISSING");
    expect(result.findings[0]?.policyCode).toBe(
      "LD_VITE_ASSET_PREFIX_UNEXPECTED",
    );
  });

  it("detects a compatible Next.js static export", () => {
    const result = analyze([
      packageJson({
        dependencies: { next: "16.0.0" },
        scripts: { build: "next build" },
      }),
      { path: "package-lock.json", sizeBytes: 10 },
      {
        path: "next.config.mjs",
        sizeBytes: 200,
        content:
          'export default { output: "export", assetPrefix: ".", trailingSlash: true, images: { unoptimized: true } }',
      },
      { path: "app/page.tsx", sizeBytes: 10 },
    ]);

    expect(result).toMatchObject({
      pass: true,
      framework: { key: "nextjs", version: "16.0.0", confidence: "high" },
      build: { command: "npm run build", outputDirectory: "out" },
    });
  });

  it("reports each missing Next.js static setting", () => {
    const result = analyze([
      packageJson({
        dependencies: { next: "16" },
        scripts: { build: "next build" },
      }),
      { path: "next.config.ts", sizeBytes: 20, content: "export default {}" },
      { path: "app/page.tsx", sizeBytes: 10 },
    ]);
    expect(result.pass).toBe(false);
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "PROJECT_NEXT_OUTPUT_EXPORT_MISSING",
        "PROJECT_NEXT_ASSET_PREFIX_MISSING",
        "PROJECT_NEXT_TRAILING_SLASH_MISSING",
        "PROJECT_NEXT_IMAGES_UNOPTIMIZED_MISSING",
      ]),
    );
  });

  it("returns a generic checklist for an unknown framework", () => {
    const result = analyze([
      packageJson({
        dependencies: { astro: "6" },
        scripts: { build: "astro build" },
      }),
      { path: "astro.config.mjs", sizeBytes: 10 },
    ]);
    expect(result.framework).toMatchObject({
      key: "generic-static",
      confidence: "low",
    });
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "PROJECT_FRAMEWORK_UNSUPPORTED",
        "PROJECT_GENERIC_STATIC_CHECKLIST_REQUIRED",
      ]),
    );
    expect(result.checklist.map(({ id }) => id)).toContain(
      "generic-static-runtime",
    );
  });
});

describe("static deployment risks", () => {
  const nextBase = [
    packageJson({
      dependencies: { next: "16" },
      scripts: { build: "next build" },
    }),
    {
      path: "next.config.ts",
      sizeBytes: 200,
      content:
        'export default { output: "export", assetPrefix: ".", trailingSlash: true, images: { unoptimized: true } }',
    },
  ] as const;

  it.each([
    ["pages/api/data.ts", "export default function handler() {}"],
    ["app/api/data/route.ts", "export function GET() {}"],
    ["app/action.ts", '"use server"; export async function save() {}'],
    ["app/page.tsx", "import { cookies } from 'next/headers'; cookies()"],
    ["pages/index.tsx", "export function getServerSideProps() {}"],
    ["app/page.tsx", "export const revalidate = 60"],
  ])("blocks Next server feature in %s", (path, content) => {
    const result = analyze([
      ...nextBase,
      { path, sizeBytes: content.length, content },
    ]);
    expect(codes(result)).toContain("LD_NEXT_SERVER_RUNTIME_REQUIRED");
    expect(
      result.findings.find(
        ({ code }) => code === "LD_NEXT_SERVER_RUNTIME_REQUIRED",
      )?.severity,
    ).toBe("blocker");
  });

  it("blocks an unresolved dynamic route", () => {
    const result = analyze([
      ...nextBase,
      {
        path: "app/posts/[slug]/page.tsx",
        sizeBytes: 20,
        content: "export default Page",
      },
    ]);
    expect(codes(result)).toContain("PROJECT_NEXT_DYNAMIC_ROUTE_UNRESOLVED");
  });

  it("finds routing, runtime env, external origin and ambiguous root URL risks", () => {
    const result = analyze([
      packageJson({
        devDependencies: { vite: "7" },
        scripts: { build: "vite build" },
      }),
      {
        path: "vite.config.ts",
        sizeBytes: 100,
        content:
          'export default ({ command }) => ({ base: command === "build" ? "./" : "/" })',
      },
      {
        path: "src/app.tsx",
        sizeBytes: 200,
        content:
          'const app = <BrowserRouter/>; const key = import.meta.env.VITE_KEY; fetch("https://api.example.com"); const image=<img src="/images/a.png"/>',
      },
    ]);
    expect(result.pass).toBe(true);
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "PROJECT_BROWSER_ROUTER_REWRITE_REQUIRED",
        "PROJECT_RUNTIME_ENV_MIGRATION_REQUIRED",
        "LD_EXTERNAL_ORIGIN_REVIEW_REQUIRED",
        "LD_ASSET_ROOT_ABSOLUTE",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("VITE_KEY");
    expect(JSON.stringify(result)).not.toContain("api.example.com");
  });
});

describe("input boundary", () => {
  it("rejects .env, lock contents and arbitrary source locations", () => {
    const result = analyze([
      { path: ".env.production", sizeBytes: 10, content: "SECRET=value" },
      { path: "pnpm-lock.yaml", sizeBytes: 10, content: "lockfileVersion: 9" },
      { path: "private/secret.ts", sizeBytes: 10, content: "secret" },
    ]);
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "PROJECT_SENSITIVE_FILE_REJECTED",
        "PROJECT_CONTENT_NOT_ALLOWED",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("SECRET=value");
  });

  it("rejects unsafe paths, invalid sizes, and oversized excerpts", () => {
    const result = analyze([
      { path: "../package.json", sizeBytes: 10 },
      { path: "src/app.ts", sizeBytes: -1 },
      {
        path: "src/large.ts",
        sizeBytes: PROJECT_ANALYZER_LIMITS.maxSourceExcerptBytes + 1,
        content: "a".repeat(PROJECT_ANALYZER_LIMITS.maxSourceExcerptBytes + 1),
      },
    ]);
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "PROJECT_INPUT_PATH_INVALID",
        "PROJECT_INPUT_SIZE_INVALID",
        "PROJECT_CONTENT_TOO_LARGE",
      ]),
    );
  });

  it("reports conflicting lock files deterministically", () => {
    const files = [
      packageJson({ scripts: { build: "tool build" } }),
      { path: "yarn.lock", sizeBytes: 1 },
      { path: "pnpm-lock.yaml", sizeBytes: 1 },
    ];
    const left = analyze(files);
    const right = analyze([...files].reverse());
    expect(codes(left)).toContain("PROJECT_PACKAGE_MANAGER_AMBIGUOUS");
    expect(left).toEqual(right);
  });

  it("does not require build for a single HTML and always records final policy checks", () => {
    const result = analyze([{ path: "index.html", sizeBytes: 1 }]);
    expect(codes(result)).not.toContain("PROJECT_BUILD_SCRIPT_MISSING");
    expect(result.checklist.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "fetch-policy-before-work",
        "root-index",
        "validate-final-policy",
      ]),
    );
  });
});
