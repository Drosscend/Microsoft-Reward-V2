export type LogLevel = "info" | "warn" | "error";

export interface ActivityLogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
}

export interface CardPhaseState {
  isActive: boolean;
  currentCard: number;
  totalCards: number;
}

export interface BotState {
  isRunning: boolean;
  currentIndex: number;
  total: number;
  tabId: number | null;
  groupId: number | null;
  exploreBing?: CardPhaseState;
  // Set when a run was requested but every selected task was already done
  alreadyComplete?: boolean;
  error?: string;
}

export interface RewardsInfo {
  points: number | null;
  pcProgress: { current: number; target: number } | null;
  dailyCardsProgress: { current: number; target: number } | null;
  moreActivitiesProgress: { current: number; target: number } | null;
  exploreBingProgress: { current: number; target: number } | null;
  lastUpdated: number;
}

// An actionable promotion from the Rewards API
export interface CardTarget {
  name: string;
  title: string;
  description: string;
  url: string;
}

export interface RewardsSnapshot {
  info: RewardsInfo;
  exploreCards: CardTarget[];
  // Rewards account country (e.g., "fr"), used to localize search terms
  country: string | null;
}

export type PopupToWorkerMessage =
  | { action: "start"; pcSearches: boolean; exploreBing: boolean }
  | { action: "stop" }
  | { action: "fetch-rewards" }
  | { action: "clear-log" };

export type WorkerToPopupMessage =
  | { action: "progress"; state: BotState }
  | { action: "done" }
  | { action: "error"; error: string };
