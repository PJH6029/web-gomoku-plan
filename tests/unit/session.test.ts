import { describe, expect, it } from "vitest";

import { createSignedSessionCookieValueForTests, readSignedSessionCookieValueForTests } from "@/lib/auth";

describe("guest session cookies", () => {
  it("round-trips a signed guest session", () => {
    const rawValue = createSignedSessionCookieValueForTests({
      id: "player-1",
      nickname: "alpha",
    });

    expect(readSignedSessionCookieValueForTests(rawValue)).toMatchObject({
      playerId: "player-1",
      nickname: "alpha",
      version: 1,
    });
  });

  it("rejects a tampered guest session", () => {
    const rawValue = createSignedSessionCookieValueForTests({
      id: "player-1",
      nickname: "alpha",
    });
    const tamperedValue = `${rawValue.slice(0, -1)}${rawValue.endsWith("a") ? "b" : "a"}`;

    expect(readSignedSessionCookieValueForTests(tamperedValue)).toBeNull();
  });
});
