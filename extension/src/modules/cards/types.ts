// Module-private types for card processing

import type { CardTarget } from "../../shared/types";

export type StateKey = "dailyCards" | "moreActivities" | "exploreBing";

export interface CardSectionConfig {
  // Rewards page that renders the section (e.g., /dashboard, /earn)
  pageUrl: string;
  sectionSelector: string;
  stateKey: StateKey;
  label: string;
  // API promotions that are incomplete + have points (matched via link href)
  targets: CardTarget[];
  // Optional: handler called when a new tab opens (for explore cards that need a search)
  onNewTab?: (newTabId: number, target: CardTarget) => Promise<void>;
}

export interface CardLink {
  href: string;
  text: string;
}
