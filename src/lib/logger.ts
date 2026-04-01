type LogLevel = "error" | "info";

function writeLog(level: LogLevel, scope: string, message: string, extra?: Record<string, unknown>) {
  const payload = {
    level,
    scope,
    message,
    ...extra,
    timestamp: new Date().toISOString(),
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }

  console.info(JSON.stringify(payload));
}

export function logInfo(scope: string, message: string, extra?: Record<string, unknown>) {
  writeLog("info", scope, message, extra);
}

export function logError(scope: string, error: unknown, extra?: Record<string, unknown>) {
  writeLog("error", scope, error instanceof Error ? error.message : "Unknown error", {
    ...extra,
    stack: error instanceof Error ? error.stack : undefined,
  });
}
