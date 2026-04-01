"use client";

import { createClient, type Session } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

let client: ReturnType<typeof createClient<Database>> | null = null;

export function getBrowserSupabaseClient() {
  if (!client) {
    const env = getPublicEnv();
    client = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }

  return client;
}

export async function ensureBrowserSession(nickname: string): Promise<Session> {
  const supabase = getBrowserSupabaseClient();
  const sessionResult = await supabase.auth.getSession();

  if (sessionResult.error) {
    throw sessionResult.error;
  }

  const currentSession = sessionResult.data.session;

  if (!currentSession) {
    const signInResult = await supabase.auth.signInAnonymously({
      options: {
        data: { nickname },
      },
    });

    if (signInResult.error || !signInResult.data.session) {
      throw signInResult.error ?? new Error("Anonymous authentication did not return a session.");
    }

    return signInResult.data.session;
  }

  if (currentSession.user.user_metadata.nickname !== nickname) {
    const updateResult = await supabase.auth.updateUser({
      data: { nickname },
    });

    if (updateResult.error) {
      throw updateResult.error;
    }
  }

  const refreshedSession = await supabase.auth.getSession();
  if (refreshedSession.error || !refreshedSession.data.session) {
    throw refreshedSession.error ?? new Error("The session could not be refreshed.");
  }

  return refreshedSession.data.session;
}
