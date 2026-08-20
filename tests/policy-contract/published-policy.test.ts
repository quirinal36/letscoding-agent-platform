import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadActivePolicy,
  type PolicyDocument,
} from "@letscoding/policy-contract";
import { createFileSystemPolicySource } from "@letscoding/policy-contract/node";
import { beforeAll, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const policyDirectory = join(repoRoot, "policies", "lounge-deploy");
const source = createFileSystemPolicySource(policyDirectory);

let policy: PolicyDocument;
let guide: string;

beforeAll(async () => {
  const result = await loadActivePolicy(source, { policyId: "lounge-deploy" });
  if (!result.ok) {
    throw new Error(
      result.issues
        .map((issue) => `${issue.code} ${issue.path} ${issue.detail}`)
        .join("\n"),
    );
  }

  policy = result.value.document;
  guide = result.value.guideMarkdown;
});

describe("Lounge 구현에서 이관한 활성 정책", () => {
  it("2026-08-20.1의 발행 책임과 원본을 고정한다", () => {
    expect(policy.version).toBe("2026-08-20.1");
    expect(policy.governance).toEqual({
      owner: "@quirinal36",
      approver: "@quirinal36",
      publishedAt: "2026-08-20T00:00:00Z",
    });
    expect(policy.source).toMatchObject({
      repository: "https://github.com/yudanah/letscoding_lounge",
      commit: "e3b8a7016e78e98001595f1d8033ceeac7e6635a",
      synchronizedAt: "2026-08-12T13:23:29Z",
    });
    expect(policy.source?.files.map((file) => file.path)).toEqual([
      "framework_guide.md",
      "src/lib/deploy-validation.ts",
      "src/lib/zip-inflate.ts",
    ]);
    expect(
      policy.source?.files.every((file) => /^[a-f0-9]{64}$/u.test(file.sha256)),
    ).toBe(true);
  });

  it("현재 ZIP 크기, 개수, 형식과 wrapper 동작을 발행한다", () => {
    expect(policy.zip).toMatchObject({
      maxCompressedBytes: 30 * 1024 * 1024,
      maxUncompressedBytes: 100 * 1024 * 1024,
      maxEntries: 500,
      maxFiles: 500,
      maxPathLength: 180,
      requireForwardSlashes: true,
      requireRootIndexHtml: true,
      allowSingleWrapperDirectory: true,
      allowZip64: false,
      allowMultiDisk: false,
    });
  });

  it("허용 확장자와 모든 경로의 예약 이름을 정확히 표현한다", () => {
    expect(policy.files.allowedExtensions).toEqual([
      ".html",
      ".htm",
      ".css",
      ".js",
      ".mjs",
      ".json",
      ".md",
      ".txt",
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".svg",
      ".webp",
      ".ico",
      ".mp3",
      ".wav",
      ".ogg",
      ".mp4",
      ".woff",
      ".woff2",
      ".ttf",
    ]);
    expect(policy.files.blockedFilenames).toEqual([
      {
        match: "prefix",
        value: ".env",
        scope: "path-segment",
        caseSensitive: false,
        code: "LD_FILE_ENV_INCLUDED",
      },
      {
        match: "exact",
        value: "runtime-config.js",
        scope: "basename",
        caseSensitive: false,
        code: "LD_FILE_RUNTIME_CONFIG_INCLUDED",
      },
    ]);
    expect(policy.files.blockedPathRules.map((rule) => rule.kind)).toEqual([
      "absolute-path",
      "parent-traversal",
      "backslash-separator",
      "control-character",
      "url-reinterpret",
      "non-normalized",
    ]);
  });

  it("단일 HTML, Vite, Next.js와 비밀값 분리 정책을 표현한다", () => {
    const frameworks = Object.fromEntries(
      policy.frameworks.map((framework) => [framework.key, framework]),
    );

    expect(frameworks["plain-html"]).toMatchObject({
      artifactKinds: ["single-html", "zip"],
      expectedAssetPrefix: null,
    });
    expect(frameworks.vite).toMatchObject({
      artifactKinds: ["zip"],
      expectedAssetPrefix: "./assets/",
    });
    expect(frameworks.nextjs).toMatchObject({
      artifactKinds: ["zip"],
      expectedAssetPrefix: "./_next/",
    });
    expect(policy.runtimeEnv).toMatchObject({
      attachSeparately: false,
      browserObject: "window.__LETS_RUNTIME_ENV__",
      forbidBundledSecrets: true,
    });
  });

  it("루트 절대 URL을 해제 가능한 경고로 유지한다", () => {
    expect(
      policy.checks.find((check) => check.code === "LD_ASSET_ROOT_ABSOLUTE"),
    ).toMatchObject({ severity: "warning", waivable: true });
  });

  it("현재 Lounge와의 의도적 차이를 migration note에 남긴다", async () => {
    expect(guide).toContain('<a id="migration-notes"></a>');
    expect(guide).toContain("wrapper directory");
    expect(guide).toContain("루트 절대 URL");
    expect(guide).toContain("Markdown 직접 업로드");
    expect(guide).toContain("central directory 항목 수도 500개");

    const activeGuide = await readFile(
      join(policyDirectory, "framework-guide.md"),
      "utf8",
    );
    expect(activeGuide).toBe(guide);
  });
});
