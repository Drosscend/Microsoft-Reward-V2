import puppeteer from "puppeteer";
import { consola } from "consola";
import cliProgress from "cli-progress";
import { getAnyEdgeStable } from "edge-paths";

// Modules
import { SearchModule } from "./SearchModule";
import { ListRetrievalModule } from "./ListRetrievalModule";
import { LoginModule } from "./LoginModule";

// Types
import type { Browser, Page } from "puppeteer";

class AutomationApp {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private searchModule: SearchModule | null = null;
  private listRetrievalModule: ListRetrievalModule | null = null;
  private loginModule: LoginModule | null = null;

  constructor() {}

  async initialize(): Promise<void> {
    consola.box("Initializing automation app...");
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
    } else {
      throw new Error("Failed to initialize page");
    }
  }

  async runTasks(): Promise<void> {
    if (!this.listRetrievalModule || !this.searchModule || !this.loginModule) {
      throw new Error("Modules not initialized");
    }

    // Exécuter le login avant les recherches
    await this.loginModule.login();

    const searchList = await this.listRetrievalModule.getSearchList();
    const progressBar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic,
    );

    progressBar.start(searchList.length * 2, 0);

    for (const searchTerm of searchList) {
      await this.searchModule.searchBing(searchTerm, "pc");
      progressBar.increment();
    }

    for (const searchTerm of searchList) {
      await this.searchModule.searchBing(searchTerm, "mobile");
      progressBar.increment();
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
