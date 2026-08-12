import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PolicyContractCode } from "./codes.js";
import {
  parseCurrentPointer,
  parseJsonText,
  parsePolicyDocument,
  parsePolicyDocumentText,
} from "./parse.js";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const fixtureDir = join(repoRoot, "tests", "fixtures", "policies");

async function readFixture(
  kind: "valid" | "invalid",
  name: string,
): Promise<string> {
  return readFile(join(fixtureDir, kind, `${name}.json`), "utf8");
}

/** 실패 fixture와 기대하는 계약 오류 코드. */
const INVALID_FIXTURES: [string, PolicyContractCode][] = [
  ["missing-required-field", "POLICY_SCHEMA_INVALID"],
  ["unknown-field", "POLICY_SCHEMA_INVALID"],
  ["bad-version-string", "POLICY_SCHEMA_INVALID"],
  ["empty-allowed-extensions", "POLICY_SCHEMA_INVALID"],
  ["error-severity-waivable", "POLICY_SCHEMA_INVALID"],
  ["version-zero-sequence", "POLICY_SCHEMA_INVALID"],
  ["version-not-a-calendar-date", "POLICY_VERSION_NOT_A_CALENDAR_DATE"],
  ["duplicate-error-code", "POLICY_DUPLICATE_CHECK_CODE"],
  ["zip-size-inversion", "POLICY_ZIP_SIZE_INVERTED"],
  ["framework-check-code-not-found", "POLICY_UNKNOWN_CHECK_CODE"],
  ["guide-path-mismatch", "POLICY_GUIDE_PATH_MISMATCH"],
];

describe("parsePolicyDocument", () => {
  it("유효한 fixture를 통과시키고 검증된 타입으로 돌려준다", async () => {
    const result = parsePolicyDocumentText(
      await readFixture("valid", "minimal"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.id).toBe("lounge-deploy");
    expect(result.value.version).toBe("2026-01-02.1");
    expect(result.value.schemaVersion).toBe(1);
    expect(result.value.checks.length).toBeGreaterThan(0);
  });

  it.each(INVALID_FIXTURES)(
    "%s fixture를 %s로 거부한다",
    async (name, code) => {
      const result = parsePolicyDocumentText(
        await readFixture("invalid", name),
      );

      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.issues.map((issue) => issue.code)).toContain(code);
    },
  );

  it("실패 결과에 문제 위치를 남긴다", async () => {
    const result = parsePolicyDocumentText(
      await readFixture("invalid", "zip-size-inversion"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues[0]?.path).toBe("/zip/maxUncompressedBytes");
    expect(result.issues[0]?.detail).toContain("maxCompressedBytes");
  });

  it("객체가 아닌 입력을 거부한다", () => {
    expect(parsePolicyDocument("정책").ok).toBe(false);
    expect(parsePolicyDocument(null).ok).toBe(false);
    expect(parsePolicyDocument([]).ok).toBe(false);
  });

  it("예외를 던지지 않는다", () => {
    expect(() => parsePolicyDocument(undefined)).not.toThrow();
  });
});

describe("parseJsonText", () => {
  it("JSON이 아니면 POLICY_INVALID_JSON이다", () => {
    const result = parseJsonText("{");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues[0]?.code).toBe("POLICY_INVALID_JSON");
  });
});

describe("parseCurrentPointer", () => {
  const pointer = {
    schemaVersion: 1,
    policyId: "lounge-deploy",
    version: "2026-08-12.1",
    activatedAt: "2026-08-12T00:00:00Z",
  };

  it("유효한 포인터를 통과시킨다", () => {
    const result = parseCurrentPointer(pointer);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.version).toBe("2026-08-12.1");
  });

  it("정책 규칙 값을 복제한 포인터를 거부한다", () => {
    const result = parseCurrentPointer({ ...pointer, zip: { maxFiles: 500 } });

    expect(result.ok).toBe(false);
  });

  it("달력에 없는 날짜를 거부한다", () => {
    const result = parseCurrentPointer({ ...pointer, version: "2026-02-30.1" });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues[0]?.code).toBe("POLICY_VERSION_NOT_A_CALENDAR_DATE");
  });

  it.each(["schemaVersion", "policyId", "version", "activatedAt"])(
    "%s 누락을 거부한다",
    (field) => {
      const incomplete: Record<string, unknown> = { ...pointer };
      delete incomplete[field];

      expect(parseCurrentPointer(incomplete).ok).toBe(false);
    },
  );
});
