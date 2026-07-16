import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(async () => undefined),
}));

const findByIdMock = vi.fn();
vi.mock("@/models/user.model", () => ({
  UserModel: {
    findById: (...args: unknown[]) => findByIdMock(...args),
  },
}));

import {
  ACCOUNT_RESTRICTED_MESSAGE,
  getAccountStatus,
  requireOrderingEnabled,
  resolveAccountStatus,
} from "@/services/account-status.service";

const VALID_ID = "6a0000000000000000000001";

function mockUserDoc(doc: Record<string, unknown> | null) {
  findByIdMock.mockReturnValue({
    lean: () => ({ exec: async () => doc }),
  });
}

beforeEach(() => {
  findByIdMock.mockReset();
});

describe("resolveAccountStatus (migration mapping, pure)", () => {
  it('explicit "restricted" wins', () => {
    expect(resolveAccountStatus({ accountStatus: "restricted", isActive: true })).toBe("restricted");
  });

  it('explicit "active" wins even over legacy isActive=false', () => {
    expect(resolveAccountStatus({ accountStatus: "active", isActive: false })).toBe("active");
  });

  it('legacy disabled doc (no accountStatus, isActive=false) maps to "restricted"', () => {
    expect(resolveAccountStatus({ isActive: false })).toBe("restricted");
  });

  it('legacy enabled doc maps to "active"', () => {
    expect(resolveAccountStatus({ isActive: true })).toBe("active");
    expect(resolveAccountStatus({})).toBe("active");
  });

  it('missing user maps to "active" (ownership checks handle unknowns)', () => {
    expect(resolveAccountStatus(null)).toBe("active");
    expect(resolveAccountStatus(undefined)).toBe("active");
  });
});

describe("requireOrderingEnabled (reads CURRENT DB state, not token claims)", () => {
  it("active user passes", async () => {
    mockUserDoc({ accountStatus: "active" });
    await expect(requireOrderingEnabled(VALID_ID)).resolves.toBeUndefined();
    expect(findByIdMock).toHaveBeenCalledTimes(1);
  });

  it("restricted user throws the stable guard message", async () => {
    mockUserDoc({ accountStatus: "restricted" });
    await expect(requireOrderingEnabled(VALID_ID)).rejects.toThrow(ACCOUNT_RESTRICTED_MESSAGE);
  });

  it("legacy-disabled user (unmigrated) is also blocked", async () => {
    mockUserDoc({ isActive: false });
    await expect(requireOrderingEnabled(VALID_ID)).rejects.toThrow(ACCOUNT_RESTRICTED_MESSAGE);
  });

  it("hits the database on EVERY call — no caching of a stale status", async () => {
    mockUserDoc({ accountStatus: "active" });
    await requireOrderingEnabled(VALID_ID);
    mockUserDoc({ accountStatus: "restricted" });
    await expect(requireOrderingEnabled(VALID_ID)).rejects.toThrow(ACCOUNT_RESTRICTED_MESSAGE);
    expect(findByIdMock).toHaveBeenCalledTimes(2);
  });

  it("invalid user id passes through (downstream validation owns it)", async () => {
    await expect(requireOrderingEnabled("not-an-objectid")).resolves.toBeUndefined();
    expect(findByIdMock).not.toHaveBeenCalled();
  });
});

describe("getAccountStatus", () => {
  it("returns the effective status for UI consumers", async () => {
    mockUserDoc({ accountStatus: "restricted" });
    expect(await getAccountStatus(VALID_ID)).toBe("restricted");
    mockUserDoc({});
    expect(await getAccountStatus(VALID_ID)).toBe("active");
  });
});
