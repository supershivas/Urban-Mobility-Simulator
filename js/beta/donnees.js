// Le contenu du jeu beta « Carte blanche » : dimensions, vitesses, intervalles.
// Aucune règle ici, seulement des nombres (section 12). Ordres de grandeur d'une
// rue urbaine belge : voie de 3 m, piste cyclable de 1,75 m, 50 km/h.
// Ce sont des hypothèses de jeu, pas des mesures : la carte est vierge.

export const ROUTE = {
  largeurVoie: 3.0,        // m, une voie automobile
  largeurPiste: 1.75,      // m, piste cyclable (de chaque côté)
  separateurPiste: 0.5,    // m, filet entre la dernière voie et la piste
  accotement: 0.4,         // m, bordure au-delà de la chaussée
  margeCarrefour: 1.5,     // m, ajoutée à la demi-largeur pour le recul d'une branche
  reculPassage: 1.0,       // m, recul quand deux tronçons se suivent sans carrefour
  voiesMax: 2,             // voies par sens
  pasArc: 4,               // m, finesse des courbes
};

export const TRACE = {
  longueurMin: 30,         // m, une route plus courte ne se construit pas
  rayonMin: 20,            // m, virage plus serré refusé
  ecartNoeud: 25,          // m, un départ ou une arrivée plus près d'un carrefour s'y accroche
  accroche: 9,             // m, l'arrivée s'accroche à une route à moins de cette distance
  ecartRoutes: 9,          // m, deux routes ne passent pas plus près l'une de l'autre
  angleMin: 30,            // °, entre deux branches d'un même carrefour
  branchesMax: 4,          // branches au plus par carrefour
  zone: 560,               // m, demi-côté de la carte constructible
  visee: 14,               // m, distance de visée d'une route sous le pointeur
};

export const DEPART = { longueur: 2400 }; // m, la route de départ, d'ouest en est ; ses bouts sont loin dans la brume

export const VEHICULES = {
  voiture: { longueur: 4.4, largeur: 1.8, hauteur: 1.45, vitesse: 13.9, vitesseVirage: 7, acceleration: 1.6, freinage: 2.5, temps: 1.2, ecart: 2.2 },
  velo: { longueur: 1.8, largeur: 0.6, hauteur: 1.6, vitesse: 5, vitesseVirage: 4, acceleration: 1, freinage: 1.5, temps: 1, ecart: 1.2 },
};

export const TRAFIC = {
  graine: 2026,
  intervalleBord: 5,       // s entre deux voitures, par voie, aux deux bouts de la route de départ
  intervalleImpasse: 14,   // s entre deux voitures au bout d'une route nouvelle (un quartier)
  intervalleVelo: 7,       // s entre deux vélos, au bout d'une piste
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
