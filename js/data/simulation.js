// La simulation simplifiée (v0.5) : les valeurs de référence, du contenu (section 12).
// Chaque valeur porte sa source (texte « ref.<source> » dans textes.js) et sa
// confiance. Aucune ne vient du terrain bruxellois : confiance « faible » partout
// (Jérôme, v0.5.0 : « littérature citée »). L'atelier peut les régler.
//
// Heure de référence : la pointe du matin, 8 h – 9 h (celle des comptages vélo).

export const REFERENCES = {
  // Débit de saturation de base d'une voie automobile (uvp/h/voie) : HCM 2010, chap. 18
  saturationVoie: { valeur: 1900, source: 'hcm-saturation', confiance: 'faible' },
  // Débit de saturation d'une bande cyclable (vélos/h/voie) : HCM 2000, chap. 19
  saturationPiste: { valeur: 2000, source: 'hcm-velo', confiance: 'faible' },
  // Débit piéton maximal par mètre de trottoir (piétons/h/m) : HCM 2010, chap. 23,
  // seuil du niveau de service E (23 p/min/ft ≈ 75 p/min/m = 4 500 p/h/m)
  pietonParMetre: { valeur: 4500, source: 'hcm-pieton', confiance: 'faible' },
  // Vitesse de marche (m/s) : HCM 2010 et MUTCD 2009, 3,5 ft/s (valeur de calcul des traversées)
  marche: { valeur: 1.07, source: 'hcm-marche', confiance: 'faible' },
  // Temps de parcours chargé : t = t0 × (1 + alpha × (v/c)^beta), Bureau of Public Roads (1964)
  bpr: { alpha: 0.15, beta: 4, source: 'bpr', confiance: 'faible' },
  // Carrefour à feux : délai uniforme de Webster (1958). Cycle, phases et temps perdu ne sont
  // dans aucune source : hypothèses de calcul, affichées comme telles.
  feux: { cycleS: 90, phases: 2, perteParPhaseS: 4, source: 'feux-hypothese', confiance: 'faible' },
};

/** Les modes de la demande, dans l'ordre d'affichage. */
export const MODES_DEMANDE = ['voiture', 'bus', 'cyclable', 'pieton'];

/** Le mode des bandes de circulation (les autres ne portent pas de demande). */
export const BANDE_DE_MODE = { voiture: ['voiture'], bus: ['bus'], cyclable: ['cyclable'], pieton: ['trottoir'] };

/** Les modes qui ont un sens (le piéton se compte dans les deux sens ensemble). */
export const MODES_A_SENS = ['voiture', 'bus', 'cyclable'];

/** Seuils de la saturation (demande / capacité), pour la couleur de la carte et l'inspecteur. */
export const SEUILS = { proche: 0.8, sature: 1 };

/** Hypothèses du scénario, posées par le joueur ; null au départ (aucune source citée). */
export const HYPOTHESES = { occupationVoiture: null, occupationBus: null };

/** Bornes de saisie (refus au-delà), pas des normes. */
export const SAISIE = { debitMax: 20000, occupationMin: 1, occupationVoitureMax: 9, occupationBusMax: 200 };
