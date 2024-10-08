import { consola } from "consola";
import type { Page } from "puppeteer";
import { CookieHandlerModule } from "./CookieHandlerModule";

export class SearchModule {
  private page: Page;
  private cookieHandler: CookieHandlerModule;

  constructor(page: Page) {
    this.page = page;
    this.cookieHandler = new CookieHandlerModule(page);
  }

  async searchBing(searchTerm: string, device: "pc" | "mobile"): Promise<void> {
    const userAgent =
      device === "pc"
        ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0"
        : "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1";

    await this.page.setUserAgent(userAgent);

    try {
      await this.page.goto(
        `https://www.bing.com/search?q=${encodeURIComponent(searchTerm)}`,
        {
          waitUntil: "networkidle0",
        },
      );

      // Accepter les cookies si nécessaire
      await this.cookieHandler.acceptCookies();

      // Attendre que les résultats de recherche soient chargés
      await this.page.waitForSelector(".b_algo", { timeout: 2500 });
    } catch (error) {
      consola.error(
        `Erreur lors de la recherche ${device} pour "${searchTerm}":`,
        error,
      );
    }
  }
}

export default SearchModule;
