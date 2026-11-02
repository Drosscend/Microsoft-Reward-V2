import { describe, expect, test } from "bun:test";
import type { CardTarget } from "../../shared/types";
import { matchTargets } from "./card-processor";
import { getSearchQueryForExplore } from "./explore-bing";

const EXPLORE_URL = "https://www.bing.com/?form=ML2PCR&rwAutoFlyout=exb";

const target = (name: string, title: string, url: string, description = ""): CardTarget => ({
  name,
  title,
  description,
  url,
});

describe("matchTargets", () => {
  test("matches a card by its link href", () => {
    const links = [
      { href: "https://www.bing.com/search?q=a", text: "A" },
      { href: "https://www.bing.com/search?q=b", text: "B" },
    ];
    const targets = [target("Child2", "B", "https://www.bing.com/search?q=b")];

    expect(matchTargets(links, targets)).toEqual([{ linkIndex: 1, target: targets[0] }]);
  });

  test("breaks ties between cards sharing a URL with the title", () => {
    const links = [
      { href: EXPLORE_URL, text: "Économisez plus aujourd'hui​\nRecherchez sur Bing" },
      { href: EXPLORE_URL, text: "Trouvez des offres sur Bing​\nRecherchez sur Bing" },
    ];
    const targets = [target("shopping", "Trouvez des offres sur Bing​", EXPLORE_URL)];

    expect(matchTargets(links, targets)[0].linkIndex).toBe(1);
  });

  test("skips an ambiguous card whose title is not found", () => {
    const links = [
      { href: EXPLORE_URL, text: "Économisez plus" },
      { href: EXPLORE_URL, text: "Trouvez des offres" },
    ];
    const targets = [target("shopping", "Find deals on Bing", EXPLORE_URL)];

    expect(matchTargets(links, targets)).toEqual([]);
  });

  test("never uses the same link twice", () => {
    const links = [{ href: EXPLORE_URL, text: "Card" }];
    const targets = [target("a", "Card", EXPLORE_URL), target("b", "Card", EXPLORE_URL)];

    expect(matchTargets(links, targets).map((m) => m.target.name)).toEqual(["a"]);
  });
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
