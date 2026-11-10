import { describe, expect, it } from "vitest";
import {
  countCompletedHealthChecks,
  getPlatformHealthSummary,
} from "./operations-overview.utils";

describe("countCompletedHealthChecks", () => {
  it("counts online, unavailable, and unverified checks as completed", () => {
    const statuses = {
      express: { status: "online" },
      nestjs: { status: "unavailable" },
      go: { status: "unverified" },
      python: { status: "checking" },
    };

    expect(
      countCompletedHealthChecks(statuses, [
        "express",
        "nestjs",
        "go",
        "python",
      ]),
    ).toBe(3);
  });

  it("does not count missing or pending statuses", () => {
    expect(
      countCompletedHealthChecks(
        { express: { status: "checking" }, nestjs: {} },
        ["express", "nestjs", "go"],
      ),
    ).toBe(0);
  });
});

describe("getPlatformHealthSummary", () => {
  it("reports success only when every check is online", () => {
    expect(
      getPlatformHealthSummary({
        express: "online",
        nestjs: "online",
        go: "online",
      }),
    ).toEqual({
      label: "Everything is up and running",
      detail: "All 3 platform service checks passed.",
      tone: "success",
    });
  });

  it("reports unavailable services as needing attention", () => {
    const result = getPlatformHealthSummary({
      express: "online",
      nestjs: "unavailable",
      go: "checking",
    });

    expect(result.label).toBe("Some services need attention");
    expect(result.tone).toBe("warning");
    expect(result.detail).toContain("1 of 3");
  });

  it("does not leave completed unverified checks in a checking state", () => {
    expect(
      getPlatformHealthSummary({
        express: "online",
        nestjs: "unverified",
        go: "unknown",
      }),
    ).toEqual({
      label: "Health partially verified",
      detail: "All checks completed, but at least one service could not be verified from the browser.",
      tone: "pending",
    });
  });

  it("reports pending checks while a request is still in progress", () => {
    const result = getPlatformHealthSummary({
      express: "online",
      nestjs: "checking",
    });

    expect(result.label).toBe("Checking platform health");
    expect(result.tone).toBe("pending");
  });
});
