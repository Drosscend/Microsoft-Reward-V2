# Microsoft Rewards Bot

An Edge browser extension that automatically performs Bing searches to earn Microsoft Rewards points. Just log in to your Microsoft account, click Start, and let the bot do the rest.

---

## Features

- **Automated Bing searches** — earns PC search points hands-free
- **Daily cards & activities** — completes daily promotions and "More Activities" tasks
- **Explore Bing** — handles the Explore Bing bonus searches
- **Human-like behavior** — simulates scrolling, mouse movements, and random clicks to look natural
- **Trending search terms** — uses Google Trends and a built-in fallback list for realistic queries
- **Live progress** — shows your current points and completion progress in a clean popup
- **Activity log** — real-time log of what the bot is doing

## Requirements

- **Microsoft Edge** (Chromium-based)
- **A Microsoft account** logged in to [Bing](https://www.bing.com) and [Microsoft Rewards](https://rewards.bing.com)
- **Bun** (only if you want to build from source)

## Installation

### From a release (recommended)

1. Go to the [Releases](https://github.com/Drosscend/Microsoft-Reward-V2/releases) page
2. Download the latest `microsoft-rewards-bot.zip`
3. Extract the zip to a folder on your computer
4. Open Edge and navigate to `edge://extensions`
5. Enable **Developer mode** (toggle in the bottom-left)
6. Click **Load unpacked** and select the extracted folder

### From source

```bash
git clone https://github.com/Drosscend/Microsoft-Reward-V2.git
cd Microsoft-Reward-V2
bun install
bun run build
```

Then load the `extension/` folder as an unpacked extension (same steps 4-6 above).

## Usage

1. Make sure you are **logged in** to your Microsoft account on [bing.com](https://www.bing.com)
2. Click the extension icon in the Edge toolbar
3. Check the tasks you want to run (PC searches, Daily Cards, More Activities, Explore Bing)
4. Click **Start**
5. The bot opens a tab and performs searches automatically — you can watch or keep browsing
6. Track progress in the popup: points earned, searches completed, and activity log
7. Click **Stop** at any time to interrupt

> **Note:** Do not close the tab the bot is using while it is running. The extension needs it to perform searches.

## Disclaimer

This extension is provided for educational and personal use only. Using automation tools may violate Microsoft's Terms of Service. Use at your own risk.

---

# Microsoft Rewards Bot (FR)

Une extension Edge qui effectue automatiquement des recherches Bing pour gagner des points Microsoft Rewards. Connectez-vous à votre compte Microsoft, cliquez sur Start, et laissez le bot faire le reste.

---

## Fonctionnalités

- **Recherches Bing automatiques** — accumule les points de recherche PC sans effort
- **Cartes du jour & activités** — complète les promotions quotidiennes et les tâches "More Activities"
- **Explore Bing** — gère les recherches bonus Explore Bing
- **Comportement humain** — simule le défilement, les mouvements de souris et des clics aléatoires pour paraître naturel
- **Termes de recherche tendance** — utilise Google Trends et une liste de secours intégrée pour des requêtes réalistes
- **Progression en direct** — affiche vos points et votre avancement dans un popup clair
- **Journal d'activité** — suivi en temps réel de ce que fait le bot

## Prérequis

- **Microsoft Edge** (basé sur Chromium)
- **Un compte Microsoft** connecté sur [Bing](https://www.bing.com) et [Microsoft Rewards](https://rewards.bing.com)
- **Bun** (uniquement pour compiler depuis les sources)

## Installation

### Depuis une release (recommandé)

1. Allez sur la page [Releases](https://github.com/Drosscend/Microsoft-Reward-V2/releases)
2. Téléchargez le dernier `microsoft-rewards-bot.zip`
3. Extrayez le zip dans un dossier sur votre ordinateur
4. Ouvrez Edge et allez sur `edge://extensions`
5. Activez le **mode développeur** (en bas à gauche)
6. Cliquez sur **Charger non compressé** et sélectionnez le dossier extrait

### Depuis les sources

```bash
git clone https://github.com/Drosscend/Microsoft-Reward-V2.git
cd Microsoft-Reward-V2
bun install
bun run build
```

Puis chargez le dossier `extension/` comme extension non compressée (mêmes étapes 4-6 ci-dessus).

## Utilisation

1. Assurez-vous d'être **connecté** à votre compte Microsoft sur [bing.com](https://www.bing.com)
2. Cliquez sur l'icône de l'extension dans la barre d'outils Edge
3. Cochez les tâches à exécuter (PC searches, Daily Cards, More Activities, Explore Bing)
4. Cliquez sur **Start**
5. Le bot ouvre un onglet et effectue les recherches automatiquement — vous pouvez regarder ou continuer à naviguer
6. Suivez la progression dans le popup : points gagnés, recherches effectuées et journal d'activité
7. Cliquez sur **Stop** à tout moment pour interrompre

> **Note :** Ne fermez pas l'onglet utilisé par le bot pendant qu'il tourne. L'extension en a besoin pour effectuer les recherches.

## Avertissement

Cette extension est fournie à des fins éducatives et personnelles uniquement. L'utilisation d'outils d'automatisation peut enfreindre les conditions d'utilisation de Microsoft. Utilisation à vos risques et périls.
