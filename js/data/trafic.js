// Le trafic en temps réel (v0.6) : du contenu, pas de la règle (section 12).
//
// DEBITS_JEU : la demande qui ENTRE dans le corridor par chaque rue coupée par son bord,
// en véhicules par heure et par sens, selon la hiérarchie UrbIS de la rue. Ce sont des
// valeurs de JEU, pas des mesures : « hypothèse de jeu », réglables dans l'atelier
// (assouplissement du pilier 6 décidé par Jérôme, v0.5.0). Une demande posée par le
// joueur sur la rue d'entrée (touche F) les remplace ; aucun comptage n'est à un bord.
export const DEBITS_JEU = {
  H: { voiture: 1200, bus: 0, velo: 0 },
  MER: { voiture: 700, bus: 10, velo: 120 },
  MAR: { voiture: 450, bus: 8, velo: 90 },
  IDR: { voiture: 250, bus: 4, velo: 60 },
  DC: { voiture: 100, bus: 0, velo: 30 },
  DR: { voiture: 40, bus: 0, velo: 15 },
  UN: { voiture: 20, bus: 0, velo: 5 },
};

/** Les voies qu'un mode peut emprunter (mode de la voie : js/data/carrefours.js MODE_DE_BANDE). */
export const VOIES_DU_MODE = {
  voiture: ['voiture', 'general'],
  bus: ['bus', 'voiture', 'general'],
  velo: ['cyclable', 'general', 'voiture'],
};

/** Le mode de la demande (js/simulation.js) qui correspond à un mode de véhicule. */
export const DEMANDE_DU_MODE = { voiture: 'voiture', bus: 'bus', velo: 'cyclable' };

/**
 * Les véhicules : gabarit du bloc dessiné (m) et paramètres du modèle de poursuite IDM
 * (Treiber, Hennecke et Helbing, 2000 : valeurs types de l'article, pas des mesures
 * bruxelloises). a : accélération, b : freinage confortable, s0 : distance à l'arrêt,
 * T : temps de suivi ; vitesseKmh : null = la vitesse de la voie.
 */
export const VEHICULES = {
  voiture: { longueur: 4.5, largeur: 1.8, hauteur: 1.5, a: 1.5, b: 2, s0: 2, T: 1.2, vitesseKmh: null },
  bus: { longueur: 12, largeur: 2.5, hauteur: 3, a: 1, b: 1.5, s0: 2.5, T: 1.5, vitesseKmh: null },
  velo: { longueur: 1.8, largeur: 0.6, hauteur: 1.2, a: 1, b: 1.5, s0: 1, T: 1, vitesseKmh: 'comptages' },
};

/**
 * Vitesses (km/h). defaut : la limite par défaut de la Région (« Ville 30 », depuis le
 * 1er janvier 2021) quand OSM ne donne pas la limite du tronçon ; raccord : dans un
 * carrefour, jamais plus vite que cela (valeur de jeu) ; veloDefaut : sans comptage.
 */
export const VITESSES = { defautKmh: 30, raccordKmh: 25, veloDefautKmh: 18 };

/**
 * La simulation : pas fixe (s), heure de départ (h), fenêtre de mesure des débits (s,
 * temps simulé), plafond de véhicules, freinage maximal (m/s², au-delà on passe au
 * feu orange plutôt que de piler), vitesses de jeu proposées au joueur.
 */
export const SIMULATION = { pasS: 0.05, heureDepart: 8, fenetreS: 600, maxVehicules: 2500, freinageMax: 4.5, vitesses: [1, 2, 4, 8], graine: 1 };
