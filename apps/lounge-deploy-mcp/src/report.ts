import { createHash } from "node:crypto";

import {
  createReportDataSchema,
  createReportInputSchema,
  type CreateReportData,
  type CreateReportInput,
} from "./schemas.js";
import type { LoungeDeployToolHandlers } from "./server.js";
import { looksSensitive } from "./sensitive-data.js";

export function createReport(input: CreateReportInput): CreateReportData {
  input = createReportInputSchema.parse(input);
  const analysisMatches =
    input.analysis !== undefined &&
    input.analysis.policyId === input.policyId &&
    input.analysis.policyVersion === input.policyVersion;
  const analysisPass = analysisMatches && input.analysis?.result.pass === true;
  const status: CreateReportData["status"] = input.validation
    .revalidationRequired
    ? "revalidation-required"
    : input.validation.pass && analysisPass
      ? "completed"
      : "failed";
  const context = input.clientContext;
  const automaticLimitations = [
    ...(input.analysis === undefined
      ? ["프로젝트 분석 결과가 제공되지 않았습니다."]
      : []),
    ...(input.analysis !== undefined && !analysisMatches
      ? ["프로젝트 분석과 최종 검증의 정책 버전이 일치하지 않습니다."]
      : []),
  ];
  const json = {
    schemaVersion: 1 as const,
    status,
    pass: status === "completed",
    policy: {
      id: input.policyId,
      version: input.policyVersion,
      analysisVersion: input.analysis?.policyVersion ?? null,
    },
    framework:
      input.analysis === undefined
        ? null
        : {
            key: input.analysis.result.framework.key,
            version: input.analysis.result.framework.version,
            confidence: input.analysis.result.framework.confidence,
          },
    analysis: {
      pass: input.analysis?.result.pass ?? null,
      findingCodes: stableStrings(
        (input.analysis?.result.findings ?? []).map(({ code }) =>
          safeReportString(code),
        ),
      ),
      requiredChecklist: stableStrings(
        (input.analysis?.result.checklist ?? [])
          .filter(({ required }) => required)
          .map(({ text }) => safeReportString(text)),
      ),
    },
    changes: stableSort(
      (context?.changedFiles ?? []).map(({ path, reason }) => ({
        path: safeReportString(path),
        reason: safeReportString(reason),
      })),
      (item) => `${item.path}\0${item.reason}`,
    ),
    commands: stableSort(
      (context?.commands ?? []).map(({ sequence, command, purpose }) => ({
        sequence,
        command: safeReportString(command),
        purpose: purpose === undefined ? null : safeReportString(purpose),
      })),
      (item) =>
        `${String(item.sequence).padStart(3, "0")}\0${item.command}\0${item.purpose ?? ""}`,
    ),
    artifact: {
      kind: input.validation.metadata.kind,
      outputDirectory:
        context?.outputDirectory === undefined
          ? null
          : safeReportString(context.outputDirectory),
      zipPath:
        context?.zipPath === undefined
          ? null
          : safeReportString(context.zipPath),
      compressedBytes: input.validation.metadata.compressedBytes,
      uncompressedBytes: input.validation.metadata.uncompressedBytes,
      fileCount: input.validation.metadata.fileCount,
      artifactSha256: input.validation.metadata.artifactSha256.toLowerCase(),
      fileSetSha256: input.validation.metadata.fileSetSha256.toLowerCase(),
      rootIndexHtml: !input.validation.result.errors.some(
        ({ code }) => code === "LD_ZIP_MISSING_ROOT_INDEX_HTML",
      ),
    },
    validation: {
      decision: input.validation.decision,
      errorCodes: [
        ...new Set([
          ...input.validation.result.errors.map(({ code }) => code),
          ...input.validation.localValidation.codes,
        ]),
      ].sort(),
      warnings: stableSort(
        input.validation.result.warnings.map((warning) => ({
          code: warning.code,
          waived: warning.waived,
          reason:
            warning.waiverReason === undefined
              ? null
              : safeReportString(warning.waiverReason),
        })),
        (warning) =>
          `${warning.code}\0${String(warning.waived)}\0${warning.reason ?? ""}`,
      ),
    },
    verifiedFeatures: stableStrings(
      (context?.verifiedFeatures ?? []).map(safeReportString),
    ),
    externalOrigins: stableSort(
      (context?.externalOrigins ?? []).map((dependency) => ({
        kind: dependency.kind,
        origin: dependency.origin,
        purpose: safeReportString(dependency.purpose),
      })),
      (dependency) =>
        `${dependency.kind}\0${dependency.origin}\0${dependency.purpose}`,
    ),
    runtimeEnvNames: stableStrings(context?.runtimeEnvNames ?? []),
    remainingLimitations: stableStrings([
      ...(context?.remainingLimitations ?? []).map(safeReportString),
      ...automaticLimitations,
    ]),
  };
  const markdown = renderMarkdown(json);
  const reportHash = createHash("sha256")
    .update("letscoding-lounge-report-v1\0")
    .update(JSON.stringify(json))
    .update("\0")
    .update(markdown)
    .digest("hex");

  return createReportDataSchema.parse({
    policyId: input.policyId,
    policyVersion: input.policyVersion,
    status,
    pass: status === "completed",
    reportHash,
    markdown,
    json,
  });
}

