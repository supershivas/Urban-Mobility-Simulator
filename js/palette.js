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
