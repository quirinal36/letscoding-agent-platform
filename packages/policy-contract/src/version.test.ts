import { describe, expect, it } from "vitest";
import {
  comparePolicyVersion,
  isPolicyVersion,
  latestPolicyVersion,
  parsePolicyVersion,
  sortPolicyVersions,
} from "./version.js";

describe("parsePolicyVersion", () => {
  it("발행일과 순번으로 분해한다", () => {
    expect(parsePolicyVersion("2026-08-12.3")).toEqual({
      date: "2026-08-12",
      year: 2026,
      month: 8,
      day: 12,
      sequence: 3,
    });
  });

  it("두 자리 순번을 그대로 읽는다", () => {
    expect(parsePolicyVersion("2026-08-12.12")?.sequence).toBe(12);
  });

  it.each([
    ["형식이 다른 구분자", "2026/08/12.1"],
    ["한 자리 월", "2026-8-12.1"],
    ["없는 월", "2026-13-01.1"],
    ["0번 순번", "2026-08-12.0"],
    ["선행 0이 붙은 순번", "2026-08-12.01"],
    ["순번 없음", "2026-08-12"],
    ["접미사", "2026-08-12.1-hotfix"],
    ["빈 문자열", ""],
  ])("%s는 거부한다: %s", (_label, value) => {
    expect(parsePolicyVersion(value)).toBeUndefined();
    expect(isPolicyVersion(value)).toBe(false);
  });

  it.each([
    ["평년 2월 30일", "2026-02-30.1"],
    ["평년 2월 29일", "2026-02-29.1"],
    ["4월 31일", "2026-04-31.1"],
  ])("pattern은 통과하지만 달력에 없는 날짜를 거부한다 (%s)", (_l, value) => {
    expect(isPolicyVersion(value)).toBe(false);
  });

  it("윤년 2월 29일은 허용한다", () => {
    expect(isPolicyVersion("2028-02-29.1")).toBe(true);
  });
});

describe("comparePolicyVersion", () => {
  it("발행일을 먼저 비교한다", () => {
    expect(comparePolicyVersion("2026-08-11.9", "2026-08-12.1")).toBe(-1);
  });

  it("같은 날짜에서는 순번을 숫자로 비교한다", () => {
    expect(comparePolicyVersion("2026-08-12.9", "2026-08-12.10")).toBe(-1);
  });

  it("같은 버전은 0이다", () => {
    expect(comparePolicyVersion("2026-08-12.1", "2026-08-12.1")).toBe(0);
  });

  it("유효하지 않은 버전에는 TypeError를 던진다", () => {
    expect(() => comparePolicyVersion("2026-02-30.1", "2026-08-12.1")).toThrow(
      TypeError,
    );
  });
});

describe("sortPolicyVersions", () => {
  it("문자열 정렬이 아닌 순번 숫자 정렬을 한다", () => {
    const sorted = sortPolicyVersions([
      "2026-08-12.10",
      "2026-08-12.9",
      "2026-08-11.1",
    ]);
    expect(sorted).toEqual(["2026-08-11.1", "2026-08-12.9", "2026-08-12.10"]);
  });

  it("입력 배열을 변경하지 않는다", () => {
    const input = ["2026-08-12.2", "2026-08-12.1"];
    sortPolicyVersions(input);
    expect(input).toEqual(["2026-08-12.2", "2026-08-12.1"]);
  });

  it("가장 최신 버전을 고른다", () => {
    expect(latestPolicyVersion(["2026-08-12.9", "2026-08-12.10"])).toBe(
      "2026-08-12.10",
    );
    expect(latestPolicyVersion([])).toBeUndefined();
  });
});
