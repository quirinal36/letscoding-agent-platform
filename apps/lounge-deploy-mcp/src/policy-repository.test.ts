import { readFile } from "node:fs/promises";

import type { PolicySource } from "@letscoding/policy-contract";
import { beforeAll, describe, expect, it } from "vitest";

import { createBundledPolicySource } from "./bundled-policy-source.js";
import {
  createGetPolicyHandler,
  verifyActivePolicy,
} from "./policy-repository.js";

const V1 = "2026-08-12.1";
const V2 = "2026-08-12.2";
const FIXED_TIME = new Date("2026-08-13T00:00:00.000Z");
const context = {
  requestId: "test-request",
  signal: new AbortController().signal,
};
let files: Record<string, string>;

beforeAll(async () => {
  files = {
    "current.json": await policyFile("current.json"),
    [`history/${V1}.json`]: await policyFile(`history/${V1}.json`),
    [`history/${V1}.md`]: await policyFile(`history/${V1}.md`),
    [`history/${V2}.json`]: await policyFile(`history/${V2}.json`),
    [`history/${V2}.md`]: await policyFile(`history/${V2}.md`),
  };
});

async function policyFile(relativePath: string): Promise<string> {
  return readFile(
    new URL(`../../../policies/lounge-deploy/${relativePath}`, import.meta.url),
    "utf8",
  );
}

function sourceOf(selectedFiles: Record<string, string> = files): PolicySource {
  return {
    readText(path) {
      return Promise.resolve(selectedFiles[path] ?? null);
    },
  };
}

function handler(source: PolicySource = sourceOf()) {
  return createGetPolicyHandler({
    sourceForPolicy: (policyId) =>
      policyId === "lounge-deploy" ? source : null,
    clock: () => FIXED_TIME,
  });
}

function pointer(version: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    policyId: "lounge-deploy",
    version,
    activatedAt: "2026-08-13T00:00:00Z",
  });
}

async function expectDomainCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("get_policy repository", () => {
  it("resolves the current pointer to one immutable policy and guide", async () => {
    const result = await handler()({ policyId: "lounge-deploy" }, context);

    expect(result).toMatchObject({
      policyId: "lounge-deploy",
      version: V2,
      active: true,
      activatedAt: "2026-08-12T14:08:37Z",
      resolvedAt: FIXED_TIME.toISOString(),
      effectiveAt: "2026-08-12T14:08:37Z",
    });
    expect(result.contentHash).toMatch(/^[a-f\d]{64}$/);
    expect(result.etag).toBe(`"sha256-${result.contentHash}"`);
    expect(result.guide).toContain("Lounge Deploy 정책 가이드");
    expect(result.policy.version).toBe(V2);
  });

  it("replays a requested immutable version without reading current", async () => {
    const withoutPointer = { ...files };
    delete withoutPointer["current.json"];
    const result = await handler(sourceOf(withoutPointer))(
      { policyId: "lounge-deploy", version: V1 },
      context,
    );

    expect(result).toMatchObject({ version: V1, active: false });
    expect(result).not.toHaveProperty("activatedAt");
    expect(result.policy.version).toBe(V1);
  });

  it("does not mix versions when current changes between reads", async () => {
    let activeVersion = V1;
    const switchingSource: PolicySource = {
      readText(path) {
        if (path === "current.json") {
          const selected = activeVersion;
          activeVersion = V2;
          return Promise.resolve(pointer(selected));
        }
        return Promise.resolve(files[path] ?? null);
      },
    };
    const getPolicy = handler(switchingSource);
    const first = await getPolicy({ policyId: "lounge-deploy" }, context);
    const second = await getPolicy({ policyId: "lounge-deploy" }, context);

    expect(first.version).toBe(V1);
    expect(first.policy.version).toBe(V1);
    expect(first.guide).toContain(V1);
    expect(second.version).toBe(V2);
    expect(second.policy.version).toBe(V2);
    expect(second.guide).toContain(V2);
  });

  it("returns a stable hash for the same immutable snapshot", async () => {
    const getPolicy = handler();
    const first = await getPolicy(
      { policyId: "lounge-deploy", version: V2 },
      context,
    );
    const second = await getPolicy(
      { policyId: "lounge-deploy", version: V2 },
      context,
    );
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.guide).toBe(second.guide);
  });

  it("fails closed for a missing version and unknown policy", async () => {
    await expectDomainCode(
      handler()(
        { policyId: "lounge-deploy", version: "2026-08-13.99" },
        context,
      ),
      "POLICY_VERSION_NOT_FOUND",
    );
    await expectDomainCode(
      handler()({ policyId: "private-policy" }, context),
      "POLICY_NOT_FOUND",
    );
  });

  it("does not serve a corrupt snapshot or mismatched guide", async () => {
    const corrupt = { ...files, [`history/${V2}.md`]: "tampered" };
    await expectDomainCode(
      handler(sourceOf(corrupt))({ policyId: "lounge-deploy" }, context),
      "POLICY_BUNDLE_INVALID",
    );
  });

  it("does not fall back to stale policy when the source is unavailable", async () => {
    const unavailable: PolicySource = {
      readText() {
        return Promise.reject(new Error("storage unavailable and secret path"));
      },
    };
    await expectDomainCode(
      handler(unavailable)({ policyId: "lounge-deploy" }, context),
      "POLICY_SERVICE_UNAVAILABLE",
    );
  });

  it("bundles and verifies the published policy tree for readiness", async () => {
    const bundled = createBundledPolicySource();
    expect(
      await verifyActivePolicy(
        bundled,
        "lounge-deploy",
        AbortSignal.timeout(1_000),
      ),
    ).toBe(true);
    const result = await handler(bundled)(
      { policyId: "lounge-deploy" },
      context,
    );
    expect(result.version).toBe(V2);
  });

  it("fails readiness when source validation or cancellation fails", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      await verifyActivePolicy(sourceOf(), "lounge-deploy", controller.signal),
    ).toBe(false);
    expect(
      await verifyActivePolicy(
        sourceOf({ "current.json": "{" }),
        "lounge-deploy",
        AbortSignal.timeout(1_000),
      ),
    ).toBe(false);
  });
});
