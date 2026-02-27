// Module-private types for card processing

import type { BotState, DailyCardsState } from "../../shared/types";

export type StateKey = "dailyCards" | "moreActivities" | "exploreBing";

export interface CardSectionConfig {
  containerSelector: string;
  renderCheckSelector: string;
  stateKey: StateKey;
  label: string;
  // API promotion names that are incomplete + have points (matched via data-bi-id)
  actionableNames: string[];
  // Optional: handler called when a new tab opens (for explore cards that need a search)
  onNewTab?: (newTabId: number, cardName: string) => Promise<void>;
}

export interface CardInfo {
  index: number;
  dataBiId: string;
  x: number;
  y: number;
}
