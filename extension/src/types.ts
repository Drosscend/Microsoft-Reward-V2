export type SearchMode = "pc" | "mobile";

export interface BotState {
  isRunning: boolean;
  mode: SearchMode;
  currentIndex: number;
  total: number;
  modes: SearchMode[];
  currentModeIndex: number;
  tabId: number | null;
  groupId: number | null;
  error?: string;
}

export interface RewardsInfo {
  points: number | null;
  pcProgress: { current: number; target: number } | null;
  mobileProgress: { current: number; target: number } | null;
  lastUpdated: number;
}

export type PopupToWorkerMessage =
  | { action: "start"; modes: SearchMode[] }
  | { action: "stop" }
  | { action: "fetch-rewards" };

export type WorkerToPopupMessage =
  | { action: "progress"; state: BotState }
  | { action: "done" }
  | { action: "error"; error: string };
