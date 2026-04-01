"use client";

import { apiRequest } from "@/lib/client-api";

export interface BrowserSession {
  playerId: string;
  nickname: string;
}

export async function ensureBrowserSession(nickname: string) {
  return apiRequest<BrowserSession>("/api/session", {
    method: "POST",
    body: JSON.stringify({ nickname }),
  });
}
