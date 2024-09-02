import AutomationApp from "./modules/AutomationApp";

// Initialize automation app
const app = new AutomationApp();

(async () => {
  try {
    await app.initialize();
    await app.runTasks();
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    await app.cleanup();
  }
})();
