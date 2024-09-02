import type { Page } from "puppeteer";
import { consola } from "consola";

export class LoginModule {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async login(): Promise<void> {
    try {
      consola.start("Ouverture de la page de connexion Microsoft...");
      await this.page.goto("https://rewards.bing.com/", {
        waitUntil: "networkidle0",
      });

      consola.info(
        "Veuillez vous connecter à votre compte Microsoft dans le navigateur.",
      );

      const isConnected = await consola.prompt(
        "Avez-vous terminé la connexion ?",
        {
          type: "confirm",
        },
      );

      if (isConnected) {
        consola.success("Connexion confirmée !");
      } else {
        throw new Error("La connexion n'a pas été confirmée.");
      }
    } catch (error) {
      consola.error("Erreur lors de la connexion :", error);
      throw error;
    }
  }
}

export default LoginModule;
