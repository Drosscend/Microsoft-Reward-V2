export class ListRetrievalModule {
  private staticSearchList: string[] = [
    "Actualités France",
    "Recettes de cuisine",
    "Météo",
    "Football",
    "Cinéma",
    "Santé",
    "Voyages",
    "Musique",
    "Technologies",
    "Mode",
    "Emploi",
    "Éducation",
    "Économie",
    "Politique",
    "Environnement",
    "Jeux vidéo",
    "Livres",
    "Sport",
    "Séries TV",
    "Art",
    "Science",
    "Histoire",
    "Animaux",
    "Automobile",
    "Bricolage",
    "Jardinage",
    "Beauté",
    "Bien-être",
    "Gastronomie",
    "Décoration",
    "Informatique",
    "Photographie",
    "Danse",
    "Théâtre",
    "Musées",
    "Astronomie",
    "Psychologie",
    "Philosophie",
    "Langues étrangères",
    "Yoga",
    "Méditation",
    "Écologie",
    "Recycling",
    "Énergies renouvelables",
    "Littérature",
    "Poésie",
    "Architecture",
    "Design",
    "Innovation",
    "Startups",
  ];

  constructor() {}

  async getSearchList(): Promise<string[]> {
    try {
      // Retourner les 50 éléments du tableau statique
      return this.staticSearchList.slice(0, 50);
    } catch (error) {
      console.error(
        "Erreur lors de la récupération de la liste de recherche:",
        error,
      );
      return []; // Retourner un tableau vide en cas d'erreur
    }
  }
}
