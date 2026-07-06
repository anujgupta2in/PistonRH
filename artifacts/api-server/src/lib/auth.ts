import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set.");
}
const JWT_SECRET: string = process.env.JWT_SECRET;

const TOKEN_TTL = "8h";
export const AUTH_COOKIE_NAME = "pistonrh_token";

export interface AuthTokenPayload {
  userId: number;
  role: "vessel_officer" | "technical_office";
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as unknown as AuthTokenPayload;
  } catch {
    return null;
  }
}
