# CLAUDE.md — Urban-Mobility-Simulator

Consignes pour Claude Code sur ce dépôt. À lire en début de session.

## Règles de travail

- **Toujours pousser sur `main`** : chaque session se termine par un commit et un `git push origin main`. Pas de branche de travail, pas de pull request sauf demande explicite.
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
| 0.1 | Carte 2D réelle : rues, intersections, bâtiments, couches, sélection d'un tronçon, inspecteur, retour à l'emprise | à faire |
| 0.2 | Rendu 3D three.js, bâtiments, caméra libre, sélection synchronisée | — |
| 0.3 | Éditeur de section transversale, contraintes de largeur, undo/redo | — |
| 0.4 | Éditeur d'intersections et raccordements | — |
| 0.5 | Simulation simplifiée et indicateurs | — |
| 0.6 | Scénarios, comparaison, sauvegarde, finition | — |

Ne pas commencer l'éditeur tant que la géométrie, les connexions et les limites physiques ne sont pas comprises.

## Exclu de la v0.1

Modification des voies, édition de carrefours, simulation, véhicules animés, relief, bâtiments 3D, son, comptes ou serveur distant.

## Vérification (section 19 de game-system)

Tests (`npm test`), captures sans erreur, audit d'écran, lisibilité. `version.json` puis `node outils/stamp-version.mjs` avant chaque push sur `main`.
