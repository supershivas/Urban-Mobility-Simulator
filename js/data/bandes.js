// Les bandes d'une section transversale (v0.3) : du contenu, pas de la règle (section 12).
// couleur : clé de la palette ; motif : signe de la carte qui double la couleur ;
// largeurDefaut : largeur d'une bande AJOUTÉE par le joueur (un point de départ
// qu'il règle, jamais une mesure) ; sens : la bande porte un sens de circulation.
// Les textes (nom, sigle) sont dans textes.js : « bande.<id> », « bande.<id>.sigle ».
export const BANDES = {
  trottoir: { couleur: 'trottoir', motif: null, largeurDefaut: 2, sens: false, ajoutable: true },
  cyclable: { couleur: 'cyclable', motif: 'velo', largeurDefaut: 1.8, sens: true, ajoutable: true },
  bus: { couleur: 'bus', motif: 'bus', largeurDefaut: 3.2, sens: true, ajoutable: true },
  voiture: { couleur: 'voirie', motif: null, largeurDefaut: 3, sens: true, ajoutable: true },
  stationnement: { couleur: 'stationnement', motif: 'parking', largeurDefaut: 2, sens: false, ajoutable: true },
  plante: { couleur: 'plante', motif: 'plante', largeurDefaut: 2, sens: false, ajoutable: true },
  'terre-plein': { couleur: 'trottoir', motif: 'hachures', largeurDefaut: 1.5, sens: false, ajoutable: true },
  separation: { couleur: 'encre', motif: null, largeurDefaut: 0.5, sens: false, ajoutable: true },
  // La chaussée mesurée dont on ne connaît pas les voies : le joueur la découpe
  chaussee: { couleur: 'voirie', motif: 'inconnu', largeurDefaut: 3, sens: false, ajoutable: false },
};

/** Type de bande de départ pour un type de surface UrbIS (spécification LandCover). */
export const BANDE_DEPUIS_SURFACE = {
  SW: 'trottoir', S: 'chaussee', SC: 'chaussee', A: 'chaussee', AC: 'chaussee', M: 'terre-plein', C: 'bus', K: 'stationnement',
};

/** Sens de circulation d'une bande, par rapport au sens de l'axe UrbIS (du nœud de départ au nœud d'arrivée). */
export const SENS = ['aller', 'retour', 'double'];

/** Règles de largeur (m). Le pas est celui de l'éditeur ; le minimum, une limite de dessin. */
export const LARGEURS = { pas: 0.1, grandPas: 0.5, min: 0.3 };

/**
 * Les outils de la barre (v0.7, Jérôme, v0.5.0 : « outil + clic sur une voie ») : un type de bande, ou une action.
 * Un outil de type change la bande visée en gardant sa largeur. Textes : « outil.<id> ».
 */
export const OUTILS = ['voiture', 'bus', 'cyclable', 'trottoir', 'stationnement', 'plante', 'sens', 'supprimer'];

/**
 * Découpage proposé d'une chaussée non découpée quand on y pose un outil : des voies d'au plus
 * `largeurVoieM` (une convention de dessin, pas une norme), au moins une. Le joueur le corrige ensuite.
 */
export const DECOUPE = { largeurVoieM: 3.5 };
