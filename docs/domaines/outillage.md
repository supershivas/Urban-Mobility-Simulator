# Outillage (npm, vendor, réglages Claude)

<!-- Sorti de CLAUDE.md, texte inchangé : décisions datées, mesures et pièges avec leur coût. Un ajout se range ici. -->

- `vendor/` **commité** : MapLibre GL JS 6.16.0 (build ES + worker), proj4js 2.22.0 (UMD enveloppé en module par `outils/vendor.mjs`), three.js 0.187.0 (`three.module.js` + `three.core.js`, non minifiés : le paquet n'en publie pas de build minifié ; MIT). Coût : Pages n'exécute pas `npm install`.
- `package.json` : dépendances `maplibre-gl`, `proj4`, `three` ; outils `vitest` 5.0.5, `vite` 8.3.4 (dépendance paire de Vitest, jamais utilisé pour construire), `@turf/buffer` 7.4.0 (tampon de l'emprise, pipeline seulement).
- `npm install` échouait (bogue d'arborist) tant que `vite` n'était pas déclaré : il l'est, en version fixée.
- Les réglages `Read(...)` refusés de `.claude/settings.json` (`vendor/`, `data/original/`, `data/processed/*.geojson`, `captures/`) bloquent aussi toute commande shell qui nomme ces chemins : passer par les scripts du dépôt, et sortir les captures à regarder avec `--sortie` hors de `captures/`.
