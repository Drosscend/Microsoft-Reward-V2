import { describe, expect, test } from "bun:test";
import type { CardTarget } from "../../shared/types";
import { getSearchQueryForExplore } from "./explore-bing";

const EXPLORE_URL = "https://www.bing.com/?form=ML2PCR&rwAutoFlyout=exb";

const target = (name: string, title: string, url: string, description = ""): CardTarget => ({
  name,
  title,
  description,
  url,
});

describe("getSearchQueryForExplore", () => {
  test.each([
    ["Recherchez sur Bing les derniers codes promo et réductions", "les derniers codes promo et réductions"],
    ["Search on Bing for the latest coupon codes and discounts", "for the latest coupon codes and discounts"],
    ["Recherchez sur Bing pour trouver des articles sur votre liste de courses", "pour trouver des articles sur votre liste de courses"],
    ["Compare insurance plans for your needs", "Compare insurance plans for your needs"],
  ])("%s → %s", (description, query) => {
    expect(getSearchQueryForExplore(target("FRFR_x_exploreonbing_y", "Title", EXPLORE_URL, description))).toBe(query);
  });

  test("falls back to the topic in the promotion name", () => {
    const card = target("FRFR_credit_cards_exploreonbing_activation_Evergreen", "Swipe smart", EXPLORE_URL);
    expect(getSearchQueryForExplore(card)).toBe("credit cards");
  });
});
