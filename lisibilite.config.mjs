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
    // v0.3 : sigles et largeurs écrits sur les bandes de l'éditeur (fond uni sous le texte)
    { avant: 'encre', fond: 'cyclable', role: 'texte', ou: 'sigle d\'une piste cyclable (éditeur)' },
    { avant: 'encre', fond: 'bus', role: 'texte', ou: 'sigle d\'une voie bus (éditeur)' },
    { avant: 'encre', fond: 'stationnement', role: 'texte', ou: 'sigle du stationnement (éditeur)' },
    { avant: 'encre', fond: 'plante', role: 'texte', ou: 'sigle d\'un espace planté (éditeur)' },
    { avant: 'encre', fond: 'trottoir', role: 'texte', ou: 'sigle d\'un trottoir, d\'un terre-plein (éditeur)' },
    { avant: 'voirie', fond: 'encre', role: 'texte', ou: 'sigle d\'une séparation (éditeur)' },
    // Bords des bandes sur la carte et en 3D (encre), bande choisie (sélection)
    { avant: 'encre', fond: 'cyclable', role: 'signe', ou: 'bord, flèche de sens sur une piste' },
    { avant: 'encre', fond: 'bus', role: 'signe', ou: 'bord, flèche de sens sur une voie bus' },
    // « selection sur bus » 1,94 et « selection sur cyclable » 1,41 (mesuré, v0.3.0) : la bande choisie
    // est donc cernée d'encre (carte, 3D, éditeur), et le trait de sélection est posé sur l'encre.
    { avant: 'selection', fond: 'encre', role: 'signe', ou: 'bande choisie : trait de sélection sur son cerne d\'encre' },
    // v0.4 : carrefours — raccords (noeud) sur la zone (voirie) et sur les bandes, traversées, voies de l'éditeur
    { avant: 'noeud', fond: 'voirie', role: 'signe', ou: 'raccord sur la zone de carrefour' },
    { avant: 'noeud', fond: 'trottoir', role: 'signe', ou: 'raccord passant sur un trottoir' },
    { avant: 'voirie', fond: 'encre', role: 'signe', ou: 'bandes d\'un passage piéton' },
    { avant: 'voirie', fond: 'cyclable', role: 'signe', ou: 'damier d\'une traversée cyclable' },
    { avant: 'inconnu', fond: 'voirie', role: 'texte', ou: 'voie sortante non raccordée (éditeur de carrefour)' },
    // v0.5 : couche Flux — trait sur la chaussée (voirie) et sur le papier (zoom faible) ; l'épaisseur double la teinte
    { avant: 'noeud', fond: 'papier', role: 'signe', ou: 'flux fluide sur le papier' },
    // « bus sur voirie » 2,25 et « bus sur papier » 1,96 (mesuré, v0.5.0) : le trait « proche » est cerné d'encre
    { avant: 'bus', fond: 'encre', role: 'signe', ou: 'flux proche de la saturation, sur son cerne d\'encre' },
    { avant: 'encre', fond: 'voirie', role: 'signe', ou: 'cerne du flux proche, flux saturé sur la chaussée' },
    { avant: 'encre', fond: 'papier', role: 'signe', ou: 'flux saturé sur le papier' },
    { avant: 'inconnu', fond: 'papier', role: 'signe', ou: 'flux de capacité inconnue (tirets)' },
    // v0.6 : blocs du trafic — voitures `noeud` cernées de blanc (2D), bus et vélos cernés d'encre
    { avant: 'noeud', fond: 'voirie', role: 'signe', ou: 'voiture sur la chaussée' },
    { avant: 'voirie', fond: 'encre', role: 'signe', ou: 'cerne blanc d\'une voiture sur un axe principal' },
    { avant: 'bus', fond: 'encre', role: 'signe', ou: 'bus (et son cerne) sur un axe principal' },
    { avant: 'encre', fond: 'voirie', role: 'signe', ou: 'cerne d\'un bus ou d\'un vélo sur la chaussée' },
  ],
  groupes: {},
  poses: [],
};
