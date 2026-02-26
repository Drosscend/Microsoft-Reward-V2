export type SearchMode = "pc" | "mobile";

export type LogLevel = "info" | "warn" | "error";

export interface ActivityLogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
}

export interface DailyCardsState {
  isActive: boolean;
  currentCard: number;
  totalCards: number;
}

export interface BotState {
  isRunning: boolean;
  mode: SearchMode;
  currentIndex: number;
  total: number;
  modes: SearchMode[];
  currentModeIndex: number;
  tabId: number | null;
  groupId: number | null;
  dailyCards?: DailyCardsState;
  moreActivities?: DailyCardsState;
  exploreBing?: DailyCardsState;
  error?: string;
}

export interface RewardsInfo {
  points: number | null;
  pcProgress: { current: number; target: number } | null;
  mobileProgress: { current: number; target: number } | null;
  dailyCardsProgress: { current: number; target: number } | null;
  moreActivitiesProgress: { current: number; target: number } | null;
  exploreBingProgress: { current: number; target: number } | null;
  lastUpdated: number;
}

export interface CardFilters {
  dailyCards: string[];
  moreActivities: string[];
  exploreBing: string[];
}

export type PopupToWorkerMessage =
  | { action: "start"; modes: SearchMode[]; dailyCards: boolean; moreActivities: boolean; exploreBing: boolean }
  | { action: "stop" }
  | { action: "fetch-rewards" }
  | { action: "clear-log" };

export type WorkerToPopupMessage =
  | { action: "progress"; state: BotState }
  | { action: "done" }
  | { action: "error"; error: string };
