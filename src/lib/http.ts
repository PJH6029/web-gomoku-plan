import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { AppError, getErrorMessage, isAppError } from "@/lib/errors";
import { logError } from "@/lib/logger";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export async function parseRequestBody<T>(request: Request, schema: ZodType<T>) {
  try {
    const body = (await request.json()) as unknown;
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError(400, "INVALID_BODY", "The request body is invalid.", error.flatten());
    }

    throw new AppError(400, "INVALID_BODY", "The request body is invalid.");
  }
}

export function jsonSuccess<T>(data: T, status = 200) {
  return NextResponse.json(
    {
      ok: true,
      data,
    },
    { status },
  );
}

export function jsonError(error: unknown, scope = "api") {
  if (isAppError(error)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }

  logError(scope, error);

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: getErrorMessage(error),
      },
    },
    { status: 500 },
  );
}
