import { afterAll, beforeAll, describe, expect, mock, setSystemTime, test } from "bun:test";
import { fetchRewards, getRemainingSearches } from "./rewards";

const promo = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  title: name,
  destinationUrl: `https://www.bing.com/search?q=${name}`,
  complete: false,
  pointProgress: 0,
  pointProgressMax: 10,
  ...extra,
});

// Shape observed on /api/getuserinfo?type=1 (November 2026)
const dashboard = {
  userStatus: {
    availablePoints: 8901,
    counters: { pcSearch: [{ pointProgress: 3, pointProgressMax: 60 }] },
  },
  userProfile: { attributes: { country: "fr" } },
  dailySetPromotions: {
    "11/01/2026": [
      promo("Global_DailySet_20261101_Child1", { complete: true }),
      promo("Global_DailySet_20261101_Child2"),
      promo("Global_DailySet_20261101_NoPoints", { pointProgressMax: 0 }),
    ],
    "11/02/2026": [promo("Global_DailySet_20261102_Child1")],
  },
  morePromotions: [
    promo("FRFR_Rewards_Done", { complete: true }),
    promo("EN_Bing_moreactivities_flight_202606"),
    promo("ENUS_quiz_other_market"),
    promo("FRFR_couponcodes_exploreonbing_activation_Evergreen", { attributes: { is_unlocked: "True" } }),
    promo("FRFR_creditcards_exploreonbing_activation_Evergreen", { attributes: { is_unlocked: "False" } }),
  ],
};

beforeAll(() => {
  setSystemTime(new Date("2026-11-01T12:00:00"));
  globalThis.fetch = mock(async () => Response.json({ dashboard })) as unknown as typeof fetch;
  globalThis.chrome = { storage: { session: { set: mock(async () => {}) } } } as unknown as typeof chrome;
});

afterAll(() => {
  setSystemTime();
});

describe("fetchRewards", () => {
  test("keeps today's incomplete daily cards with points", async () => {
    const rewards = await fetchRewards();

    expect(rewards?.cards.dailyCards.map((c) => c.name)).toEqual(["Global_DailySet_20261101_Child2"]);
    expect(rewards?.info.dailyCardsProgress).toEqual({ current: 1, target: 2 });
  });

  test("splits explore cards, drops locked ones and other markets", async () => {
    const rewards = await fetchRewards();

    expect(rewards?.cards.exploreBing.map((c) => c.name)).toEqual([
      "FRFR_couponcodes_exploreonbing_activation_Evergreen",
    ]);
    expect(rewards?.cards.moreActivities.map((c) => c.name)).toEqual([
      "EN_Bing_moreactivities_flight_202606",
    ]);
  });

  test("exposes card URLs, points and the account country", async () => {
    const rewards = await fetchRewards();

    expect(rewards?.cards.dailyCards[0].url).toBe("https://www.bing.com/search?q=Global_DailySet_20261101_Child2");
    expect(rewards?.info.points).toBe(8901);
    expect(rewards?.country).toBe("fr");
  });
});

describe("getRemainingSearches", () => {
  test("converts remaining PC points into searches", () => {
    const info = { pcProgress: { current: 3, target: 60 } } as Parameters<typeof getRemainingSearches>[0];
    expect(getRemainingSearches(info)).toBe(19);
  });

  test("returns 0 once PC searches are done", () => {
    const info = { pcProgress: { current: 60, target: 60 } } as Parameters<typeof getRemainingSearches>[0];
    expect(getRemainingSearches(info)).toBe(0);
  });
});
