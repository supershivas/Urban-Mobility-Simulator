# Changelog

## 0.9.0 — 2026-11-19
- Nouveau sur l'écran titre : « Bêta : carte blanche », une carte vierge en 3D avec une route à double sens où passent des voitures
- Un clic sur une route, puis la nouvelle route se courbe sous le pointeur ; un clic la construit, en impasse ou raccordée à une autre (carrefour), et les voitures l'empruntent
- Doubler les voies d'un tronçon (2 × 2) ou lui ajouter des pistes cyclables vertes, avec picto vélo et quelques vélos

## 0.8.0 — 2026-11-19
- La partie s'ouvre sur une mission guidée : une piste cyclable rue de la Loi, pas à pas ; puis deux missions sur de vrais lieux (Cortenbergh, rue de Trèves), jugées sur le trafic qui roule
- Écran épuré : la vue, les outils, le temps et la mission ; le mode expert (O) rend les couches, l'inspecteur et les chiffres
- Avec un outil, la voie survolée est surlignée et une étiquette dit ce que fera le clic, ou pourquoi il ne marchera pas

## 0.7.1 — 2026-11-19
- Le jeu démarre même avec un bloqueur de publicités : le module du trafic, qu'il pouvait refuser à cause de son nom, s'appelle autrement
- Si le jeu ne démarre pas, l'écran de chargement nomme le fichier qui manque, et le message se sélectionne pour être copié

## 0.7.0 — 2026-11-19
- Construire à la main : une barre d'outils en bas de la vue (voie auto, bus, piste, trottoir, stationnement, planté, sens, retirer) ; un clic ou un glisser sur une voie la transforme, en 2D comme en 3D
- Flèches au sol sur le carrefour choisi : un clic allume ou éteint une direction ; aux feux, elles passent au vert ou au rouge, et le trafic s'arrête au rouge pour sa direction
- Feux réglables dans l'éditeur de carrefour (M) : modèle de phases et durée de vert de chaque phase ; si le jeu ne démarre pas, l'écran de chargement dit pourquoi

## 0.6.0 — 2026-11-19
- Le trafic roule : voitures, bus et vélos circulent sur les vraies voies du corridor, entrent par ses bords et choisissent leur route aux carrefours ; la partie s'ouvre en 3D
- Chaque modification se voit tout de suite : une voie retirée, un raccord détaché ou un feu posé changent ce qui roule (files au rouge comprises)
- Pause (Espace) et vitesse du temps (X, jusqu'à ×8) en haut à gauche ; l'inspecteur d'une rue montre ce qui y passe en ce moment

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
