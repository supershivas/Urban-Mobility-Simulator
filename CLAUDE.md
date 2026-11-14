@.claude/conventions-jeu.md

# CLAUDE.md — Urban-Mobility-Simulator

Consignes pour Claude Code sur ce dépôt. À lire en début de session.

## Règles de travail

- **Toujours pousser sur `main`** : chaque session se termine par un commit et un `git push origin main`. Pas de branche de travail, pas de pull request sauf demande explicite.
- **Pitch complet** : `docs/PITCH.md` (spécification, sources, modèle, sprints, procédure de lancement). En cas de doute, il fait foi après ce fichier.
- **Conventions** : le jeu suit `supershivas/game-system` (`CONVENTIONS.md`, `CONVENTIONS-DETAIL.md`, section 25 « Nouveau jeu »). Synchroniser avec `sh scripts/sync-game-system.sh` une fois l'installer passé.
- **Pas de sous-agents** sauf demande explicite (économie de tokens). Équipe d'agents : aucune.
- **Questions** : poser les décisions par `AskUserQuestion` (2 à 4 options, la recommandée en premier). Ne jamais reposer une décision listée ci-dessous.
- **Ne pas développer prématurément** les modules des étapes futures (voir Progression).

## Description

Jeu de conception urbaine inspiré des city builders, limité à l'espace public et à la voirie, sur le corridor réel **Schuman — Roodebeek** (Bruxelles). Le joueur répartit une largeur de rue fixe entre trottoirs, pistes cyclables, voies bus/tram, voies automobiles et stationnement ; il ne construit pas de bâtiments et ne peut pas élargir la rue. Chaque choix a un coût visible.

| Décision | Valeur |
|---|---|
| Genre | City / colonie builder · Gestion / automatisation · Simulation |
| Vue | Carte 2D MapLibre **et** vue 3D three.js à caméra **orbitale** (Jérôme, v0.2.0), bascule par bouton ou V ; la partie s'ouvre en 2D |
| Public | Joueur averti |
| Session | Partie longue continue |
| Cible | **Ordinateur uniquement** (≈ 1440 × 900), toutes tailles de fenêtre ; pas de version téléphone (Jérôme, v0.1.4) |
| Commandes | Clavier + souris |
| Langues | Français + anglais (tout texte passe par `i18n.js`) |
| Son | Aucun pour la v0 |
| Palette | Sur mesure (à définir, propre à ce jeu) |
| Horizon | Porte ouverte vers Steam (rien de distant, plein écran, toutes tailles) |
| Inspirations | **Traffic City** (réorganiser un réseau pour fluidifier) · **Junxions** (concevoir carrefours et raccordements). Esprit des mécaniques seulement : jamais nom, visuels ni niveaux. |
| Rendu | Carte vectorielle MapLibre (profil game-system `profils/vectoriel.md`), aucun fond de carte distant, aucun glyphe : les noms passent par le DOM |
| Échelle | Mètres réels (Lambert 72), zoom **11 à 20**, barre d'échelle métrique (Jérôme, v0.1.0) |
| Emprise | Tampon de **600 m** le long du métro 1 + station Georges Henri (`data/corridor.json`, Jérôme, v0.1.0) |
| Labo | Plus tard (Jérôme, v0.1.0) |
| Atelier | Réglages chiffrés seulement (`atelier.html`, Jérôme, v0.1.0) |
| Vérification | Tests (Vitest + `outils/test-run.mjs`), captures et audit sur **bureau et bureau_125** (plus de téléphone, Jérôme, v0.2.0), lisibilité, `critere-v01.mjs`, `critere-v02.mjs` ; pas de harnais de playtest |
| Critère v0.1 | Données traçables et justes : 0 doublon d'identifiant, 100 % des from/toNode, 20 tronçons au hasard → bon inspecteur, carte prête < 3 s (Jérôme, v0.1.0) |
| Critère v0.2 | Scène 3D prête < 5 s (1280 × 800, nouvelle partie, bascule ; ~0,9 s mesuré), mêmes comptes que les données, 12 tronçons et 12 bâtiments au hasard : même sélection, inspecteur et surbrillance en 2D et 3D ; barre d'état sur une ligne à 1280 px |
| Hauteurs | **UrbIS 3D** seulement : Zmax − Zmin des solides associés par `BU_ID` (Jérôme, v0.2.0) ; sans solide : `null`, bâtiment à plat cerné de `inconnu`, « Non renseigné » |
| Bâtiments | Sélectionnables dans les deux vues, même inspecteur ; au clic 2D les tronçons gardent la priorité (Jérôme, v0.2.0) |
| Onglet caché | Rien ne tourne (pas de simulation ; la 3D ne dessine que sur demande, jamais onglet caché ni en vue 2D) ; la vue est sauvegardée |

