// Les missions (v0.8, Jérôme, v0.6.0 : « missions sur des lieux réels », jugées sur le trafic simulé tenu).
// Du contenu : un lieu réel, un objectif mesuré sur le trafic, une durée à tenir, et pour la première des
// étapes guidées. Les textes sont dans textes.js : « mission.<id>.titre », « .intro », « .etape.<n> ».
// Chaque mission est faisable et n'est pas réussie au départ : test/missions.test.mjs le prouve en simulant.
//
// Types d'objectif :
//   velos-piste : au moins `min` vélos entrés sur une piste du tronçon depuis le début de la mission ;
//   sans-issue  : aucun bloc perdu « sans issue » au carrefour, tenu `tenirS` secondes simulées ;
//   file        : la file moyenne (blocs arrêtés aux approches, moyenne glissante sur `moyenneS`) ≤ `max`, tenue.
// depart : ce que la mission pose dans le scénario en commençant (la situation à corriger), annulable (Ctrl+Z).
export const MISSIONS = [
  {
    id: 'piste-loi', guidee: true,
    lieu: { troncon: 'seg-u73149', zoom: 18.4 },
    objectif: { type: 'velos-piste', troncon: 'seg-u73149', min: 3 }, // calé sur la simulation : le 3e vélo vers 260 s, ~30 s réelles à ×8
    // Étapes guidées : chacune s'achève quand sa condition est vraie (ou sur « Compris »)
    etapes: [{ id: 'regarder', fin: 'compris' }, { id: 'outil', fin: 'outil-cyclable' }, { id: 'poser', fin: 'piste-posee' }, { id: 'attendre', fin: 'objectif', vitesse: 8 }],
    outils: ['cyclable'],
  },
  {
    id: 'cortenbergh',
    lieu: { noeud: 'node-u2619', troncon: 'seg-u72310', zoom: 18 },
    objectif: { type: 'sans-issue', noeud: 'node-u2619', tenirS: 300 },
    outils: ['sens', 'voiture'],
  },
  {
    id: 'feux-treves',
    lieu: { noeud: 'node-u1899', zoom: 18.6 },
    depart: { carrefours: { 'node-u1899': { ajoutes: [], retires: [], traversees: {}, regulation: 'feux', feux: { modele: 'axes', verts: [8, 70] } } } },
    // Calé sur la simulation : 8 / 70 s → file ≈ 11 ; 38 / 38 → 6 ; 50 / 26 → 2,8 : il faut trouver l'axe chargé
    objectif: { type: 'file', noeud: 'node-u1899', max: 4, moyenneS: 90, tenirS: 300 },
    outils: [],
  },
];

/** Échantillonnage de l'évaluation : une fois par seconde simulée. */
export const EVALUATION = { pasS: 1 };
