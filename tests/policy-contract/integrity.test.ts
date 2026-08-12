/**
 * 저장소에 발행된 정책 디렉터리의 참조 무결성 테스트.
 *
 * 단위·Schema 테스트는 `packages/policy-contract`가 담당한다. 여기서는 실제
 * `policies/` 트리가 계약을 만족하는지, current → history 참조가 끊기지
 * 않았는지, 사람용 문구가 정책 코드를 모두 덮는지 검사한다.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkMessagesKo,
  comparePolicyVersion,
  guidePath,
  guideSha256,
  isPolicyVersion,
  loadActivePolicy,
  loadPolicyVersion,
  normalizeGuideText,
  parseCurrentPointerText,
  snapshotPath,
} from "@letscoding/policy-contract";
import { createFileSystemPolicySource } from "@letscoding/policy-contract/node";
import { beforeAll, describe, expect, it } from "vitest";

const POLICY_ID = "lounge-deploy";
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const policyDirectory = join(repoRoot, "policies", POLICY_ID);
const source = createFileSystemPolicySource(policyDirectory);

async function historyVersions(): Promise<string[]> {
  const entries = await readdir(join(policyDirectory, "history"));
  return entries
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => entry.slice(0, -".json".length));
}

let activeVersion: string;

beforeAll(async () => {
  const pointerText = await readFile(
    join(policyDirectory, "current.json"),
    "utf8",
  );
  const pointer = parseCurrentPointerText(pointerText);
  if (!pointer.ok) {
    throw new Error(
      `current.json is invalid: ${pointer.issues.map((issue) => issue.code).join(", ")}`,
    );
  }
  activeVersion = pointer.value.version;
});

describe("활성 정책", () => {
  it("current.json이 가리키는 정책을 끝까지 로드할 수 있다", async () => {
    const result = await loadActivePolicy(source, { policyId: POLICY_ID });

    if (!result.ok) {
      throw new Error(
        result.issues
          .map((issue) => `${issue.code} ${issue.path} ${issue.detail}`)
          .join("\n"),
      );
    }
    expect(result.value.document.id).toBe(POLICY_ID);
    expect(result.value.document.version).toBe(activeVersion);
  });

  it("framework-guide.md가 활성 버전의 가이드 스냅샷과 같다", async () => {
    const [copy, snapshot] = await Promise.all([
      readFile(join(policyDirectory, "framework-guide.md"), "utf8"),
      readFile(join(policyDirectory, guidePath(activeVersion)), "utf8"),
    ]);

    expect(normalizeGuideText(copy)).toBe(normalizeGuideText(snapshot));
  });
});

describe("history 스냅샷", () => {
  it("적어도 하나의 발행된 버전이 있다", async () => {
    expect((await historyVersions()).length).toBeGreaterThan(0);
  });

  it("모든 파일명이 유효한 버전 형식이다", async () => {
    for (const version of await historyVersions()) {
      expect(isPolicyVersion(version), version).toBe(true);
    }
  });

  it("같은 버전이 두 번 발행되지 않았다", async () => {
    const versions = await historyVersions();
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("모든 스냅샷이 계약과 가이드 해시를 만족한다", async () => {
    for (const version of await historyVersions()) {
      const result = await loadPolicyVersion(source, {
        policyId: POLICY_ID,
        version,
      });

      if (!result.ok) {
        throw new Error(
          `${version}: ${result.issues.map((issue) => `${issue.code} ${issue.path}`).join(", ")}`,
        );
      }
      expect(result.value.document.version).toBe(version);
      expect(guideSha256(result.value.guideMarkdown)).toBe(
        result.value.document.guide.sha256,
      );
    }
  });

  it("활성 버전이 history에서 가장 최신이다", async () => {
    const versions = await historyVersions();
    for (const version of versions) {
      expect(comparePolicyVersion(version, activeVersion)).toBeLessThanOrEqual(
        0,
      );
    }
  });

  it("포인터가 가리키는 스냅샷 파일이 존재한다", async () => {
    expect(await source.readText(snapshotPath(activeVersion))).not.toBeNull();
    expect(await source.readText(guidePath(activeVersion))).not.toBeNull();
  });
});

describe("오류 코드와 한국어 문구", () => {
  it("활성 정책의 모든 titleKey에 문구가 있다", async () => {
    const result = await loadActivePolicy(source, { policyId: POLICY_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    for (const check of result.value.document.checks) {
      expect(checkMessagesKo[check.titleKey], check.code).toBeTruthy();
    }
  });

  it("사용하지 않는 문구가 남아 있지 않다", async () => {
    const result = await loadActivePolicy(source, { policyId: POLICY_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const used = new Set(
      result.value.document.checks.map((check) => check.titleKey),
    );
    for (const key of Object.keys(checkMessagesKo)) {
      expect(used.has(key), `${key}는 어떤 검사도 참조하지 않는다`).toBe(true);
    }
  });

  it("정책 JSON에 사람용 문장을 넣지 않는다", async () => {
    const raw = await readFile(
      join(policyDirectory, snapshotPath(activeVersion)),
      "utf8",
    );

    // 한글 문장은 changeReason에만 허용한다.
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const withoutReason = { ...parsed };
    delete withoutReason["changeReason"];
    expect(JSON.stringify(withoutReason)).not.toMatch(/[가-힣]/u);
  });

  it("모든 guideAnchor가 가이드 Markdown에 존재한다", async () => {
    const result = await loadActivePolicy(source, { policyId: POLICY_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const guide = result.value.guideMarkdown;
    const anchors = new Set<string>([
      result.value.document.runtimeEnv.guideAnchor,
      ...result.value.document.checks.map((check) => check.guideAnchor),
      ...result.value.document.frameworks.map(
        (framework) => framework.guideAnchor,
      ),
    ]);

    for (const anchor of anchors) {
      expect(guide, anchor).toContain(`<a id="${anchor}"></a>`);
    }
  });
});
