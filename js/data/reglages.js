// Les nombres du jeu : aucun nombre magique dans la logique (section 12).
// L'atelier peut les régler ; la version publiée est lue au lancement dans
// assets/design/reglages.json.
export const REGLAGES = {
  carte: {
    zoomMin: 11,            // échelle d'affichage : zoom 11 à 20 (Jérôme, v0.1.0)
    zoomMax: 20,
    margeEmprisePx: 24,     // marge autour de l'emprise au recentrage
    dureeVolMs: 600,        // durée des déplacements animés (raccourcie si mouvement réduit)
    pasDeplacementPx: 120,  // déplacement au clavier, par appui
    zoomEtiquettes: 12.5,   // étiquettes des stations masquées en dessous (chevauchement mesuré à 375 px)
  },
  selection: {
    toleranceClicPx: 8,     // un clic à moins de 8 px d'un axe le sélectionne
  },
  traits: {
    axePrincipalPx: 2.5,    // épaisseur des axes MER, MAR, H à zoom 15
    axeSecondairePx: 1.5,
    selectionPx: 6,
    noeudRayonPx: 2.5,
  },
};
