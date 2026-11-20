// Le contenu du jeu beta « Carte blanche » : dimensions, vitesses, intervalles.
// Aucune règle ici, seulement des nombres (section 12). Ordres de grandeur d'une
// rue urbaine belge : voie de 3 m, piste cyclable de 1,75 m, 50 km/h.
// Ce sont des hypothèses de jeu, pas des mesures : la carte est vierge.

export const ROUTE = {
  largeurVoie: 3.0,        // m, une voie automobile
  largeurPiste: 1.75,      // m, piste cyclable (de chaque côté)
  largeurPisteDouble: 2.5, // m, piste cyclable à double sens
  largeurTrottoir: 2.0,    // m, trottoir de chaque côté de chaque route
  largeurTraversee: 3.0,   // m, passage piéton (le long de la route), devant chaque carrefour
  separateurPiste: 0.5,    // m, filet entre la dernière voie et la piste
  accotement: 0.4,         // m, bordure au-delà de la chaussée
  margeCarrefour: 1.5,     // m, ajoutée à la demi-largeur pour le recul d'une branche
  reculPassage: 1.0,       // m, recul quand deux tronçons se suivent sans carrefour
  voiesMax: 4,             // voies par sens (2 × 2, 3 × 3, 4 × 4)
  largeurMax: 27,          // m, chaussée et pistes bord à bord : au-delà, refusé (une avenue bruxelloise à 2 × 4 voies et pistes en fait ~28)
  pasArc: 4,               // m, finesse des courbes
};

export const TRACE = {
  longueurMin: 30,         // m, une route plus courte ne se construit pas
  rayonMin: 20,            // m, virage plus serré refusé
  ecartNoeud: 25,          // m, un départ ou une arrivée plus près d'un carrefour s'y accroche
  accroche: 9,             // m, l'arrivée s'accroche à une route à moins de cette distance
  ecartRoutes: 9,          // m, deux routes ne passent pas plus près l'une de l'autre
  angleMin: 60,            // °, entre deux branches d'un même carrefour (les guides d'aménagement visent 75 à 105°, jamais sous 60°)
  branchesMax: 4,          // branches au plus par carrefour
  zone: 560,               // m, demi-côté de la carte constructible
  visee: 14,               // m, distance de visée d'une route sous le pointeur
};

export const DEPART = { longueur: 2400 }; // m, la route de départ, d'ouest en est ; ses bouts sont loin dans la brume

export const VEHICULES = {
  voiture: { longueur: 4.4, largeur: 1.8, hauteur: 1.45, vitesse: 13.9, vitesseVirage: 7, acceleration: 1.6, freinage: 2.5, temps: 1.2, ecart: 2.2 },
  velo: { longueur: 1.8, largeur: 0.6, hauteur: 1.6, vitesse: 5, vitesseVirage: 4, acceleration: 1, freinage: 1.5, temps: 1, ecart: 1.2 },
  pieton: { longueur: 0.4, largeur: 0.5, hauteur: 1.7, vitesse: 1.3 },
};

// Feux (Jérôme, v0.9.2) : une phase par branche (tout ce qui en vient passe ensemble, vélos
// compris, sur leurs feux plus petits), puis une phase piétonne où tout le monde traverse.
export const FEUX = {
  vert: 18,                // s de vert par défaut, par phase de branche
  vertPietons: 10,         // s de vert par défaut, phase piétonne
  orange: 3,               // s
  rougeIntegral: 2,        // s de dégagement, tout au rouge, entre deux phases
  pas: 2,                  // s, un clic sur − ou +
  min: 6, max: 60,         // s, bornes d'un vert
};

export const PIETONS = {
  densite: 1 / 30,         // piétons par mètre de trottoir (hypothèse de jeu)
  parcours: [150, 500],    // m marchés avant d'entrer quelque part (tirés au hasard)
  ecartLateral: 0.55,      // ± m, chacun marche un peu à côté du milieu du trottoir
  regardVoiture: 1.6,      // s : un piéton ne s'engage pas devant une voiture à moins de ce temps
  regardMin: 3,            // m, et pas devant un véhicule à moins de cette distance
  fondu: 3,                // m, apparition et disparition
  max: 600,
};

export const TRAFIC = {
  graine: 2026,
  intervalleBord: 5,       // s entre deux voitures, par voie, aux deux bouts de la route de départ
  intervalleImpasse: 14,   // s entre deux voitures au bout d'une route nouvelle (un quartier)
  intervalleVelo: 2.5,     // s entre deux vélos, au bout d'une piste
  alea: 0.35,              // ± part de hasard sur chaque intervalle
  demande: 2.2,            // s d'avance : un véhicule demande le carrefour à cette distance (en temps)
  demandeMin: 6,           // m, et au moins à cette distance
  attenteMax: 4,           // s, au-delà le carrefour se réserve pour celui qui attend
  virageDroit: 0.35,       // rad, un raccord moins tournant passe sans ralentir
  conflit: 2.3,            // m, deux trajectoires plus proches se gênent
  bloqueMax: 45,           // s à l'arrêt : au-delà, le conducteur renonce et disparaît (bouchon en boucle)
  fondu: 6,                // m, apparition et disparition aux bouts
  maxVehicules: 400,
  prechauffage: 100,       // s de trafic simulées avant d'ouvrir : la route est déjà vivante
};

export const CAMERA = {
  fov: 40,
  distance: 210, distanceMin: 25, distanceMax: 1100,
  inclinaison: 0.85, inclinaisonMax: 1.2,
  azimut: 0.35,
  boite: [-600, -600, 600, 600],
  vitesseClavier: 600,     // px équivalents par seconde
};
