import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { AppError } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";

const SESSION_COOKIE_NAME = "gomoku_guest_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface RequestUser {
  id: string;
  nickname: string | null;
}

interface SessionPayload {
  version: 1;
  playerId: string;
  nickname: string;
  issuedAt: number;
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSignature(payload: string) {
  return createHmac("sha256", getServerEnv().SESSION_SECRET).update(payload).digest("base64url");
}

function parseSessionCookie(rawValue: string | undefined): SessionPayload | null {
  if (!rawValue) {
    return null;
  }

  const [payload, signature] = rawValue.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = getSignature(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as Partial<SessionPayload>;

    if (
      parsed.version !== 1 ||
      typeof parsed.playerId !== "string" ||
      parsed.playerId.length === 0 ||
      typeof parsed.nickname !== "string" ||
      parsed.nickname.length === 0 ||
      typeof parsed.issuedAt !== "number"
    ) {
      return null;
    }

    return {
      version: 1,
      playerId: parsed.playerId,
      nickname: parsed.nickname,
      issuedAt: parsed.issuedAt,
    };
  } catch {
    return null;
  }
}

function serializeSessionCookie(user: RequestUser) {
  const payload = toBase64Url(
    JSON.stringify({
      version: 1,
      playerId: user.id,
      nickname: user.nickname ?? "guest",
      issuedAt: Date.now(),
    } satisfies SessionPayload),
  );

  return `${payload}.${getSignature(payload)}`;
}

export async function createOrRefreshSession(nickname: string): Promise<RequestUser> {
  const cookieStore = await cookies();
  const existingSession = parseSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  return {
    id: existingSession?.playerId ?? randomUUID(),
    nickname,
  };
}

export async function requireRequestUser(): Promise<RequestUser> {
  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!session) {
    throw new AppError(401, "UNAUTHORIZED", "A valid session is required.");
  }

  return {
    id: session.playerId,
    nickname: session.nickname,
  };
}

export function attachSessionCookie(response: NextResponse, user: RequestUser) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: serializeSessionCookie(user),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function createSignedSessionCookieValueForTests(user: RequestUser) {
  return serializeSessionCookie(user);
}

export function readSignedSessionCookieValueForTests(rawValue: string) {
  return parseSessionCookie(rawValue);
}
