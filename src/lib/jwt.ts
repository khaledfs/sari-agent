import jwt from "jsonwebtoken";

import type { JwtPayload } from "@/types/session";

const MIN_JWT_SECRET_LENGTH = 32;

function loadJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET environment variable is missing or too short (must be at least ${MIN_JWT_SECRET_LENGTH} characters).`
    );
  }
  return secret;
}

const JWT_SECRET = loadJwtSecret();

export function signAuthToken(payload: JwtPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyAuthToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

