import {
  artifactValidationPolicyFromDocument,
  validateArtifact,
} from "@letscoding/artifact-validator";
import { parsePolicyDocument } from "@letscoding/policy-contract";
import { beforeAll, describe, expect, it } from "vitest";

import { createValidateArtifactHandler } from "./artifact-validation.js";
import { createBundledPolicySource } from "./bundled-policy-source.js";
import { createGetPolicyHandler } from "./policy-repository.js";
import { createAnalyzeProjectHandler } from "./project-analysis.js";
import { createReport } from "./report.js";
import { createReportInputSchema, type CreateReportInput } from "./schemas.js";

const VERSION = "2026-08-20.1";
const FILE_HASH = "a".repeat(64);
const ARTIFACT_HASH = "b".repeat(64);
const context = {
  requestId: "report-test",
  signal: new AbortController().signal,
};
const source = createBundledPolicySource();
const getPolicy = createGetPolicyHandler({
  sourceForPolicy: (policyId) => (policyId === "lounge-deploy" ? source : null),
});
const analyze = createAnalyzeProjectHandler({ getPolicy });
const validate = createValidateArtifactHandler({ getPolicy });
let baseInput: CreateReportInput;

beforeAll(async () => {
  const selected = await getPolicy(
    { policyId: "lounge-deploy", version: VERSION },
    context,
  );
  const parsed = parsePolicyDocument(selected.policy);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const files = [{ path: "index.html", sizeBytes: 10, sha256: FILE_HASH }];
  const local = validateArtifact({
    policy: artifactValidationPolicyFromDocument(parsed.value),
    manifest: { kind: "zip", compressedBytes: 100, files },
  });
  const analysis = await analyze(
    {
      policyId: "lounge-deploy",
      version: VERSION,
      files: [{ path: "index.html", sizeBytes: 10 }],
    },
    context,
  );
  const validation = await validate(
    {
      policyId: "lounge-deploy",
      policyVersion: VERSION,
      manifest: {
        kind: "zip",
        compressedBytes: 100,
        uncompressedBytes: 10,
        fileCount: 1,
        files,
        artifactSha256: ARTIFACT_HASH,
      },
      localValidation: {
        pass: true,
        policyVersion: VERSION,
        artifactSha256: ARTIFACT_HASH,
        fileSetSha256: local.summary.hashes.fileSetSha256,
        fileCount: 1,
        totalUncompressedBytes: 10,
        codes: [],
      },
    },
    context,
  );
  baseInput = createReportInputSchema.parse({
    policyId: "lounge-deploy",
    policyVersion: VERSION,
    analysis,
    validation,
    clientContext: {
      changedFiles: [{ path: "src/[game]*.ts", reason: "표시 | 로직 #1 수정" }],
      commands: [
        { sequence: 1, command: "pnpm build", purpose: "정적 산출물 생성" },
        {
          sequence: 2,
          command: "lounge-artifact-validate --zip game.zip",
        },
      ],
      outputDirectory: "dist",
      zipPath: "/tmp/game[1].zip",
      verifiedFeatures: ["메인 *게임*", "새로고침"],
      externalOrigins: [
        {
          kind: "api",
          origin: "https://api.example.com",
          purpose: "점수 조회",
        },
      ],
      remainingLimitations: ["CSP 허용 여부를 실제 라운지에서 확인"],
    },
  });
});

