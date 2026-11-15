// Les carrefours (v0.4) : du contenu, pas de la règle (section 12).
// Les textes sont dans textes.js : « mode.<id> », « regulation.<id> », « traversee.<id> ».

/** Mode de circulation d'une voie, selon le type de sa bande (les autres bandes ne circulent pas). */
export const MODE_DE_BANDE = { voiture: 'voiture', bus: 'bus', cyclable: 'cyclable', chaussee: 'general' };

/**
 * Vers quelles voies une voie entrante peut se raccorder, par ordre de préférence.
 * general : une chaussée dont on ne connaît pas les voies (« voies non renseignées »).
 * Un bus ou un vélo peut rejoindre la circulation générale ; une voiture ne prend
 * ni une voie bus ni une piste cyclable.
 */
export const COMPATIBLES = {
  voiture: ['voiture', 'general'],
  general: ['general', 'voiture'],
  bus: ['bus', 'voiture', 'general'],
  cyclable: ['cyclable', 'voiture', 'general'],
};

/** Régulation d'un carrefour. Au départ : null (« Non renseigné ») — aucune source ne la donne. */
export const REGULATIONS = ['feux', 'priorite-droite', 'panneaux', 'giratoire'];

/** Traversées d'une branche : la bande qu'elles exigent dans la section de la branche, et le refus sinon. */
export const TRAVERSEES = {
  pieton: { exige: 'trottoir', refus: 'sans-trottoir' },
  velo: { exige: 'cyclable', refus: 'sans-piste' },
};

/** Angles (degrés) : en deçà, une branche est « tout droit » pour la voie qui arrive. */
export const ANGLES = { toutDroitDegres: 40 };

/**
 * Dessin du carrefour (mètres) : des conventions de dessin, pas des normes ni des mesures.
 * recul : distance au nœud où les voies s'arrêtent et où partent les raccords ;
 *   demi-emprise la plus large des branches + marge, au moins reculMinM, au plus reculPart de la longueur d'une branche.
 * largeurPietonM, largeurVeloM : profondeur dessinée des traversées ; zebreM : largeur d'une bande du passage piéton (3D).
 */
export const DESSIN_CARREFOUR = { reculMinM: 4, reculMargeM: 1, reculPart: 0.45, largeurPietonM: 3, largeurVeloM: 2, zebreM: 0.5, pointsCourbe: 12 };
