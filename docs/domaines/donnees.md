# Données (pipeline, sources)

<!-- Sorti de CLAUDE.md, texte inchangé : décisions datées, mesures et pièges avec leur coût. Un ajout se range ici. -->

- `outils/donnees/telecharger.mjs` (seule étape réseau ; `urbis3d` lit 18 tuiles Shapefile avec `urbis3d.mjs` et n'en garde que `data/original/urbis3d/solides.json`) → `data/original/` + `manifest.json` (sha256) ; `outils/donnees/construire.mjs` (sans réseau) → `data/processed/`, `data/metadata/corridor.geojson`, `quality-report.md`.
- `StreetAxes_Underground` / `StreetNodes_Underground` rendent en WFS **les mêmes objets** que la surface : ne pas les télécharger, `LVL` distingue tunnels (−1) et ponts (+1).
- 120 axes UrbIS ont des identifiants de nœud vides (`…/streetnode/`) : `null`, jamais un faux nœud.
- UrbIS 3D en WFS n'existe pas (seul `urbisvector` a des couches) : les hauteurs viennent du flux ATOM, en tuiles Shapefile MultiPatch ; le GeoPackage ne contient pas les solides.
- Comptages (v0.5) : `telecharger.mjs velos` → `data/original/brussels-mobility/velos.json` (compteurs vélo de l'emprise, historique de la période `PERIODE_VELOS`) ; `construire.mjs` → `data/processed/comptages.json` par `comptages.mjs` (méthode dans son en-tête et `metadata.json → comptages`). L'API des comptages automobiles n'a pas d'historique (« live » seulement, 2026-11-18). Détail : `docs/domaines/simulation.md`.
