import { describe, expect, it } from "vitest";

import {
  AnonymousAccessError,
  assertPublicToolAuthorized,
  authorizeAnonymousRequest,
  ConcurrencyGate,
  createRotatingNetworkKey,
  FixedWindowRateLimiter,
} from "./index.js";

describe("anonymous public MCP boundary", () => {
  it("accepts no identity and rejects tokens or client identity claims", () => {
    expect(authorizeAnonymousRequest({})).toEqual({ kind: "anonymous" });
    for (const headers of [
      { authorization: "Bearer forged" },
      { "x-user-id": "student-1" },
      { "x-org-id": "org-a" },
    ]) {
      expect(() => authorizeAnonymousRequest(headers)).toThrow(
        AnonymousAccessError,
      );
    }
  });

  it("keeps administrator operations outside the public tool allowlist", () => {
    expect(() => assertPublicToolAuthorized("get_policy")).not.toThrow();
    expect(() => assertPublicToolAuthorized("policy_activate")).toThrowError(
      expect.objectContaining({ code: "TOOL_NOT_PUBLIC" }),
    );
  });

  it("creates a short rotating pseudonym instead of retaining an IP", () => {
    const secret = "s".repeat(32);
    const first = createRotatingNetworkKey({
      networkSignal: "203.0.113.1",
      secret,
      now: new Date("2026-08-13T00:00:00Z"),
    });
    const same = createRotatingNetworkKey({
      networkSignal: "203.0.113.1",
      secret,
      now: new Date("2026-08-13T23:59:59Z"),
    });
    const rotated = createRotatingNetworkKey({
      networkSignal: "203.0.113.1",
      secret,
      now: new Date("2026-08-14T00:00:00Z"),
    });

    expect(first).toMatch(/^[a-f\d]{24}$/);
    expect(first).toBe(same);
    expect(first).not.toBe(rotated);
    expect(first).not.toContain("203.0.113.1");
  });
});

describe("abuse controls", () => {
  it("permits a normal plugin flow and limits repeated requests", () => {
    const limiter = new FixedWindowRateLimiter({ limit: 6, windowMs: 60_000 });
    for (let count = 0; count < 6; count += 1) {
      expect(limiter.consume("network", 1_000).allowed).toBe(true);
    }
    expect(limiter.consume("network", 1_000)).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    });
    expect(limiter.consume("network", 61_000).allowed).toBe(true);
  });

  it("releases concurrency exactly once", () => {
    const gate = new ConcurrencyGate(1);
    const release = gate.tryAcquire();
    expect(release).not.toBeNull();
    expect(gate.tryAcquire()).toBeNull();
    release?.();
    release?.();
    expect(gate.tryAcquire()).not.toBeNull();
  });
});
