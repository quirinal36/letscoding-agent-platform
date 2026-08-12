import { describe, expect, it } from "vitest";
import { POLICY_CONTRACT_CODES } from "../codes.js";
import { contractMessageKo, contractMessagesKo } from "./ko.js";

describe("contractMessagesKo", () => {
  it("모든 계약 오류 코드에 문구가 있다", () => {
    for (const code of POLICY_CONTRACT_CODES) {
      expect(contractMessageKo(code), code).toBeTruthy();
    }
  });

  it("사용하지 않는 문구가 남아 있지 않다", () => {
    const declared = new Set<string>(POLICY_CONTRACT_CODES);
    for (const key of Object.keys(contractMessagesKo)) {
      expect(declared.has(key), `${key}는 더 이상 쓰이지 않는다`).toBe(true);
    }
  });

  it("문구는 코드 문자열을 그대로 노출하지 않는다", () => {
    for (const code of POLICY_CONTRACT_CODES) {
      expect(contractMessageKo(code)).not.toContain(code);
    }
  });
});
