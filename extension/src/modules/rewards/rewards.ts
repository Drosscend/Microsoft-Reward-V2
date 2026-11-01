// Microsoft Rewards API interaction

import type { CardTarget, RewardsInfo, RewardsSnapshot } from "../../shared/types";
import type { Promotion } from "./types";

const FALLBACK_PC_SEARCHES = 30;
const POINTS_PER_SEARCH = 3;

// Detect the user's 2-letter language code from completed locale-specific promos
// e.g., "FRFR_Rewards_..." → "FR", "ENUS_task..." → "EN"
function getUserLanguage(promos: Promotion[]): string | null {
  for (const p of promos) {
    if (p.complete && p.pointProgressMax > 0) {
      const match = p.name.match(/^([A-Z]{2})[A-Z]{2}_/);
      if (match) return match[1];
    }
  }
  return null;
}

// Check if a promotion is visible for the user's locale
// Filters out locale-specific promos from other countries (e.g., ENUS_ for FR users)
function isVisiblePromo(name: string, userLang: string | null): boolean {
  if (/^(WW_|Global_|NonEN_)/.test(name)) return true;
  if (userLang && name.startsWith(userLang)) return true;
  const localeMatch = name.match(/^([A-Z]{2})[A-Z]{2}_/);
  if (localeMatch && userLang && localeMatch[1] !== userLang) return false;
  return true;
}

// Check if a promotion is an "explore on Bing" task (rendered in section#exploreonbing on /earn)
function isExploreBingPromo(name: string): boolean {
  return name.includes("_exploreonbing_");
}

// Check if a promotion is locked (e.g., available only on a specific day)
function isLockedPromo(promo: Promotion): boolean {
  return promo.attributes?.is_unlocked === "False";
}

function toCardTarget(promo: Promotion): CardTarget {
  return { name: promo.name, title: promo.title, description: promo.description, url: promo.destinationUrl };
}

function todayKey(): string {
  const today = new Date();
  return `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;
}

function progressOf(promos: Promotion[]): { current: number; target: number } {
  return { current: promos.filter((p) => p.complete).length, target: promos.length };
}

export async function fetchRewards(): Promise<RewardsSnapshot | null> {
  try {
    const resp = await fetch("https://rewards.bing.com/api/getuserinfo", {
      credentials: "include",
    });
    if (!resp.ok) {
      console.error("[MSR] Rewards API returned", resp.status);
      return null;
    }

    const data = await resp.json();
    const dashboard = data?.dashboard;
    const userStatus = dashboard?.userStatus;
    if (!userStatus) {
      console.error("[MSR] Unexpected API response shape");
      return null;
    }

    const pc = userStatus.counters?.pcSearch?.[0];

    // Today's daily set: only cards with points
    const dailyPromos = ((dashboard.dailySetPromotions?.[todayKey()] ?? []) as Promotion[])
      .filter((p) => p.pointProgressMax > 0);

    // Split morePromotions into regular activities vs explore-on-bing
    const morePromos = ((dashboard.morePromotions ?? []) as Promotion[])
      .filter((p) => p.pointProgressMax > 0 && !isLockedPromo(p));
    const userLang = getUserLanguage(morePromos);
    const explorePromos = morePromos.filter((p) => isExploreBingPromo(p.name));
    const regularPromos = morePromos.filter((p) => !isExploreBingPromo(p.name) && isVisiblePromo(p.name, userLang));

    const info: RewardsInfo = {
      points: userStatus.availablePoints ?? null,
      pcProgress: pc
        ? { current: pc.pointProgress, target: pc.pointProgressMax }
        : null,
      dailyCardsProgress: progressOf(dailyPromos),
      moreActivitiesProgress: progressOf(regularPromos),
      exploreBingProgress: progressOf(explorePromos),
      lastUpdated: Date.now(),
    };

    await chrome.storage.session.set({ rewardsInfo: info });

    return {
      info,
      exploreCards: explorePromos.filter((p) => !p.complete).map(toCardTarget),
      country: dashboard.userProfile?.attributes?.country ?? null,
    };
  } catch (error) {
    console.error("[MSR] Error fetching rewards info:", error);
    return null;
  }
}

export function getRemainingSearches(info: RewardsInfo | undefined): number {
  const progress = info?.pcProgress;
  if (!progress) return FALLBACK_PC_SEARCHES;

  const remainingPoints = progress.target - progress.current;
  if (remainingPoints <= 0) return 0;
  return Math.ceil(remainingPoints / POINTS_PER_SEARCH);
}
