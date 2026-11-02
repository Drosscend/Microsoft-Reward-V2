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
  currentIndex: number;
  total: number;
  tabId: number | null;
  groupId: number | null;
  dailyCards?: DailyCardsState;
  moreActivities?: DailyCardsState;
  exploreBing?: DailyCardsState;
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

// An actionable promotion from the Rewards API, matched to its card link on the page
export interface CardTarget {
  name: string;
  title: string;
  description: string;
  url: string;
}

export interface CardFilters {
  dailyCards: CardTarget[];
  moreActivities: CardTarget[];
  exploreBing: CardTarget[];
}

export interface RewardsSnapshot {
  info: RewardsInfo;
  cards: CardFilters;
  // Rewards account country (e.g., "fr"), used to localize search terms
  country: string | null;
}

export type PopupToWorkerMessage =
  | { action: "start"; pcSearches: boolean; dailyCards: boolean; moreActivities: boolean; exploreBing: boolean }
  | { action: "stop" }
  | { action: "fetch-rewards" }
  | { action: "clear-log" };

export type WorkerToPopupMessage =
  | { action: "progress"; state: BotState }
  | { action: "done" }
  | { action: "error"; error: string };
