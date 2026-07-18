import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectDB: vi.fn(async () => undefined) }));
vi.mock("@/lib/jwt", () => ({ signAuthToken: vi.fn(), verifyAuthToken: vi.fn() }));

import { assertReassignTargetShape } from "@/lib/admin-agents";

const AGENT = "5f000000000000000000000a";
const OTHER = "5f000000000000000000000b";

describe("assertReassignTargetShape (remove-agent reassignment target)", () => {
  it("treats empty/null/undefined/whitespace as 'unassign' (null)", () => {
    expect(assertReassignTargetShape(AGENT, null)).toBeNull();
    expect(assertReassignTargetShape(AGENT, undefined)).toBeNull();
    expect(assertReassignTargetShape(AGENT, "")).toBeNull();
    expect(assertReassignTargetShape(AGENT, "   ")).toBeNull();
  });

  it("returns the trimmed id for a valid, different target", () => {
    expect(assertReassignTargetShape(AGENT, OTHER)).toBe(OTHER);
    expect(assertReassignTargetShape(AGENT, `  ${OTHER}  `)).toBe(OTHER);
  });

  it("rejects a malformed ObjectId", () => {
    expect(() => assertReassignTargetShape(AGENT, "not-an-id")).toThrow("Reassignment target not found.");
  });

  it("refuses to reassign customers to the agent being removed", () => {
    expect(() => assertReassignTargetShape(AGENT, AGENT)).toThrow(
      "Cannot reassign customers to the agent being removed.",
    );
  });
});
