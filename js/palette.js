// La palette du jeu : le SEUL endroit où vivent ses couleurs (section 5 des
// conventions). Ambiance « Plan d'urbaniste » (Jérôme, v0.1.0) : un plan papier
// lisible des heures, où la sélection ressort sans fausse alarme.
// Déclarée aussi dans la section Description du CLAUDE.md.
export const PALETTE = {
  papier: '#F2EFE8',   // fond de carte et de l'interface
  bati: '#D3CBBE',     // emprises des bâtiments
  voirie: '#FFFFFF',   // chaussées et axes de rue
  trottoir: '#E6E0D5', // trottoirs, terre-pleins, places
  bord: '#9A9284',     // contours, axes secondaires, filets d'interface
  encre: '#22262B',    // texte, axes principaux, emprise
  noeud: '#2E5A88',    // nœuds du réseau, rails, liens
  selection: '#D9442B', // le tronçon choisi et ses nœuds
  inconnu: '#696969',  // « Non renseigné » ; #8C8C8C proposé, assombri : 3,0 → 4,7 de contraste sur papier
  // Bandes de la section transversale (v0.3, [À VALIDER]) : teintes douces de plan, chacune
  // doublée d'un motif (carte) et d'un sigle (éditeur) — jamais la couleur seule.
  cyclable: '#5E9E95',  // piste cyclable : vert d'eau
  bus: '#D9A441',       // bus / tram : ocre
  stationnement: '#A9B4C2', // stationnement : gris-bleu
  plante: '#A3BC86',    // espace planté : vert sauge
};

// Les rôles, lus par le CSS (variables --jeu-*) et par le style de la carte
export const ROLES = {
  fond: PALETTE.papier,
  surface: PALETTE.voirie,
  ombre: PALETTE.bord,
  encre: PALETTE.encre,
  accent: PALETTE.selection,
  lien: PALETTE.noeud,
  inconnu: PALETTE.inconnu,
  bati: PALETTE.bati,
};

// Le jeu beta « Carte blanche » (Jérôme, v0.9.0) : minimalisme à la Traffic City.
// Sol clair, chaussée grise, marquages blancs, pistes vertes, voitures en couleurs franches.
export const PALETTE_BETA = {
  sol: '#E9E5DC',
  limite: '#CFC8BA',     // bord de la carte constructible
  asphalte: '#5A5E66',
  bordure: '#C4BDAF',    // bordure de trottoir autour de la chaussée
  trottoir: '#F4F1EA',   // trottoirs (v0.9.2), plus clairs que le sol
  voieBus: '#8C5A4A',    // voie bus (v0.9.4) : brun rouge, comme les voies bus bruxelloises
  bus: '#D9A441',        // les bus (même ocre que la bande bus du jeu principal)
  marquage: '#F7F6F1',
  velo: '#3E9E5A',       // piste cyclable (et son picto blanc)
  cycliste: '#1F5C36',
  apercu: '#2F7FD8',     // la route en projet
  refus: '#D9442B',      // la route impossible (même rouge que la sélection)
  surlignage: '#F2B33D', // le tronçon sous l'outil
  vitre: '#2B2F36',
  feuRouge: '#E5322D', feuOrange: '#F5A623', feuVert: '#2FB05A', feuEteint: '#4A4F57', // feux (v0.9.2)
  pietons: ['#3A3F47', '#8E5BA8', '#2E86AB', '#C8553D', '#6B7A8F', '#D4A24C'],
  voitures: ['#E4572E', '#2E86AB', '#F3A712', '#F7F6F1', '#3A3F47', '#8E5BA8', '#C8553D', '#4F6D7A'],
};
