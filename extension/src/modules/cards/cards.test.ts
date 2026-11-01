import { describe, expect, test } from "bun:test";
import { matchTargets } from "./card-processor";
import { getSearchQueryForExplore } from "./explore-bing";

const EXPLORE_URL = "https://www.bing.com/?form=ML2PCR&rwAutoFlyout=exb";

describe("matchTargets", () => {
  test("matches a card by its link href", () => {
    const links = [
      { href: "https://www.bing.com/search?q=a", text: "A" },
      { href: "https://www.bing.com/search?q=b", text: "B" },
    ];
    const targets = [{ name: "Child2", title: "B", url: "https://www.bing.com/search?q=b" }];

    expect(matchTargets(links, targets)).toEqual([{ linkIndex: 1, target: targets[0] }]);
  });

  test("breaks ties between cards sharing a URL with the title", () => {
    const links = [
      { href: EXPLORE_URL, text: "Save more today​\nSearch for coupon codes" },
      { href: EXPLORE_URL, text: "Find deals on Bing​\nSearch your list" },
    ];
    const targets = [{ name: "shopping", title: "Find deals on Bing​", url: EXPLORE_URL }];

    expect(matchTargets(links, targets)[0].linkIndex).toBe(1);
  });

  test("skips an ambiguous card whose title is not found", () => {
    const links = [
      { href: EXPLORE_URL, text: "Économisez plus" },
      { href: EXPLORE_URL, text: "Trouvez des offres" },
    ];
    const targets = [{ name: "shopping", title: "Find deals on Bing", url: EXPLORE_URL }];

    expect(matchTargets(links, targets)).toEqual([]);
  });

  test("never uses the same link twice", () => {
    const links = [{ href: EXPLORE_URL, text: "Card" }];
    const targets = [
      { name: "a", title: "Card", url: EXPLORE_URL },
      { name: "b", title: "Card", url: EXPLORE_URL },
    ];

    expect(matchTargets(links, targets).map((m) => m.target.name)).toEqual(["a"]);
  });
});

describe("getSearchQueryForExplore", () => {
  test.each([
    ["FRFR_couponcodes_exploreonbing_activation_Evergreen", "coupon codes and discounts"],
    ["NonEN_moreactivities_task14_financemarket_exploreonbing_x", "stock market prices today"],
    ["ENUS_moreactivities_task35_CellPhone_Plans_exploreonbing_x", "best cell phone plans"],
    ["FRFR_garden_tools_exploreonbing_activation", "garden tools"],
    ["unrelated_promo", "trending topics today"],
  ])("%s → %s", (name, query) => {
    expect(getSearchQueryForExplore(name)).toBe(query);
  });
});
