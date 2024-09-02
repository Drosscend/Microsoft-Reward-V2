import { consola } from "consola";
import type { Page } from "puppeteer";

export class CookieHandlerModule {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async acceptCookies(): Promise<void> {
    try {
      // Gérer les cookies sur la page de connexion
      await this.handleLoginPageCookies();

      // Gérer les cookies sur la page de recherche
      await this.handleSearchPageCookies();
    } catch (error) {
      consola.error("Erreur lors de la gestion des cookies :", error);
    }
  }

  private async handleLoginPageCookies(): Promise<void> {
    const cookieConsentSelector = "#cookieConsentContainer button";
    await this.clickCookieButton(cookieConsentSelector, "Accept");
  }

  private async handleSearchPageCookies(): Promise<void> {
    const cookieBannerSelector = "#bnp_cookie_banner button";
    await this.clickCookieButton(cookieBannerSelector, "Accept");
  }

  private async clickCookieButton(
    selector: string,
    buttonText: string,
  ): Promise<void> {
    try {
      await this.page.waitForSelector(selector, { timeout: 1000 });
      const buttons = await this.page.$$(selector);
      for (const button of buttons) {
        const text = await this.page.evaluate((el) => el.textContent, button);
        if (text && text.trim().toLowerCase() === buttonText.toLowerCase()) {
          await button.click();
          return;
        }
      }
    } catch (error) {
      // do nothing
    }
  }
}
