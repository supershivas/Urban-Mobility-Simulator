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
    { avant: 'encre', fond: 'selection', role: 'signe', ou: 'contour du bâtiment choisi (2D et 3D)' },
    // « selection sur bati » ne vaut que 2,71 (mesuré, v0.2.0) : le bâtiment choisi est donc toujours cerné d'encre,
    // et c'est ce contour (encre sur bati 9,46 ; encre sur selection 3,49) qui porte le signe.
    { avant: 'inconnu', fond: 'papier', role: 'signe', ou: 'contour d\'un bâtiment de hauteur non renseignée (3D)' },
    { avant: 'inconnu', fond: 'bati', role: 'signe', ou: 'contour d\'un bâtiment à plat sur son emprise (3D)' },
    { avant: 'encre', fond: 'voirie', role: 'texte', ou: 'légende et barre d\'échelle de la vue 3D' },
  ],
  groupes: {},
  poses: [],
};
