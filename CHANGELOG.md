# Changelog

## 0.10.0 — 2026-11-20
- Vue 3D semi-réaliste : le soleil suit l'heure du trafic, avec ses ombres ; le soir tombe, des fenêtres s'allument
- Façades à fenêtres (un étage tous les 3 m, une hypothèse de jeu), toits plats, asphalte et trottoirs de pierre
- Marquages au sol là où vos voies sont définies ; en 3D, axes et nœuds discrets (touches 3 et 4)

## 0.9.10 — 2026-11-20
- Bêta : les carrefours se dessinent sans incohérence — bordures arrondies comme les trottoirs, chaussée qui s'élargit en douceur, pistes qui longent la rue au lieu de faire un détour
- Bêta : un rond-point ne se pose plus là où une rue est trop courte ; les routes trop proches et les coudes en pointe sont refusés
- Bêta : vélos et voitures ne se chevauchent plus aux traversées cyclables ; les voies sans issue ont toujours une sortie

## 0.9.9 — 2026-11-20
- Bêta : voies de présélection avant un carrefour et voies d'insertion après (outil I), avec leur biseau ; bretelles de tourne-à-droite sur les ronds-points (clic sur un coin)
- Bêta : les virages suivent un vrai arc, îlot central compris ; plus de bord qui se replie
- Bêta : dans les ronds-points, les voitures se suivent voie par voie et ne se chevauchent plus

## 0.9.8 — 2026-11-20
- Bêta : les ronds-points ont leurs voies marquées, autant que la plus large des routes qui y arrivent
- Bêta : autour de l'anneau, la piste cyclable puis le trottoir, comme dans la réalité

## 0.9.7 — 2026-11-20
- Bêta : plus de filets clairs en biais là où un virage rejoint les tronçons droits

## 0.9.6 — 2026-11-20
- Bêta : la barre d'outils tient dans toutes les fenêtres (icônes seules sous 1800 px, nom au survol)

## 0.9.5 — 2026-11-20
- Bêta : ronds-points en trois tailles (mini, urbain, grand à deux voies) — on cède à qui tourne, la piste cyclable fait le tour en cercle
- Bêta : une flèche au sol sur chaque voie, et une vue Mouvements pour tirer ou couper les liaisons voie à voie ; les voitures les suivent
- Bêta : îlots centraux (refuges où l'on traverse en deux fois, ou terre-plein planté) ; les virages à angle droit se courbent

## 0.9.4 — 2026-11-20
- Bêta : carrefours protégés pour les cyclistes — la chaussée se resserre, un îlot à chaque coin, la piste fait le tour et traverse chaque branche (à double sens quand une piste à double sens y arrive)
- Bêta : des bus et un outil Voie bus (la voie de droite d'un sens, interdite aux voitures) ; aux feux, un sas vélo devant les voitures
- Bêta : on ne cède qu'à qui est sur sa voie ou va y entrer ; deux passages presque collés n'en font qu'un ; les lignes de voie s'arrêtent à la ligne d'arrêt

## 0.9.3 — 2026-11-20
- Bêta : les carrefours ne s'emmêlent plus — chaque passage recule selon l'angle avec ses voisines, les rues arrivent à 60° au moins, seules les traversées cyclables tout droit sont peintes, le zébra ne couvre que la chaussée
- Bêta : jusqu'à 4 × 4 voies (Maj + clic : une de moins), refusé au-delà de 27 m ou si la route mord sur une voisine ; pistes à double sens des deux côtés ; beaucoup plus de vélos
- Bêta : le picto vélo se lit debout dans le sens de marche, comme au sol ; les compteurs passent en haut et ne cachent plus les outils

## 0.9.2 — 2026-11-20
- Bêta : feux posés au clic sur un carrefour (outil Feux), avec un panneau pour régler la durée de chaque vert ; les vélos ont leurs feux, plus petits
- Bêta : trottoirs partout, passages piétons à chaque carrefour, et des piétons qui marchent et traversent ; les voitures les attendent
- Bêta : pistes cyclables à double sens (nouvel outil), liaisons cyclables peintes dans les carrefours ; outils groupés par couleur (routes, vélo, carrefours)

## 0.9.1 — 2026-11-19
- La bêta « Carte blanche » s'ouvre même avec un bloqueur de publicités : son module de trafic, refusé à cause de son nom, s'appelle autrement
- Nouvel outil Démolir (touche 4 ou Suppr) : le tronçon survolé passe en rouge, un clic le retire et les carrefours qui n'en sont plus se referment

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
