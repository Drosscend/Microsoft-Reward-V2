// Microsoft Rewards API interaction

import { logActivity } from "../logger";
import type { CardFilters, RewardsInfo } from "../../shared/types";
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
  const localeMatch = name.match(/^([A-Z]{2})[A-Z_]/);
  if (localeMatch && userLang && localeMatch[1] !== userLang) return false;
  return true;
}

// Check if a promotion is an "explore on Bing" task (rendered in #explore-on-bing section)
function isExploreBingPromo(name: string): boolean {
  return name.includes("_exploreonbing_");
}

// Check if a promotion is locked (e.g., available only on a specific day)
function isLockedPromo(promo: Promotion): boolean {
  return promo.attributes?.is_unlocked === "False";
}

export async function fetchRewardsInfo(): Promise<RewardsInfo | null> {
  try {
    const resp = await fetch("https://rewards.bing.com/api/getuserinfo", {
      credentials: "include",
    });
    if (!resp.ok) {
      console.error("[MSR] Rewards API returned", resp.status);
      return null;
    }

    const data = await resp.json();
    const userStatus = data?.dashboard?.userStatus;
    if (!userStatus) {
      console.error("[MSR] Unexpected API response shape");
      return null;
    }

    const counters = userStatus.counters;
    const pc = counters?.pcSearch?.[0];
    const mobile = counters?.mobileSearch?.[0];

    // Daily cards progress: count completed vs total (only cards with points)
    const dashboard = data?.dashboard;
    let dailyCardsProgress: RewardsInfo["dailyCardsProgress"] = null;
    if (dashboard?.dailySetPromotions) {
      const today = new Date();
      const dateKey = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;
      const todayPromos = dashboard.dailySetPromotions[dateKey] as Promotion[] | undefined;
      if (todayPromos) {
        const withPoints = todayPromos.filter((p) => p.pointProgressMax > 0);
        dailyCardsProgress = {
          current: withPoints.filter((p) => p.complete).length,
          target: withPoints.length,
        };
      }
    }

    // Split morePromotions into regular activities vs explore-on-bing
    let moreActivitiesProgress: RewardsInfo["moreActivitiesProgress"] = null;
    let exploreBingProgress: RewardsInfo["exploreBingProgress"] = null;
    const morePromos = dashboard?.morePromotions as Promotion[] | undefined;
    if (morePromos) {
      const userLang = getUserLanguage(morePromos);
      const explore = morePromos.filter((p) => p.pointProgressMax > 0 && !isLockedPromo(p) && isExploreBingPromo(p.name));
      const regular = morePromos.filter((p) => p.pointProgressMax > 0 && !isLockedPromo(p) && !isExploreBingPromo(p.name) && isVisiblePromo(p.name, userLang));
      moreActivitiesProgress = {
        current: regular.filter((p) => p.complete).length,
        target: regular.length,
      };
      exploreBingProgress = {
        current: explore.filter((p) => p.complete).length,
        target: explore.length,
      };
    }

    const info: RewardsInfo = {
      points: userStatus.availablePoints ?? null,
      pcProgress: pc
        ? { current: pc.pointProgress, target: pc.pointProgressMax }
        : null,
      mobileProgress: mobile
        ? { current: mobile.pointProgress, target: mobile.pointProgressMax }
        : null,
      dailyCardsProgress,
      moreActivitiesProgress,
      exploreBingProgress,
      lastUpdated: Date.now(),
    };

    await chrome.storage.session.set({ rewardsInfo: info });
    return info;
  } catch (error) {
    console.error("[MSR] Error fetching rewards info:", error);
    return null;
  }
}

export async function fetchCardFilters(): Promise<CardFilters> {
  try {
    const resp = await fetch("https://rewards.bing.com/api/getuserinfo", {
      credentials: "include",
    });
    if (!resp.ok) {
      console.warn("[MSR] Card filters: API returned", resp.status);
      return { dailyCards: [], moreActivities: [], exploreBing: [] };
    }

    const data = await resp.json();
    const dashboard = data?.dashboard;
    if (!dashboard) {
      console.warn("[MSR] Card filters: no dashboard in response");
      return { dailyCards: [], moreActivities: [], exploreBing: [] };
    }

    // Daily cards: find today's incomplete promotions with points
    const dailyCards: string[] = [];
    const dailySetPromotions = dashboard.dailySetPromotions;
    if (dailySetPromotions) {
      const today = new Date();
      const dateKey = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;
      const todayPromos = dailySetPromotions[dateKey] as Promotion[] | undefined;

      if (todayPromos) {
        for (const promo of todayPromos) {
          if (!promo.complete && promo.pointProgressMax > 0) {
            dailyCards.push(promo.name);
          }
        }
        await logActivity("info", `Daily cards: ${dailyCards.length}/${todayPromos.length} actionable`);
      } else {
        console.warn(`[MSR] No daily set promotions for ${dateKey}`);
      }
    }

    // More activities + explore on bing: split by promo type
    const moreActivities: string[] = [];
    const exploreBing: string[] = [];
    const morePromotions = dashboard.morePromotions as Promotion[] | undefined;

    if (morePromotions) {
      const userLang = getUserLanguage(morePromotions);
      for (const promo of morePromotions) {
        if (!promo.complete && promo.pointProgressMax > 0 && !isLockedPromo(promo)) {
          if (isExploreBingPromo(promo.name)) {
            exploreBing.push(promo.name);
          } else if (isVisiblePromo(promo.name, userLang)) {
            moreActivities.push(promo.name);
          }
        }
      }
      if (moreActivities.length > 0) {
        await logActivity("info", `More activities: ${moreActivities.length} actionable`);
      }
      if (exploreBing.length > 0) {
        await logActivity("info", `Explore Bing: ${exploreBing.length} actionable`);
      }
    }

    return { dailyCards, moreActivities, exploreBing };
  } catch (error) {
    console.error("[MSR] Error fetching card filters:", error);
    return { dailyCards: [], moreActivities: [], exploreBing: [] };
  }
}

export async function getRemainingSearches(): Promise<number> {
  const result = await chrome.storage.session.get("rewardsInfo");
  const info = result.rewardsInfo as RewardsInfo | undefined;
  if (!info) return FALLBACK_PC_SEARCHES;

  const progress = info.pcProgress;
  if (!progress) return FALLBACK_PC_SEARCHES;

  const remainingPoints = progress.target - progress.current;
  if (remainingPoints <= 0) return 0;
  return Math.ceil(remainingPoints / POINTS_PER_SEARCH);
}