- **Production** : https://supershivas.github.io/Urban-Mobility-Simulator/
- **Aperçu** : https://supershivas.github.io/Urban-Mobility-Simulator/apercu.html (le jeu dans un cadre de téléphone)
- Jeu : pas de sous-titre (section 3 des conventions).

### Palette « Plan d'urbaniste » (Jérôme, v0.1.0)

Source unique : `js/palette.js` (variables CSS `--jeu-*` posées au lancement, style MapLibre construit depuis elle ; un test vérifie que la carte n'emploie que ces couleurs et que le CSS n'en contient aucune).

| Nom | Valeur | Rôle |
|---|---|---|
| `papier` | `#F2EFE8` | fond de carte et d'interface |
| `bati` | `#D3CBBE` | bâtiments |
| `voirie` | `#FFFFFF` | chaussées, en-tête, barre d'état |
| `trottoir` | `#E6E0D5` | trottoirs, terre-pleins, places (ajoutée : sans elle, trottoir et chaussée se confondent) |
| `bord` | `#9A9284` | contours, axes secondaires |
| `encre` | `#22262B` | texte, axes principaux, emprise, boutons |
| `noeud` | `#2E5A88` | nœuds, rails, liens |
| `selection` | `#D9442B` | tronçon choisi et ses nœuds |
| `inconnu` | `#696969` | « Non renseigné » (#8C8C8C proposé : 3,0 de contraste sur papier, assombri à 4,8) ; contour des bâtiments sans hauteur (3D) |

La 3D n'a pas de lumière : toits en `bati` exact, façades mêlées vers `bord` selon leur orientation (réglages `scene.ombreMur*`). Bâtiment choisi : plein `selection` **cerné d'encre** (selection sur bati ne vaut que 2,71).

Police : police système (aucune police distante). Les aplats (bâti, trottoir) ne sont pas des signes : contours `bord` dès le zoom 15–16.

### Commandes

| Action | Clavier | Souris |
|---|---|---|
| Choisir un tronçon | T (le plus proche du centre) | clic sur l'axe (tolérance 8 px) |
| Choisir un bâtiment | B (le plus proche du centre) | clic sur le bâtiment |
| Vue 2D / 3D | V | bouton « Passer en 3D / en 2D » |
| Tourner, incliner (3D) | touches physiques Q / E (A / E en AZERTY), Page préc. / suiv. | clic droit + glisser, ou Maj + glisser |
| Désélectionner | Échap | clic dans le vide, croix de l'inspecteur |
| Se déplacer | flèches, ZQSD / WASD (touche physique) | glisser |
| Zoomer | + et − | molette |
| Retour à l'emprise | R | bouton « Retour à l'emprise » |
| Couches | 1 à 8 | cases à cocher |
| Menu | Échap (sans sélection) | roue crantée |

## Piliers (non négociables)

1. **Réalisme géographique** : rues, intersections et bâtiments à leur emplacement réel ; l'échelle prime sur l'effet.
2. **L'espace public est une ressource limitée** : la somme des largeurs ne dépasse jamais l'emprise disponible.
3. **La sécurité est une contrainte de conception**, pas un score décoratif ; on parle d'exposition aux conflits, jamais de prédiction d'accidents.
4. **Mesurer les personnes, pas les véhicules** : indicateur central = personnes transportées par heure.
5. **Données sources immuables** : `originalData` → `normalizedData` → `currentScenario` (puis `simulationState`). Le joueur n'édite qu'un scénario.
6. **Aucune valeur inventée** : largeur, nombre de voies, vitesse, hauteur, priorité inconnues restent `null` et s'affichent « Non renseigné » / « Inconnu ». Toute estimation porte sa méthode et son niveau de confiance.

## Outillage (option hybride)

- Structure **game-system**, modules ES chargés directement par le navigateur, **pas de bundler**.
- `package.json` minimal : npm sert **uniquement** à récupérer les dépendances et à lancer **Vitest**. Un script (`outils/vendor.mjs`) copie les builds utiles dans `vendor/`. Jamais de CDN.
- Dépendances : MapLibre GL JS, proj4js, three.js (v0.2), Turf.js (pipeline). Ajouter une dépendance seulement si elle fait gagner du temps ou des tokens, avec accord.
- Règles pures et testées dans `test/` ; contenu dans `data/`.

## Données et coordonnées

- Travail métrique en **EPSG:31370 (Belgian Lambert 72)** ; affichage GeoJSON en **WGS84 lon/lat** (RFC 7946). Ne jamais écrire du Lambert 72 dans un GeoJSON standard.
- Three.js : repère local `js/geo/repere.js` — mètres Lambert 72 depuis l'origine `metadata.json → repereLocal` ([152800, 170300], calculée par le pipeline) ; scène X = est, Y = haut, Z = −nord. Jamais de lon/lat brutes.
- Conversions via proj4js / GDAL, jamais réimplémentées à la main ; testées sur des points de référence.
- `data/original/` intouché, `data/processed/` reproductible, `data/metadata/sources.json` (organisme, URL, date, format, CRS, licence, attribution, restrictions, champs, qualité).
- Sources par priorité : UrbIS / Datastore Brussels (dont UrbIS 3D pour les hauteurs) → Brussels Mobility → OpenStreetMap (complément, ODbL : attribution) → STIB GTFS (plus tard).
- Le prototype ne dépend d'**aucun service distant** au démarrage. Si le réseau bloque une source, demander quels hôtes autoriser au lieu de fabriquer des données.
- Ne pas fusionner des tronçons parce qu'ils portent le même nom ; ponts et tunnels ne se connectent pas au réseau de surface.

## Modèle

`street` ≠ `streetSegment` (LineString entre deux nœuds) ≠ `carriageway` (Polygon) ≠ `lane` (future voie éditable). Aussi : `intersection`, `roadBoundary`, `building`, `infrastructure`. Identifiants internes stables + table de correspondance avec les identifiants sources. MapLibre et three.js lisent le **même** modèle avec les mêmes identifiants.

## Progression

| Version | Contenu | État |
|---|---|---|
| 0.1 | Carte 2D réelle : rues, intersections, bâtiments, couches, sélection d'un tronçon, inspecteur, retour à l'emprise | livrée en 0.1.0, à valider |
| 0.2 | Rendu 3D three.js, bâtiments à leur hauteur, caméra orbitale, sélection synchronisée, bâtiments sélectionnables | livrée en 0.2.0, à valider |
| 0.3 | Éditeur de section transversale, contraintes de largeur, undo/redo | — |
| 0.4 | Éditeur d'intersections et raccordements | — |
| 0.5 | Simulation simplifiée et indicateurs | — |
| 0.6 | Scénarios, comparaison, sauvegarde, finition | — |

Ne pas commencer l'éditeur tant que la géométrie, les connexions et les limites physiques ne sont pas comprises.

## Exclu jusqu'ici

Modification des voies, édition de carrefours, simulation, véhicules animés, relief (le sol est plat, les altitudes d'UrbIS 3D ne servent qu'à la hauteur), formes de toiture, son, comptes ou serveur distant.

## Stack

- Modules ES sans build ; GitHub Pages par `.github/workflows/pages.yml` (tests `node outils/test-run.mjs` avant publication, dépôt servi tel quel).
- `vendor/` **commité** : MapLibre GL JS 6.16.0 (build ES + worker), proj4js 2.22.0 (UMD enveloppé en module par `outils/vendor.mjs`), three.js 0.187.0 (`three.module.js` + `three.core.js`, non minifiés : le paquet n'en publie pas de build minifié ; MIT). Coût : Pages n'exécute pas `npm install`.
- `package.json` : dépendances `maplibre-gl`, `proj4`, `three` ; outils `vitest` 5.0.5, `vite` 8.3.4 (dépendance paire de Vitest, jamais utilisé pour construire), `@turf/buffer` 7.4.0 (tampon de l'emprise, pipeline seulement).
- Modules de game-system dans `js/lib/` (app-update, debug, game.css, gh-publish, i18n, keys, pointer, save), outils dans `outils/`, synchronisés par `scripts/sync-game-system.sh`.
- Stockage : `localStorage`, clés `urban-mobility-simulator:partie` (vue, vue3d, mode, sélection, couches ; toujours `v: 1`, champs ajoutés avec valeur par défaut), `:prefs` (langue), `:atelier`, `:gh-token` (jamais exporté).

## Structure

- `index.html`, `css/style.css` — écran de chargement (`.jeu-chargement` de `game.css`, masqué quand les données sont lues et la carte dessinée), en-tête, outils | carte | inspecteur, barre d'état ; écran titre, menu, réglages.
- `js/main.js` — cycle de vie, carte MapLibre, bascule 2D / 3D, sélection unique (tronçon ou bâtiment), clavier, sauvegarde, debug.
- `js/scene/` — `scene3d.js` (three.js : maillages, caméra, visée ; chargé à la première bascule, ne modifie jamais l'état), `camera.js` (orbite, pur), `geometrie3d.js` (maillages en tableaux typés + tables d'identifiants, pur).
- `js/donnees.js` — lecture paresseuse et mémorisée des GeoJSON (3D, inspecteur des bâtiments).
- `js/carte/style.js` — style MapLibre et couches activables (pur, testé).
- `js/inspecteur.js` — lignes de l'inspecteur, tronçon et bâtiment (pur, testé) ; `js/data/textes.js` — tous les textes FR/EN.
- `js/geo/` — `coordonnees.js` (proj4), `repere.js` (repère local de la 3D), `geometrie.js`, `topologie.js`, `appariement.js` (OSM) : purs, partagés par le jeu, le pipeline et les tests.
- `js/palette.js`, `js/data/reglages.js` (réglables par l'atelier, publiés dans `assets/design/reglages.json`).
- `outils/donnees/telecharger.mjs` (seule étape réseau ; `urbis3d` lit 18 tuiles Shapefile avec `urbis3d.mjs` et n'en garde que `data/original/urbis3d/solides.json`) → `data/original/` + `manifest.json` (sha256) ; `outils/donnees/construire.mjs` (sans réseau) → `data/processed/`, `data/metadata/corridor.geojson`, `quality-report.md`.
- `data/corridor.json` (emprise), `data/urbis-codes.json` (libellés des codes, d'après les spécifications UrbIS), `data/metadata/sources.json`.
- `outils/critere-v01.mjs`, `outils/critere-v02.mjs` — les critères de validation dans le vrai jeu.

## Où lire quoi

| Fichiers touchés | À lire d'abord |
|---|---|
| `data/`, `outils/donnees/` | `data/metadata/sources.json`, `data/metadata/quality-report.md`, pitch §7–10 |
| `js/geo/` | pitch §8–9, tests `test/coordonnees|repere|topologie|appariement.test.mjs` |
| `js/scene/` | en-têtes des trois modules, `test/scene|camera.test.mjs`, réglages `scene` |
| interface, CSS | conventions §3, §5, §7, §8 (`.claude/conventions-detail.md`) |

## Vérification (section 19 de game-system)

Tests (`npm test`), captures sans erreur, audit d'écran, lisibilité. `version.json` puis `node outils/stamp-version.mjs` avant chaque push sur `main`.

```bash
npm test                                         # ou node outils/test-run.mjs (sans installation)
node outils/captures.mjs --cibles bureau,bureau_125 --clic "#nouvelle" --attendre 5000
node outils/captures.mjs --cibles bureau,bureau_125 --clic "#nouvelle" --clic "#bascule-vue" --attendre 6000   # vue 3D
node outils/audit-ecran.mjs --clic "#nouvelle" --ecrans bureau,bureau_125        # + --clic "#bascule-vue" pour la 3D
node outils/lisibilite.mjs
node outils/critere-v01.mjs                      # critère v0.1 (20 tronçons, < 3 s)
node outils/critere-v02.mjs                      # critère v0.2 (scène < 5 s, sélection 2D/3D, barre d'état)
node outils/stamp-version.mjs
```

Données : `node outils/donnees/telecharger.mjs` (réseau : `geoservices-urbis.irisnet.be`, `api.openstreetmap.org`, `urbisdownload.datastore.brussels`), puis `npm run donnees`. Ne jamais éditer `data/original/` ni `data/processed/` à la main.

Mode debug : `?debug=1` → `window.__jeu` : `state()` (sélection, inspecteur, zoom, centre, couches), `teleport('montgomery')` (les stations), `jouer()`, `selectionner(id)`, `versEcran([lon, lat])`, `allerA([lon, lat], zoom)`, `pret()` (ms jusqu'à la carte prête), `ids()`. Vue 3D : `state()` donne aussi `mode`, `camera` (cible, distance, azimut, inclinaison, position), `surbrillance2d`, `surbrillance3d`, `scenePreteMs` ; `vue('3d' | '2d')` (rend les ms de la première ouverture), `camera({ cibleLonLat, distance, azimut, inclinaison })`, `versEcran3d([lon, lat], hauteur)`, `pointSurBatiment(id)`, `batiments()`, `sceneComptes()`.

## Exceptions aux conventions

| Règle | Exception | Pourquoi |
|---|---|---|
| §21 « jamais de `npm install` » | npm récupère MapLibre et proj4, copiés dans `vendor/` (commité) ; lance Vitest | Option hybride décidée au cadrage ; le joueur ne charge que `vendor/` |
| §9 boucle à pas fixe, pause | Pas de boucle (`loop.js` retiré) ; le menu remplace la pause ; la 3D dessine sur demande | Rien ne s'anime : pas de simulation avant v0.5 |
| §20 aperçu, §19 deux captures | `apercu.html` reste, mais captures et audit sur bureau et bureau_125 seulement | Jeu pour ordinateur uniquement (Jérôme, v0.1.4) |
| §8 manette (Steam) | Pas de manette (`gamepad.js` retiré) | Commandes décidées : clavier + souris |
| §7 cibles 44 px | Les cases à cocher font 18 px, dans un libellé cliquable de 44 px de haut | Toute la ligne est la cible ; l'audit mesure la case seule |
| §5 police d'identité | Police système | Rien de distant ; identité à définir avec le design system |
| §8 Échap | Traité hors de `keys.js` | `keys.js` annule l'événement, et le `<dialog>` ne se fermait plus au clavier |

## Ce qui a été retiré

| Quoi | Version | Pourquoi |
|---|---|---|
| Jeu des étoiles du départ (`game.js`, `render.js`, sprites) | 0.1.0 | Remplacé par la carte du corridor |
| `audio.js`, `gamepad.js`, `loop.js`, `pixel-canvas.js`, `pixel-editor.js`, `sprites.js`, `rng.js` | 0.1.0 | Pas de son, pas de manette, pas de pixel art, pas de hasard ni de boucle en v0.1 |
| Onglet « Dessins » de l'atelier | 0.1.0 | Atelier limité aux réglages chiffrés |

## Pièges connus

- `StreetAxes_Underground` / `StreetNodes_Underground` rendent en WFS **les mêmes objets** que la surface : ne pas les télécharger, `LVL` distingue tunnels (−1) et ponts (+1).
- 120 axes UrbIS ont des identifiants de nœud vides (`…/streetnode/`) : `null`, jamais un faux nœud.
- MapLibre n'admet qu'une interpolation sur le zoom par expression : la condition va **dans** les paliers (`largeurSelon` dans `style.js`).
- `querySourceFeatures` rend des morceaux de géométrie découpés par tuile : pour viser un tronçon, projeter sa vraie géométrie (`versEcran`).
- Deux clics au même endroit à moins de ~500 ms passent pour un double-clic (zoom) : l'outil de critère attend 600 ms.
- `npm install` échouait (bogue d'arborist) tant que `vite` n'était pas déclaré : il l'est, en version fixée.
- Un bouton visible avant la fin du chargement ne faisait rien en ligne (~2 Mo de données) : écran de chargement obligatoire (conventions §3, Jérôme, v0.1.2), boutons du titre aussi désactivés jusqu'à `montrerTitre()`.
- three.js : **un seul point d'entrée** (`vendor/three/three.module.js`). Importer aussi `three.core.js` avec un `?v=` charge le cœur deux fois (« Multiple instances of Three.js »). Corollaire : `three.core.js` n'est jamais estampillé ; à un changement de version de three, renommer le dossier `vendor/three-<version>/`.
- `ShapeUtils.triangulateShape` exige des `Vector2` (il appelle `.equals`) : des objets `{x, y}` plantent.
- UrbIS 3D en WFS n'existe pas (seul `urbisvector` a des couches) : les hauteurs viennent du flux ATOM, en tuiles Shapefile MultiPatch ; le GeoPackage ne contient pas les solides.
- Les réglages `Read(...)` refusés de `.claude/settings.json` (`vendor/`, `data/original/`, `data/processed/*.geojson`, `captures/`) bloquent aussi toute commande shell qui nomme ces chemins : passer par les scripts du dépôt, et sortir les captures à regarder avec `--sortie` hors de `captures/`.
- Vue 3D inclinée : le bord proche de l'emprise est plus large à l'écran ; `cadrer` ajoute (h/2)·sin(inclinaison) à la distance.
- Une ligne de grille `minmax(0, 62dvh)` s'effondre à 0 dans une page qui défile (téléphone) : hauteur fixe `62dvh`.