describe("create_report", () => {
  it("creates matching deterministic JSON and Korean Markdown snapshots", () => {
    const report = createReport(baseInput);

    expect({
      status: report.status,
      pass: report.pass,
      policy: report.json.policy,
      framework: report.json.framework,
      analysis: report.json.analysis,
      artifact: report.json.artifact,
      validation: report.json.validation,
    }).toMatchInlineSnapshot(`
      {
        "analysis": {
          "findingCodes": [],
          "pass": true,
          "requiredChecklist": [
            ".env, browser runtime env, secret은 ZIP·MCP·보고서에 넣지 않고 server-side 관리 경로로 분리한다.",
            "ZIP 직전에 정책을 다시 조회하고 최종 활성 version으로 검증한다.",
            "소스 트리가 아니라 정적 출력물 내용만 패키징한다.",
            "작업 시작 전에 활성 정책을 조회하고 version을 기록한다.",
            "정규화된 ZIP 루트에 index.html이 있는지 확인한다.",
          ],
        },
        "artifact": {
          "artifactSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "compressedBytes": 100,
          "fileCount": 1,
          "fileSetSha256": "addb8455bf827f6f1a46c7a750c54e6868d7a8c953e51dae7608e0cef40ee03d",
          "kind": "zip",
          "outputDirectory": "dist",
          "rootIndexHtml": true,
          "uncompressedBytes": 10,
          "zipPath": "/tmp/game[1].zip",
        },
        "framework": {
          "confidence": "high",
          "key": "single-html",
          "version": null,
        },
        "pass": true,
        "policy": {
          "analysisVersion": "2026-08-20.1",
          "id": "lounge-deploy",
          "version": "2026-08-20.1",
        },
        "status": "completed",
        "validation": {
          "decision": "PASS",
          "errorCodes": [],
          "warnings": [],
        },
      }
    `);
    expect(report.markdown.split("\n").slice(0, 22)).toMatchInlineSnapshot(`
      [
        "# Lounge Deploy 검증 보고서",
        "",
        "- 상태: **완료**",
        "- 통과: **예**",
        "- 정책: \`lounge-deploy\` / \`2026-08-20.1\`",
        "- 검증 결정: \`PASS\`",
        "",
        "## 프로젝트",
        "",
        "- 프레임워크: \`single-html\`",
        "- 버전: \`확인되지 않음\`",
        "- 감지 신뢰도: \`high\`",
        "- 분석 통과: **예**",
        "- 분석 발견 코드: \`없음\`",
        "- \\.env, browser runtime env, secret은 ZIP·MCP·보고서에 넣지 않고 server\\-side 관리 경로로 분리한다\\.",
        "- ZIP 직전에 정책을 다시 조회하고 최종 활성 version으로 검증한다\\.",
        "- 소스 트리가 아니라 정적 출력물 내용만 패키징한다\\.",
        "- 작업 시작 전에 활성 정책을 조회하고 version을 기록한다\\.",
        "- 정규화된 ZIP 루트에 index\\.html이 있는지 확인한다\\.",
        "",
        "## 산출물",
        "",
      ]
    `);
    expect(report.markdown).toContain("표시 \\| 로직 \\#1 수정");
    expect(report.markdown).toContain("메인 \\*게임\\*");
    expect(report.reportHash).toMatch(/^[a-f\d]{64}$/);
    expect(report.json.pass).toBe(report.pass);
  });

  it("returns byte-for-byte stable output for reordered client arrays", () => {
    const reordered: CreateReportInput = {
      ...baseInput,
      clientContext: {
        ...baseInput.clientContext!,
        commands: [...baseInput.clientContext!.commands!].reverse(),
        verifiedFeatures: [
          ...baseInput.clientContext!.verifiedFeatures!,
        ].reverse(),
      },
    };
    expect(createReport(reordered)).toEqual(createReport(baseInput));
  });

  it("uses a safe code-span fence for client backticks", () => {
    const report = createReport(
      createReportInputSchema.parse({
        ...baseInput,
        clientContext: {
          ...baseInput.clientContext,
          changedFiles: [{ path: "src/`break`.ts", reason: "# 제목 | 변경" }],
        },
      }),
    );
    expect(report.markdown).toContain("``src/`break`.ts``");
    expect(report.markdown).toContain("\\# 제목 \\| 변경");
  });

  it("never reports completion without a passing final validation", () => {
    const failed = createReport({
      ...baseInput,
      validation: {
        ...baseInput.validation,
        decision: "VALIDATION_FAILED",
        pass: false,
        result: { ...baseInput.validation.result, pass: false },
      },
    });
    expect(failed).toMatchObject({ status: "failed", pass: false });
    expect(failed.markdown).toContain("상태: **실패**");
    expect(failed.markdown).not.toContain("상태: **완료**");
  });

  it("makes policy transitions and stale analysis explicit failures", () => {
    const revalidation = createReport({
      ...baseInput,
      validation: {
        ...baseInput.validation,
        decision: "REVALIDATION_REQUIRED",
        pass: false,
        revalidationRequired: true,
      },
    });
    const staleAnalysis = createReport({
      ...baseInput,
      analysis: {
        ...baseInput.analysis!,
        policyVersion: "2026-08-12.1",
        result: {
          ...baseInput.analysis!.result,
          policy: {
            ...baseInput.analysis!.result.policy,
            version: "2026-08-12.1",
          },
        },
      },
    });

    expect(revalidation).toMatchObject({
      status: "revalidation-required",
      pass: false,
    });
    expect(staleAnalysis).toMatchObject({ status: "failed", pass: false });
    expect(staleAnalysis.json.remainingLimitations).toContain(
      "프로젝트 분석과 최종 검증의 정책 버전이 일치하지 않습니다.",
    );
  });

  it("redacts a secret-shaped waiver reason even if a caller bypasses input parsing", () => {
    const warning = {
      ruleId: "extension-not-allowed" as const,
      code: "LD_FILE_EXTENSION_NOT_ALLOWED",
      severity: "warning" as const,
      message: "검토 필요",
      fileIndexes: [0],
      waived: true,
      waiverReason: "token=very-secret-value",
    };
    const report = createReport({
      ...baseInput,
      validation: {
        ...baseInput.validation,
        result: {
          ...baseInput.validation.result,
          warnings: [warning],
        },
      },
    });
    expect(report.json.validation.warnings[0]?.reason).toBe("[REDACTED]");
    expect(report.markdown).not.toContain("very-secret-value");
  });
});

describe("create_report input boundary", () => {
  it.each([
    [
      "secret reason",
      { changedFiles: [{ path: "app.ts", reason: "token=secret-value" }] },
    ],
    [
      "token command",
      {
        commands: [{ sequence: 1, command: `deploy ghp_${"a".repeat(20)}` }],
      },
    ],
    [
      "multiline path",
      { changedFiles: [{ path: "bad\npath", reason: "수정" }] },
    ],
    [
      "origin query",
      {
        externalOrigins: [
          {
            kind: "api",
            origin: "https://api.example.com?token=value",
            purpose: "조회",
          },
        ],
      },
    ],
    [
      "non-web origin",
      {
        externalOrigins: [
          {
            kind: "api",
            origin: "ftp://api.example.com",
            purpose: "조회",
          },
        ],
      },
    ],
  ])("rejects %s", (_name, clientContext) => {
    expect(
      createReportInputSchema.safeParse({
        ...baseInput,
        clientContext: {
          ...baseInput.clientContext,
          ...clientContext,
        },
      }).success,
    ).toBe(false);
  });

  it("requires success-only path and command evidence", () => {
    expect(
      createReportInputSchema.safeParse({
        ...baseInput,
        clientContext: { outputDirectory: "dist", zipPath: "relative.zip" },
      }).success,
    ).toBe(false);
  });
});
