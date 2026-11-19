# Outillage (npm, vendor, réglages Claude)

<!-- Sorti de CLAUDE.md, texte inchangé : décisions datées, mesures et pièges avec leur coût. Un ajout se range ici. -->

- `vendor/` **commité** : MapLibre GL JS 6.16.0 (build ES + worker), proj4js 2.22.0 (UMD enveloppé en module par `outils/vendor.mjs`), three.js 0.187.0 (`three.module.js` + `three.core.js`, non minifiés : le paquet n'en publie pas de build minifié ; MIT). Coût : Pages n'exécute pas `npm install`.
- `package.json` : dépendances `maplibre-gl`, `proj4`, `three` ; outils `vitest` 5.0.5, `vite` 8.3.4 (dépendance paire de Vitest, jamais utilisé pour construire), `@turf/buffer` 7.4.0 (tampon de l'emprise, pipeline seulement).
- `npm install` échouait (bogue d'arborist) tant que `vite` n'était pas déclaré : il l'est, en version fixée.
- Les réglages `Read(...)` refusés de `.claude/settings.json` (`vendor/`, `data/original/`, `data/processed/*.geojson`, `captures/`) bloquent aussi toute commande shell qui nomme ces chemins : passer par les scripts du dépôt, et sortir les captures à regarder avec `--sortie` hors de `captures/`.

## Mode debug

Mode debug : `?debug=1` → `window.__jeu` : `state()` (sélection, inspecteur, zoom, centre, couches), `teleport('montgomery')` (les stations), `jouer()`, `selectionner(id)`, `versEcran([lon, lat])`, `allerA([lon, lat], zoom)`, `pret()` (ms jusqu'à la carte prête), `ids()`. Vue 3D : `state()` donne aussi `mode`, `camera` (cible, distance, azimut, inclinaison, position), `surbrillance2d`, `surbrillance3d`, `scenePreteMs` ; `vue('3d' | '2d')` (rend les ms de la première ouverture), `camera({ cibleLonLat, distance, azimut, inclinaison })`, `versEcran3d([lon, lat], hauteur)`, `pointSurBatiment(id)`, `batiments()`, `sceneComptes()`. Éditeur : `editables()`, `editer(id)`, `section(id)`, `operation(nom, …args)`, `choisirBande(id)`, `annuler()`, `retablir()`, `scenario()`, `sections2d()`, `sections3d()`, `editeurOuvert()`. Carrefours (v0.4) : `state()` donne aussi `editeCarrefour`, `voieChoisie` ; `carrefoursModifiables()`, `editerCarrefour(id)`, `fermerCarrefour()`, `carrefour(id)` (branches, voies, raccords, alertes, choix), `operationCarrefour(nom, …args)`, `choisirVoie(id)`, `raccords2d()` (source donnée à la carte, raccords tuilés, traversées), `raccords3d()`, `ancres(id)`, `editeurCarrefourOuvert()`. Flux (v0.5) : `sim(id)` (état simulé, `Infinity` en texte), `conflits(id)`, `bilanFlux()`, `editerFlux(id)`, `fermerFlux()`, `fluxOuvert()`, `operationFlux(nom, …args)` (`definirDemande`, `definirHypothese`), `flux2d()` (tronçon → niveau dessiné), `comptages()`. Trafic (v0.6) : `trafic()` (temps, bilan, pause, vitesse), `mesuresTrafic(id)`, `avancerTrafic(n)` (n pas tout de suite), `pauseTrafic(oui)`, `reconstruireTrafic()`, `entrees()`, `vehicules()`, `blocs3d()`, `cheminsTrafic()`. `&vue=2d` : la partie neuve s'ouvre sur la carte.

## Pièges généraux (sortis de CLAUDE.md, v0.5.0)

- MapLibre : une seule interpolation sur le zoom par expression (condition **dans** les paliers, `largeurSelon`) ; `querySourceFeatures` rend des morceaux découpés par tuile (viser par la vraie géométrie, `versEcran`).
- Deux clics au même endroit à moins de ~500 ms passent pour un double-clic (zoom) : l'outil de critère attend 600 ms.
- Un bouton visible avant la fin du chargement ne faisait rien en ligne (~2 Mo de données) : écran de chargement obligatoire (conventions §3, Jérôme, v0.1.2), boutons du titre aussi désactivés jusqu'à `montrerTitre()`.
