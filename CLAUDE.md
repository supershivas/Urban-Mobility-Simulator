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
| Vue | 3D caméra libre ou orbitale (cible) — **v0.1 en carte 2D MapLibre**, three.js à partir de v0.2 |
| Public | Joueur averti |
| Session | Partie longue continue |
| Cible | Bureau (≈ 1440 × 900), toutes tailles de fenêtre |
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
| Vérification | Tests (Vitest + `outils/test-run.mjs`), captures, audit d'écran, lisibilité, `outils/critere-v01.mjs` ; pas de harnais de playtest (Jérôme, v0.1.0) |
| Critère v0.1 | Données traçables et justes : 0 doublon d'identifiant, 100 % des from/toNode, 20 tronçons au hasard → bon inspecteur, carte prête < 3 s (Jérôme, v0.1.0) |
| Onglet caché | Rien ne tourne (pas de simulation en v0.1) ; la vue est sauvegardée |

- **Production** : https://supershivas.github.io/urban-mobility-simulator/
- **Aperçu** : https://supershivas.github.io/urban-mobility-simulator/apercu.html (le jeu dans un cadre de téléphone)
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
| `inconnu` | `#696969` | « Non renseigné » (#8C8C8C proposé : 3,0 de contraste sur papier, assombri à 4,8) |

Police : police système (aucune police distante). Les aplats (bâti, trottoir) ne sont pas des signes : contours `bord` dès le zoom 15–16.

### Commandes

| Action | Clavier | Souris |
|---|---|---|
| Choisir un tronçon | T (le plus proche du centre) | clic sur l'axe (tolérance 8 px) |
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
- Dépendances prévues : MapLibre GL JS (v0.1), proj4js (v0.1), Turf.js (selon besoin), three.js (v0.2). Ajouter une dépendance seulement si elle fait gagner du temps ou des tokens, avec accord.
- Règles pures et testées dans `test/` ; contenu dans `data/`.

## Données et coordonnées

- Travail métrique en **EPSG:31370 (Belgian Lambert 72)** ; affichage GeoJSON en **WGS84 lon/lat** (RFC 7946). Ne jamais écrire du Lambert 72 dans un GeoJSON standard.
- Three.js : origine locale en mètres proche du corridor, jamais lon/lat brutes.
- Conversions via proj4js / GDAL, jamais réimplémentées à la main ; testées sur des points de référence.
- `data/original/` intouché, `data/processed/` reproductible, `data/metadata/sources.json` (organisme, URL, date, format, CRS, licence, attribution, restrictions, champs, qualité).
- Sources par priorité : UrbIS / Datastore Brussels → Brussels Mobility → OpenStreetMap (complément, ODbL : attribution) → STIB GTFS (plus tard).
- Le prototype ne dépend d'**aucun service distant** au démarrage. Si le réseau bloque une source, demander quels hôtes autoriser au lieu de fabriquer des données.
- Ne pas fusionner des tronçons parce qu'ils portent le même nom ; ponts et tunnels ne se connectent pas au réseau de surface.

## Modèle

`street` ≠ `streetSegment` (LineString entre deux nœuds) ≠ `carriageway` (Polygon) ≠ `lane` (future voie éditable). Aussi : `intersection`, `roadBoundary`, `building`, `infrastructure`. Identifiants internes stables + table de correspondance avec les identifiants sources. MapLibre et three.js lisent le **même** modèle avec les mêmes identifiants.

## Progression

| Version | Contenu | État |
|---|---|---|
| 0.1 | Carte 2D réelle : rues, intersections, bâtiments, couches, sélection d'un tronçon, inspecteur, retour à l'emprise | livrée en 0.1.0, à valider |
| 0.2 | Rendu 3D three.js, bâtiments, caméra libre, sélection synchronisée | — |
| 0.3 | Éditeur de section transversale, contraintes de largeur, undo/redo | — |
| 0.4 | Éditeur d'intersections et raccordements | — |
| 0.5 | Simulation simplifiée et indicateurs | — |
| 0.6 | Scénarios, comparaison, sauvegarde, finition | — |

Ne pas commencer l'éditeur tant que la géométrie, les connexions et les limites physiques ne sont pas comprises.

## Exclu de la v0.1

Modification des voies, édition de carrefours, simulation, véhicules animés, relief, bâtiments 3D, son, comptes ou serveur distant.

## Stack

- Modules ES sans build ; GitHub Pages par `.github/workflows/pages.yml` (tests `node outils/test-run.mjs` avant publication, dépôt servi tel quel).
- `vendor/` **commité** : MapLibre GL JS 6.16.0 (build ES + worker), proj4js 2.22.0 (UMD enveloppé en module par `outils/vendor.mjs`). Coût : Pages n'exécute pas `npm install`.
- `package.json` : dépendances `maplibre-gl`, `proj4` ; outils `vitest` 5.0.5, `vite` 8.3.4 (dépendance paire de Vitest, jamais utilisé pour construire), `@turf/buffer` 7.4.0 (tampon de l'emprise, pipeline seulement).
- Modules de game-system dans `js/lib/` (app-update, debug, game.css, gh-publish, i18n, keys, pointer, save), outils dans `outils/`, synchronisés par `scripts/sync-game-system.sh`.
- Stockage : `localStorage`, clés `urban-mobility-simulator:partie` (vue, sélection, couches), `:prefs` (langue), `:atelier`, `:gh-token` (jamais exporté).

## Structure

- `index.html`, `css/style.css` — en-tête, outils | carte | inspecteur, barre d'état ; écran titre, menu, réglages.
- `js/main.js` — cycle de vie, carte MapLibre, sélection, clavier, sauvegarde, debug.
- `js/carte/style.js` — style MapLibre et couches activables (pur, testé).
- `js/inspecteur.js` — lignes de l'inspecteur (pur, testé) ; `js/data/textes.js` — tous les textes FR/EN.
- `js/geo/` — `coordonnees.js` (proj4), `geometrie.js`, `topologie.js`, `appariement.js` (OSM) : purs, partagés par le jeu, le pipeline et les tests.
- `js/palette.js`, `js/data/reglages.js` (réglables par l'atelier, publiés dans `assets/design/reglages.json`).
- `outils/donnees/telecharger.mjs` (seule étape réseau) → `data/original/` + `manifest.json` (sha256) ; `outils/donnees/construire.mjs` (sans réseau) → `data/processed/`, `data/metadata/corridor.geojson`, `quality-report.md`.
- `data/corridor.json` (emprise), `data/urbis-codes.json` (libellés des codes, d'après les spécifications UrbIS), `data/metadata/sources.json`.
- `outils/critere-v01.mjs` — le critère de validation dans le vrai jeu.

## Où lire quoi

| Fichiers touchés | À lire d'abord |
|---|---|
| `data/`, `outils/donnees/` | `data/metadata/sources.json`, `data/metadata/quality-report.md`, pitch §7–10 |
| `js/geo/` | pitch §8–9, tests `test/coordonnees|topologie|appariement.test.mjs` |
| interface, CSS | conventions §3, §5, §7, §8 (`.claude/conventions-detail.md`) |

## Vérification (section 19 de game-system)

Tests (`npm test`), captures sans erreur, audit d'écran, lisibilité. `version.json` puis `node outils/stamp-version.mjs` avant chaque push sur `main`.

```bash
npm test                                         # ou node outils/test-run.mjs (sans installation)
node outils/captures.mjs --clic "#nouvelle" --attendre 5000
node outils/audit-ecran.mjs --clic "#nouvelle" --ecrans bureau,bureau_125,telephone,paysage
node outils/lisibilite.mjs
node outils/critere-v01.mjs                      # critère v0.1 (20 tronçons, < 3 s)
node outils/stamp-version.mjs
```

Données : `node outils/donnees/telecharger.mjs` (réseau : `geoservices-urbis.irisnet.be`, `api.openstreetmap.org`), puis `npm run donnees`. Ne jamais éditer `data/original/` ni `data/processed/` à la main.

Mode debug : `?debug=1` → `window.__jeu` : `state()` (sélection, inspecteur, zoom, centre, couches), `teleport('montgomery')` (les stations), `jouer()`, `selectionner(id)`, `versEcran([lon, lat])`, `allerA([lon, lat], zoom)`, `pret()` (ms jusqu'à la carte prête), `ids()`.

## Exceptions aux conventions

| Règle | Exception | Pourquoi |
|---|---|---|
| §21 « jamais de `npm install` » | npm récupère MapLibre et proj4, copiés dans `vendor/` (commité) ; lance Vitest | Option hybride décidée au cadrage ; le joueur ne charge que `vendor/` |
| §9 boucle à pas fixe, pause | Pas de boucle en v0.1 (`loop.js` retiré) ; le menu remplace la pause | Rien ne s'anime : pas de simulation avant v0.5 |
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
- Une ligne de grille `minmax(0, 62dvh)` s'effondre à 0 dans une page qui défile (téléphone) : hauteur fixe `62dvh`.
