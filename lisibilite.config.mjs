// Configuration de node outils/lisibilite.mjs (voir l'en-tête de l'outil).
// Une paire de couleurs s'ajoute le jour où on la dessine. Les aplats (bâti,
// trottoir, chaussée) ne sont pas des signes : ils se distinguent par leurs
// contours (couleur bord) dès le zoom 15–16.
import { PALETTE } from './js/palette.js';

export default {
  palette: PALETTE,
  paires: [
    { avant: 'encre', fond: 'papier', role: 'texte', ou: 'panneaux, menus' },
    { avant: 'encre', fond: 'voirie', role: 'texte', ou: 'en-tête et barre d\'état' },
    { avant: 'papier', fond: 'encre', role: 'texte', ou: 'boutons' },
    { avant: 'voirie', fond: 'encre', role: 'texte', ou: 'étiquettes des stations' },
    { avant: 'inconnu', fond: 'papier', role: 'texte', ou: '« Non renseigné » dans l\'inspecteur' },
    { avant: 'noeud', fond: 'papier', role: 'texte', ou: 'liens' },
    { avant: 'noeud', fond: 'voirie', role: 'texte', ou: 'lien de la barre d\'état' },
    { avant: 'selection', fond: 'voirie', role: 'signe', ou: 'tronçon choisi sur la chaussée' },
    { avant: 'selection', fond: 'trottoir', role: 'signe', ou: 'tronçon choisi près d\'un trottoir' },
    { avant: 'selection', fond: 'papier', role: 'signe', ou: 'tronçon choisi, surfaces masquées' },
    { avant: 'encre', fond: 'voirie', role: 'signe', ou: 'axe principal sur la chaussée' },
    { avant: 'bord', fond: 'voirie', role: 'signe', ou: 'axe secondaire sur la chaussée' },
    { avant: 'noeud', fond: 'voirie', role: 'signe', ou: 'nœud, rail de tram sur la chaussée' },
    { avant: 'encre', fond: 'bati', role: 'signe', ou: 'emprise du corridor sur le bâti' },
  ],
  groupes: {},
  poses: [],
};
