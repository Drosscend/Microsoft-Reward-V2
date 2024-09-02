import puppeteer from "puppeteer";
import { consola } from "consola";
import cliProgress from "cli-progress";
import { getAnyEdgeStable } from "edge-paths";
import type { Browser, Page } from "puppeteer";

import { SearchModule } from "./SearchModule";
import { ListRetrievalModule } from "./ListRetrievalModule";
import { LoginModule } from "./LoginModule";
import { CookieHandlerModule } from "./CookieHandlerModule";

class AutomationApp {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private searchModule: SearchModule | null = null;
  private listRetrievalModule: ListRetrievalModule | null = null;
  private loginModule: LoginModule | null = null;
  private cookieHandler: CookieHandlerModule | null = null;

  constructor() {}

  async initialize(): Promise<void> {
    consola.info("Initializing automation app...");
    this.browser = await puppeteer.launch({
      headless: false,
      executablePath: getAnyEdgeStable(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-extensions",
      ],
    });
    this.page = await this.browser.newPage();

    if (this.page) {
      this.searchModule = new SearchModule(this.page);
      this.listRetrievalModule = new ListRetrievalModule();
      this.loginModule = new LoginModule(this.page);
      this.cookieHandler = new CookieHandlerModule(this.page);
    } else {
      throw new Error("Failed to initialize page");
    }
  }

  async runTasks(): Promise<void> {
    if (
      !this.listRetrievalModule ||
      !this.searchModule ||
      !this.loginModule ||
      !this.cookieHandler
    ) {
      throw new Error("Modules not initialized");
    }

    // Exécuter le login avant les recherches
    await this.loginModule.login();

    // Accepter les cookies avant le login
    await this.cookieHandler.acceptCookies();

    const searchTypes = await consola.prompt(
      "Choisissez les types de recherches à effectuer:",
      {
        type: "multiselect",
        required: false,
        options: [
          { value: "pc", label: "Recherches PC" },
          { value: "mobile", label: "Recherches Mobile" },
        ],
      },
    );

    const searchList = await this.listRetrievalModule.getSearchList();
    const progressBar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic,
    );

    let totalSearches = 0;
    if (searchTypes.includes("pc")) totalSearches += searchList.length;
    if (searchTypes.includes("mobile")) totalSearches += searchList.length;

    progressBar.start(totalSearches, 0);

    if (searchTypes.includes("pc")) {
      for (const searchTerm of searchList) {
        await this.searchModule.searchBing(searchTerm, "pc");
        progressBar.increment();
      }
    }

    if (searchTypes.includes("mobile")) {
      for (const searchTerm of searchList) {
        await this.searchModule.searchBing(searchTerm, "mobile");
        progressBar.increment();
      }
    }

    progressBar.stop();
    consola.success("All tasks completed successfully!");
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
    }
    consola.info("Cleanup completed.");
  }
}

export default AutomationApp;
