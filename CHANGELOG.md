# Changelog

## 0.5.0 — 2026-11-18
- Flux et demande (F) : posez la demande d'une rue par mode et par sens ; capacité, saturation, personnes / h, temps de parcours et délai aux feux se recalculent à chaque modification
- Les comptages vélo réels de Bruxelles Mobilité (rue de la Loi, Tervueren, Nerviens) servent de demande ; les valeurs de référence sont citées et « Non renseigné » reste la règle sans donnée
- Couche Flux (touche 0) : la saturation des rues sur la carte ; l'inspecteur d'un carrefour compte ses points de conflit par paire de modes

## 0.4.0 — 2026-11-15
- Éditeur de carrefour (N pour choisir un nœud, M ou C pour l'ouvrir) : chaque voie qui entre se raccorde aux voies qui sortent ; le jeu propose, vous validez ou changez
- Passages piétons, traversées cyclables et régulation (feux, priorités) par carrefour, « Non renseigné » tant que vous ne les posez pas
- Les voies créées dans une rue restent raccordées à ses carrefours, sur la carte comme en 3D

## 0.3.0 — 2026-11-15
- Éditeur de section transversale (M) : trottoirs, pistes, bus, voies, stationnement, plantations dans la largeur réelle de chaque rue, mesurée sur les surfaces UrbIS
- La largeur ne se dépasse jamais : un ordre impossible est refusé avec sa raison ; Ctrl+Z / Ctrl+Y annulent et rétablissent
- Les sections modifiées se voient sur la carte et en 3D, et sont sauvegardées avec la partie

## 0.2.0 — 2026-11-14
- Une vue 3D du corridor : bâtiments à leur hauteur réelle (UrbIS 3D), caméra orbitale, bascule 2D / 3D avec V
- Les bâtiments se choisissent aussi : hauteur de la source ou « Non renseigné », même sélection dans les deux vues
- La barre d'état tient sur une ligne

## 0.1.4 — 2026-11-14
- Le lien des anomalies de la barre d'état est plus facile à toucher (44 px de haut)

## 0.1.3 — 2026-11-14
- Un bouton « Copier » à côté des identifiants du tronçon choisi
- Le nombre d'anomalies de la barre d'état ouvre le rapport de qualité
- La touche I ouvre l'aide clavier

## 0.1.2 — 2026-11-14
- Un écran de chargement s'affiche jusqu'à ce que la carte soit prête

## 0.1.1 — 2026-11-14
- « Nouvelle partie » attend que la carte soit chargée au lieu de ne rien faire

## 0.1.0 — 2026-11-14
- La carte réelle du corridor Schuman — Roodebeek : rues, nœuds, bâtiments, couches
- Un clic sur une rue l'inspecte : ce que disent les sources, et ce qu'elles ne disent pas
