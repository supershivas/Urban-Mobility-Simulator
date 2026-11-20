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
  largeurTraverseeVelo: 2.0, largeurTraverseeVeloDouble: 3.0, // m, traversée cyclable d'un carrefour protégé
  ecartTraversees: 0.6,    // m, entre la traversée cyclable et le passage piéton
  fusionTraversees: 8,     // m, deux passages plus proches n'en font qu'un
  longueurPreselection: 40, // m, voie de tourne-à-gauche avant un carrefour
  longueurInsertion: 50,   // m, voie d'insertion après un carrefour, avant de se rabattre
  largeurRefuge: 2.0,      // m, îlot refuge (et zone peinte entre les deux sens)
  largeurTerrePlein: 3.0,  // m, terre-plein central planté
  sas: 4,                  // m, sas vélo aux feux (zone avancée devant les voitures)
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

// Ronds-points (Jérôme, v0.9.5) : rayon extérieur de l'anneau, largeur de chaussée, voies.
// Ordres de grandeur des guides (CEREMA, SPW) : mini-giratoire 7 à 12 m (îlot franchissable),
// urbain 12 à 20 m, grand à deux voies 20 à 30 m.
export const GIRATOIRES = {
  mini: { rayon: 11, largeur: 6, voies: 1, plante: false },
  urbain: { rayon: 16, largeur: 6.5, voies: 1, plante: true },
  grand: { rayon: 24, largeur: 9, voies: 2, plante: true },
  entree: 1.5,             // m entre le bord de l'anneau et le passage piéton (sans pistes)
  bordurePiste: 1,         // m de bordure entre l'anneau et la piste qui en fait le tour
  bretelle: 6,             // m de plus entre l'anneau et la piste pour une bretelle (voie de 3,5 m et îlot)
  voieSup: 4,              // m de plus par voie d'anneau au-delà de celles de sa taille
  evasement: 5,            // m dont l'entrée et la sortie s'élargissent au plus en touchant l'anneau (sans en sortir)
};

export const DEPART = { longueur: 2400 }; // m, la route de départ, d'ouest en est ; ses bouts sont loin dans la brume

export const VEHICULES = {
  voiture: { longueur: 4.4, largeur: 1.8, hauteur: 1.45, vitesse: 13.9, vitesseVirage: 7, acceleration: 1.6, freinage: 2.5, temps: 1.2, ecart: 2.2 },
  velo: { longueur: 1.8, largeur: 0.6, hauteur: 1.6, vitesse: 5, vitesseVirage: 4, acceleration: 1, freinage: 1.5, temps: 1, ecart: 1.2 },
  bus: { longueur: 12, largeur: 2.55, hauteur: 3.1, vitesse: 12.5, vitesseVirage: 5, acceleration: 1.0, freinage: 2.0, temps: 1.5, ecart: 2.5 },
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
  intervalleBus: 24,       // s entre deux bus, à chaque bout de la carte
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
