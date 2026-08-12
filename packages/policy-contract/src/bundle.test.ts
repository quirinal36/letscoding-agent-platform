import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { PolicySource } from "./bundle.js";
import {
  guideSha256,
  loadActivePolicy,
  loadPolicyVersion,
  normalizeGuideText,
} from "./bundle.js";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const VERSION = "2026-01-02.1";
const GUIDE = "# 가이드\n\n최소 계약 테스트용 가이드다.\n";

let baseDocument: Record<string, unknown>;

beforeAll(async () => {
  const text = await readFile(
    join(repoRoot, "tests", "fixtures", "policies", "valid", "minimal.json"),
    "utf8",
  );
  baseDocument = JSON.parse(text) as Record<string, unknown>;
});

function documentWith(
  overrides: Record<string, unknown> = {},
  guideSha = guideSha256(GUIDE),
): string {
  return JSON.stringify({
    ...baseDocument,
    guide: { path: `history/${VERSION}.md`, sha256: guideSha },
    ...overrides,
  });
}

function pointerText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    policyId: "lounge-deploy",
    version: VERSION,
    activatedAt: "2026-01-02T00:00:00Z",
    ...overrides,
  });
}

function sourceOf(files: Record<string, string>): PolicySource {
  return {
    readText: (relativePath) => Promise.resolve(files[relativePath] ?? null),
  };
}

function completeSource(): Record<string, string> {
  return {
    "current.json": pointerText(),
    [`history/${VERSION}.json`]: documentWith(),
    [`history/${VERSION}.md`]: GUIDE,
  };
}

async function expectFailure(
  files: Record<string, string>,
  code: string,
): Promise<void> {
  const result = await loadActivePolicy(sourceOf(files), {
    policyId: "lounge-deploy",
  });

  expect(result.ok).toBe(false);
  if (result.ok) {
    return;
  }
  expect(result.issues.map((issue) => issue.code)).toContain(code);
}

describe("loadActivePolicy", () => {
  it("포인터가 가리키는 스냅샷과 가이드를 함께 돌려준다", async () => {
    const result = await loadActivePolicy(sourceOf(completeSource()), {
      policyId: "lounge-deploy",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.pointer.version).toBe(VERSION);
    expect(result.value.document.version).toBe(VERSION);
    expect(result.value.guideMarkdown).toBe(GUIDE);
  });

  it("current.json이 없으면 실패한다", async () => {
    const files = completeSource();
    delete files["current.json"];
    await expectFailure(files, "POLICY_POINTER_MISSING");
  });

  it("존재하지 않는 스냅샷을 가리키면 실패한다", async () => {
    const files = completeSource();
    delete files[`history/${VERSION}.json`];
    await expectFailure(files, "POLICY_SNAPSHOT_MISSING");
  });

  it("포인터가 다른 정책 ID를 가리키면 실패한다", async () => {
    const files = completeSource();
    files["current.json"] = pointerText({ policyId: "other-policy" });
    await expectFailure(files, "POLICY_POINTER_ID_MISMATCH");
  });

  it("스냅샷 버전이 파일명과 다르면 실패한다", async () => {
    const files = completeSource();
    files[`history/${VERSION}.json`] = documentWith({
      version: "2026-01-02.2",
      guide: { path: "history/2026-01-02.2.md", sha256: guideSha256(GUIDE) },
    });
    await expectFailure(files, "POLICY_SNAPSHOT_VERSION_MISMATCH");
  });

  it("스냅샷 ID가 포인터와 다르면 실패한다", async () => {
    const files = completeSource();
    files[`history/${VERSION}.json`] = documentWith({ id: "other-policy" });
    await expectFailure(files, "POLICY_SNAPSHOT_ID_MISMATCH");
  });

  it("가이드 Markdown이 없으면 실패한다", async () => {
    const files = completeSource();
    delete files[`history/${VERSION}.md`];
    await expectFailure(files, "POLICY_GUIDE_MISSING");
  });

  it("가이드 해시가 다르면 실패한다", async () => {
    const files = completeSource();
    files[`history/${VERSION}.md`] = `${GUIDE}수정된 문장.\n`;
    await expectFailure(files, "POLICY_GUIDE_HASH_MISMATCH");
  });

  it("깨진 JSON을 오래된 정책으로 대체하지 않는다", async () => {
    const files = completeSource();
    files["current.json"] = "{";
    await expectFailure(files, "POLICY_INVALID_JSON");
  });

  it("CRLF checkout에서도 같은 해시로 판정한다", async () => {
    const files = completeSource();
    files[`history/${VERSION}.md`] = GUIDE.replace(/\n/gu, "\r\n");

    const result = await loadActivePolicy(sourceOf(files), {
      policyId: "lounge-deploy",
    });

    expect(result.ok).toBe(true);
  });
});

describe("loadPolicyVersion", () => {
  it("포인터와 무관하게 과거 버전을 읽는다", async () => {
    const files = completeSource();
    delete files["current.json"];

    const result = await loadPolicyVersion(sourceOf(files), {
      policyId: "lounge-deploy",
      version: VERSION,
    });

    expect(result.ok).toBe(true);
  });
});

describe("normalizeGuideText", () => {
  it("BOM과 CRLF를 제거한다", () => {
    expect(normalizeGuideText("\uFEFF가\r\n나\r\n")).toBe("가\n나\n");
  });
});
