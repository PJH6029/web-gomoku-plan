import "server-only";

import { AppError } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";

export interface RequestUser {
  id: string;
  nickname: string | null;
  token: string;
}

function extractBearerToken(request: Request) {
  const header = request.headers.get("authorization");

  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export async function requireRequestUser(request: Request): Promise<RequestUser> {
  const token = extractBearerToken(request);

  if (!token) {
    throw new AppError(401, "UNAUTHORIZED", "A valid session is required.");
  }

  const env = getServerEnv();
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new AppError(401, "UNAUTHORIZED", "The session could not be verified.");
  }

  const user = (await response.json()) as {
    id: string;
    user_metadata?: { nickname?: string };
  };

  return {
    id: user.id,
    nickname: user.user_metadata?.nickname ?? null,
    token,
  };
}
