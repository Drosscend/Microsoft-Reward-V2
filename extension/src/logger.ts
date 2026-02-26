// Activity logger: writes to console AND persists to session storage

import type { ActivityLogEntry, LogLevel } from "./types";

const MAX_LOG_ENTRIES = 150;
const STORAGE_KEY = "activityLog";

const consoleMethods: Record<LogLevel, (...args: unknown[]) => void> = {
  info: console.log,
  warn: console.warn,
  error: console.error,
};

export async function logActivity(level: LogLevel, message: string): Promise<void> {
  try {
    consoleMethods[level](`[MSR] ${message}`);

    const entry: ActivityLogEntry = {
      timestamp: Date.now(),
      level,
      message,
    };

    const result = await chrome.storage.session.get(STORAGE_KEY);
    const log = (result[STORAGE_KEY] as ActivityLogEntry[] | undefined) ?? [];
    log.push(entry);

    // Cap at MAX_LOG_ENTRIES — remove oldest entries
    if (log.length > MAX_LOG_ENTRIES) {
      log.splice(0, log.length - MAX_LOG_ENTRIES);
    }

    await chrome.storage.session.set({ [STORAGE_KEY]: log });
  } catch {
    // Logging must never break the bot
  }
}

export async function clearActivityLog(): Promise<void> {
  try {
    await chrome.storage.session.set({ [STORAGE_KEY]: [] });
  } catch {
    // Silent
  }
}
