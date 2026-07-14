import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// @/lib/jwt validates JWT_SECRET at import time — must be mocked before the
// service module loads. DB + model mocked so no connection is attempted.
vi.mock("@/lib/jwt", () => ({
  signAuthToken: vi.fn(() => "test-token"),
  verifyAuthToken: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(async () => undefined),
}));
vi.mock("@/models/user.model", () => ({
  UserModel: { findById: vi.fn() },
}));

import { isStrongPassword } from "@/lib/validators";
import { UserModel } from "@/models/user.model";
import { changeAdminPassword } from "@/services/auth.service";

const findByIdMock = vi.mocked(UserModel.findById);

type MockAdminUser = {
  role: string;
  password: string;
  save: ReturnType<typeof vi.fn>;
};

async function makeUser(role: string, currentPassword: string): Promise<MockAdminUser> {
  return {
    role,
    password: await bcrypt.hash(currentPassword, 4),
    save: vi.fn(async () => undefined),
  };
}

describe("isStrongPassword", () => {
  it.each([
    ["Abcdef12", true],
    ["Customer1234", true],
    ["abcdefg1", false], // no uppercase
    ["ABCDEFG1", false], // no lowercase
    ["Abcdefgh", false], // no digit
    ["Ab1", false], // too short
    ["", false],
  ])("%j -> %s", (password, expected) => {
    expect(isStrongPassword(password)).toBe(expected);
  });
});

describe("changeAdminPassword validation paths", () => {
  beforeEach(() => {
    findByIdMock.mockReset();
  });

  it("rejects missing current or new password before touching the DB", async () => {
    await expect(changeAdminPassword("id", "", "NewPass123")).rejects.toThrow(
      "Current password and new password are required."
    );
    await expect(changeAdminPassword("id", "OldPass123", "")).rejects.toThrow(
      "Current password and new password are required."
    );
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it("rejects a weak new password before touching the DB", async () => {
    await expect(changeAdminPassword("id", "OldPass123", "weak")).rejects.toThrow(
      "Password must be at least 8 characters and include uppercase, lowercase, and number."
    );
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it("rejects when the user does not exist", async () => {
    findByIdMock.mockResolvedValue(null as never);
    await expect(changeAdminPassword("id", "OldPass123", "NewPass123")).rejects.toThrow(
      "Access denied."
    );
  });

  it("rejects a non-admin user", async () => {
    findByIdMock.mockResolvedValue((await makeUser("customer", "OldPass123")) as never);
    await expect(changeAdminPassword("id", "OldPass123", "NewPass123")).rejects.toThrow(
      "Access denied."
    );
  });

  it("rejects a wrong current password", async () => {
    const user = await makeUser("admin", "OldPass123");
    findByIdMock.mockResolvedValue(user as never);
    await expect(changeAdminPassword("id", "WrongPass123", "NewPass123")).rejects.toThrow(
      "Current password is incorrect."
    );
    expect(user.save).not.toHaveBeenCalled();
  });

  it("hashes and saves the new password on success", async () => {
    const user = await makeUser("admin", "OldPass123");
    findByIdMock.mockResolvedValue(user as never);

    const result = await changeAdminPassword("id", "OldPass123", "NewPass123");

    expect(result).toEqual({ success: true });
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(user.password).not.toBe("NewPass123"); // stored hashed, never plaintext
    await expect(bcrypt.compare("NewPass123", user.password)).resolves.toBe(true);
  });
});
