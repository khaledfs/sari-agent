import jwt from "jsonwebtoken";

import type { JwtPayload } from "@/types/session";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET environment variable.");
  }
  return secret;
}

export function signAuthToken(payload: JwtPayload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyAuthToken(token: string) {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;
}

