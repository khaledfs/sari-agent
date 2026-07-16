import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectDB: vi.fn(async () => undefined) }));

const cookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
}));

const verifyMock = vi.fn();
vi.mock("@/lib/jwt", () => ({
  signAuthToken: vi.fn(),
  verifyAuthToken: (...a: unknown[]) => verifyMock(...a),
}));

const findByIdMock = vi.fn();
const findMock = vi.fn();
vi.mock("@/models/user.model", () => ({
  UserModel: {
    findById: (...a: unknown[]) => findByIdMock(...a),
    find: (...a: unknown[]) => findMock(...a),
  },
}));

import {
  assertAdminOnly,
  assertCanActOnCustomer,
  resolveActorScope,
  scopedCustomerObjectIds,
  type ActorScope,
} from "@/lib/actor-scope";
import { requireAdmin } from "@/lib/auth-user";
import { FORBIDDEN_SCOPE_MESSAGE } from "@/lib/scope-errors";

const AGENT = "6a0000000000000000000a01";
const C1 = "6a0000000000000000000c01";
const C2 = "6a0000000000000000000c02";

function mockSession(role: string, userId = AGENT) {
  cookieGet.mockReturnValue({ value: "token" });
  verifyMock.mockReturnValue({ userId, role });
}

function mockDbRole(role: string | null) {
  findByIdMock.mockReturnValue({
    select: () => ({ lean: () => ({ exec: async () => (role ? { role } : null) }) }),
  });
}

function mockAssignments(ids: string[]) {
  findMock.mockReturnValue({
    select: () => ({ lean: () => ({ exec: async () => ids.map((id) => ({ _id: id })) }) }),
  });
}

beforeEach(() => {
  cookieGet.mockReset();
  verifyMock.mockReset();
  findByIdMock.mockReset();
  findMock.mockReset();
});

describe("resolveActorScope (fresh DB state, never token claims)", () => {
  it("admin scope from the DB role", async () => {
    mockSession("admin");
    mockDbRole("admin");
    expect(await resolveActorScope()).toEqual({ role: "admin", userId: AGENT });
  });

  it("agent scope carries the CURRENT assignment set", async () => {
    mockSession("agent");
    mockDbRole("agent");
    mockAssignments([C1, C2]);
    const scope = await resolveActorScope();
    expect(scope).toEqual({ role: "agent", userId: AGENT, customerIds: [C1, C2] });
  });

  it("a stale token is overruled by the DB: demoted agent loses access", async () => {
    mockSession("agent"); // token still says agent
    mockDbRole("customer"); // but the DB was updated
    await expect(resolveActorScope()).rejects.toThrow("Access denied.");
  });

  it("a deleted user loses access despite a valid token", async () => {
    mockSession("admin");
    mockDbRole(null);
    await expect(resolveActorScope()).rejects.toThrow("Not authenticated.");
  });
});

describe("assertCanActOnCustomer (deny by default, 404 semantics)", () => {
  const agentScope: ActorScope = { role: "agent", userId: AGENT, customerIds: [C1] };
  const adminScope: ActorScope = { role: "admin", userId: "admin-1" };

  it("admin acts on any customer", () => {
    expect(() => assertCanActOnCustomer(adminScope, C2)).not.toThrow();
  });

  it("agent acts on an assigned customer", () => {
    expect(() => assertCanActOnCustomer(agentScope, C1)).not.toThrow();
  });

  it("agent on ANOTHER agent's customer reads as not-found (no leak)", () => {
    expect(() => assertCanActOnCustomer(agentScope, C2)).toThrow("Customer not found.");
  });

  it("unassigned/garbage ids read as not-found", () => {
    expect(() => assertCanActOnCustomer(agentScope, "not-an-id")).toThrow("Customer not found.");
  });
});

describe("admin-only surfaces", () => {
  it("assertAdminOnly throws the stable FORBIDDEN_SCOPE for agents", () => {
    const agentScope: ActorScope = { role: "agent", userId: AGENT, customerIds: [] };
    expect(() => assertAdminOnly(agentScope)).toThrow(FORBIDDEN_SCOPE_MESSAGE);
    expect(() => assertAdminOnly({ role: "admin", userId: "a" })).not.toThrow();
  });

  it("requireAdmin distinguishes agents (403 scope) from others (401)", async () => {
    mockSession("agent");
    await expect(requireAdmin()).rejects.toThrow(FORBIDDEN_SCOPE_MESSAGE);
    mockSession("customer");
    await expect(requireAdmin()).rejects.toThrow("Access denied.");
  });
});

describe("scopedCustomerObjectIds", () => {
  it("null (unrestricted) for admin, ObjectId list for agents", () => {
    expect(scopedCustomerObjectIds({ role: "admin", userId: "a" })).toBeNull();
    const ids = scopedCustomerObjectIds({ role: "agent", userId: AGENT, customerIds: [C1, "junk", C2] });
    expect(ids?.map(String)).toEqual([C1, C2]); // invalid ids dropped
  });
});