export const createReportHandler: LoungeDeployToolHandlers["create_report"] =
  async (input, context) => {
    if (context.signal.aborted) throw context.signal.reason;
    const report = createReport(input);
    if (context.signal.aborted) throw context.signal.reason;
    return report;
  };

function renderMarkdown(report: CreateReportData["json"]): string {
  const statusLabel = {
    completed: "완료",
    failed: "실패",
    "revalidation-required": "재검증 필요",
  }[report.status];
  const lines = [
    "# Lounge Deploy 검증 보고서",
    "",
    `- 상태: **${statusLabel}**`,
    `- 통과: **${report.pass ? "예" : "아니요"}**`,
    `- 정책: ${inline(report.policy.id)} / ${inline(report.policy.version)}`,
    `- 검증 결정: ${inline(report.validation.decision)}`,
    "",
    "## 프로젝트",
    "",
    ...(report.framework === null
      ? ["- 프레임워크: 분석 결과 없음"]
      : [
          `- 프레임워크: ${inline(report.framework.key)}`,
          `- 버전: ${inline(report.framework.version ?? "확인되지 않음")}`,
          `- 감지 신뢰도: ${inline(report.framework.confidence)}`,
        ]),
    `- 분석 통과: **${report.analysis.pass === null ? "결과 없음" : report.analysis.pass ? "예" : "아니요"}**`,
    `- 분석 발견 코드: ${inline(report.analysis.findingCodes.join(", ") || "없음")}`,
    ...listOrNone(
      report.analysis.requiredChecklist.map(escapeMarkdown),
      "필수 체크리스트 없음",
    ),
    "",
    "## 산출물",
    "",
    `- 출력 폴더: ${inline(report.artifact.outputDirectory ?? "제공되지 않음")}`,
    `- ZIP 절대 경로: ${inline(report.artifact.zipPath ?? "제공되지 않음")}`,
    `- 압축 크기: ${inline(report.artifact.compressedBytes === null ? "해당 없음" : `${report.artifact.compressedBytes} bytes`)}`,
    `- 압축 전 크기: ${inline(`${report.artifact.uncompressedBytes} bytes`)}`,
    `- 파일 수: ${inline(String(report.artifact.fileCount))}`,
    `- artifact SHA-256: ${inline(report.artifact.artifactSha256)}`,
    `- file-set SHA-256: ${inline(report.artifact.fileSetSha256)}`,
    `- 루트 index.html: **${report.artifact.rootIndexHtml ? "확인" : "누락"}**`,
    "",
    "## 변경 파일",
    "",
    ...listOrNone(
      report.changes.map(
        ({ path, reason }) => `${inline(path)} — ${escapeMarkdown(reason)}`,
      ),
    ),
    "",
    "## 실행 명령",
    "",
    ...listOrNone(
      report.commands.map(
        ({ sequence, command, purpose }) =>
          `${inline(String(sequence))} ${inline(command)}${purpose === null ? "" : ` — ${escapeMarkdown(purpose)}`}`,
      ),
    ),
    "",
    "## 검증 결과",
    "",
    `- 오류 코드: ${inline(report.validation.errorCodes.join(", ") || "없음")}`,
    ...listOrNone(
      report.validation.warnings.map(
        ({ code, waived, reason }) =>
          `${inline(code)} — ${waived ? "해제됨" : "미해제"}${reason === null ? "" : ` — ${escapeMarkdown(reason)}`}`,
      ),
      "경고 없음",
    ),
    "",
    "## 확인한 기능",
    "",
    ...listOrNone(report.verifiedFeatures.map(escapeMarkdown)),
    "",
    "## 외부 의존성",
    "",
    ...listOrNone(
      report.externalOrigins.map(
        ({ kind, origin, purpose }) =>
          `${inline(kind)} ${inline(origin)} — ${escapeMarkdown(purpose)}`,
      ),
    ),
    `- 공개 runtime env 이름: ${inline(report.runtimeEnvNames.join(", ") || "없음")}`,
    "",
    "## 남은 제한사항",
    "",
    ...listOrNone(report.remainingLimitations.map(escapeMarkdown)),
    "",
  ];
  return lines.join("\n");
}

function listOrNone(items: readonly string[], none = "없음"): string[] {
  return items.length === 0
    ? [`- ${escapeMarkdown(none)}`]
    : items.map((item) => `- ${item}`);
}

function inline(value: string): string {
  const longestRun = Math.max(
    0,
    ...(value.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(longestRun + 1);
  const padding = value.startsWith("`") || value.endsWith("`") ? " " : "";
  return `${fence}${padding}${value}${padding}${fence}`;
}

function escapeMarkdown(value: string): string {
  const special = new Set("\\`*_{}[]()#+.!|<>-");
  return [...value]
    .map((character) => (special.has(character) ? `\\${character}` : character))
    .join("");
}

function safeReportString(value: string): string {
  return looksSensitive(value) ? "[REDACTED]" : value;
}

function stableStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function stableSort<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => compareText(key(left), key(right)));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
