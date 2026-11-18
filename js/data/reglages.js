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
    toleranceNoeudPx: 7,    // un clic à moins de 7 px d'un nœud choisit le carrefour (avant l'axe, qui y aboutit)
  },
  scene: {                  // vue 3D (v0.2) : caméra orbitale, épaisseurs de dessin en mètres
    fovDegres: 40,          // champ vertical de la caméra
    inclinaisonDefautDegres: 50, // écart à la verticale à l'ouverture et au retour à l'emprise
    inclinaisonMaxDegres: 80,    // jamais à l'horizontale : la caméra reste au-dessus du sol
    distanceMinM: 40,
    distanceMaxM: 12000,
    margeEmprisePx: 24,
    dureeVolMs: 400,
    pasRotationDegres: 15,  // rotation au clavier, par appui
    pasInclinaisonDegres: 10,
    facteurZoom: 1.5,       // zoom au clavier, par appui
    rotationDegresParPx: 0.3, // rotation à la souris
    zoomParCran: 0.0015,    // molette : exp(deltaY × ce nombre)
    seuilClicPx: 4,         // en dessous, un appui-relâché est un clic, pas un glisser
    axePrincipalM: 3,       // épaisseur du trait des axes MER, MAR, H (un trait, pas une largeur de chaussée)
    axeSecondaireM: 1.8,
    axeTunnelM: 1,
    selectionM: 5,          // trait du tronçon choisi, au plus près
    selectionPx: 6,         // … et jamais plus fin que cela à l'écran
    selectionFinM: 0.6,     // trait du tronçon choisi quand sa section est dessinée (il ne cache pas les bandes)
    selectionFinPx: 2,
    bandeChoisieM: 0.25,    // bords de la bande choisie (3D) : trait de sélection, cerne d'encre 2,5 fois plus large
    noeudRayonM: 1.5,
    noeudChoisiPx: 9,       // rayon de l'anneau du nœud choisi, à l'écran (au moins 1,5 × noeudRayonM)
    stationRayonM: 7,
    hauteurLignesM: 0.3,    // rails, ouvrages, emprise : juste au-dessus du sol pour rester visibles
    ombreMurMin: 0.2,       // teinte des façades : du bâti vers le bord, selon l'orientation
    ombreMurMax: 0.6,
    ombreSelectionMin: 0.08, // façades du bâtiment choisi : de la sélection vers l'encre
    ombreSelectionMax: 0.3,
    tiretsEmpriseM: [24, 12],
    margeSolM: 400,         // le sol dépasse l'emprise (les objets du bord sont gardés entiers)
    planProche: 0.02,       // plans de coupe, en proportion de la distance
    planLointain: 8,
    planLointainMinM: 6000,
    echelleMaxPx: 120,      // barre d'échelle, valable au point visé
  },
  carrefour: {
    lettreAuDelaM: 6,       // lettre d'une branche (carte, 3D) : à cette distance au-delà du recul
  },
  traits: {
    axePrincipalPx: 2.5,    // épaisseur des axes MER, MAR, H à zoom 15
    axeSecondairePx: 1.5,
    selectionPx: 6,
    selectionFinPx: 2,      // tronçon choisi dont la section est dessinée : un filet, pas un trait plein
    noeudRayonPx: 2.5,
    fluxFluidePx: 4,        // couche Flux (v0.5) : l'épaisseur croît avec la saturation (signe doublé de la teinte)
    fluxProchePx: 6,
    fluxSaturePx: 9,
  },
};
