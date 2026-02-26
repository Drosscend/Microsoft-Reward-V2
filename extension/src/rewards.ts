// Microsoft Rewards API interaction

import type { RewardsInfo, SearchMode } from "./types";

const FALLBACK_PC_SEARCHES = 30;
const FALLBACK_MOBILE_SEARCHES = 20;
const POINTS_PER_SEARCH = 3;

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

    const info: RewardsInfo = {
      points: userStatus.availablePoints ?? null,
      pcProgress: pc
        ? { current: pc.pointProgress, target: pc.pointProgressMax }
        : null,
      mobileProgress: mobile
        ? { current: mobile.pointProgress, target: mobile.pointProgressMax }
        : null,
      lastUpdated: Date.now(),
    };

    await chrome.storage.session.set({ rewardsInfo: info });
    return info;
  } catch (error) {
    console.error("[MSR] Error fetching rewards info:", error);
    return null;
  }
}

export async function getRemainingSearches(mode: SearchMode): Promise<number> {
  const result = await chrome.storage.session.get("rewardsInfo");
  const info = result.rewardsInfo as RewardsInfo | undefined;
  if (!info) return mode === "pc" ? FALLBACK_PC_SEARCHES : FALLBACK_MOBILE_SEARCHES;

  const progress = mode === "pc" ? info.pcProgress : info.mobileProgress;
  if (!progress) return mode === "pc" ? FALLBACK_PC_SEARCHES : FALLBACK_MOBILE_SEARCHES;

  const remainingPoints = progress.target - progress.current;
  if (remainingPoints <= 0) return 0;
  return Math.ceil(remainingPoints / POINTS_PER_SEARCH);
}
