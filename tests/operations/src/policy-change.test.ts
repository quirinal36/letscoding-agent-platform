import { describe, expect, it } from "vitest";

import { validatePolicyChanges } from "../../../scripts/verify-policy-change.mjs";

const current = {
  version: "2026-08-13.1",
  activatedAt: "2026-08-13T01:00:00Z",
};
const snapshot = {
  version: "2026-08-13.1",
  effectiveAt: "2026-08-13T01:00:00Z",
  changeReason: "보안 제한 강화",
};
const valid = [
  { status: "M", path: "policies/lounge-deploy/current.json" },
  { status: "M", path: "policies/lounge-deploy/framework-guide.md" },
  { status: "A", path: "policies/lounge-deploy/history/2026-08-13.1.json" },
  { status: "A", path: "policies/lounge-deploy/history/2026-08-13.1.md" },
];

describe("policy change guard", () => {
  it("accepts an atomic immutable activation", () => {
    expect(validatePolicyChanges(valid, current, snapshot)).toEqual([]);
  });

  it.each(["M", "D", "R"])("rejects a %s history mutation", (status) => {
    expect(
      validatePolicyChanges(
        [
          {
            status,
            path: "policies/lounge-deploy/history/2026-08-12.2.json",
          },
        ],
        null,
        null,
      ),
    ).toContain(
      "POLICY_HISTORY_IMMUTABLE:policies/lounge-deploy/history/2026-08-12.2.json",
    );
  });

  it("requires JSON, guide, pointer, effective time and reason together", () => {
    const errors = validatePolicyChanges(
      [{ status: "M", path: "policies/lounge-deploy/current.json" }],
      { version: "2026-08-13.1", activatedAt: "bad" },
      { version: "2026-08-13.2", effectiveAt: "bad", changeReason: "" },
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        "POLICY_ACTIVE_GUIDE_NOT_UPDATED",
        "POLICY_NEW_JSON_NOT_ADDED",
        "POLICY_NEW_GUIDE_NOT_ADDED",
        "POLICY_ACTIVATION_VERSION_MISMATCH",
        "POLICY_CHANGE_REASON_MISSING",
        "POLICY_EFFECTIVE_AT_INVALID",
        "POLICY_ACTIVATED_AT_INVALID",
      ]),
    );
  });
});
