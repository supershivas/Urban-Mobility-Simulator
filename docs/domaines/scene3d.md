# Vue 3D (three.js)

<!-- Sorti de CLAUDE.md, texte inchangé : décisions datées, mesures et pièges avec leur coût. Un ajout se range ici. -->

- three.js : **un seul point d'entrée** (`vendor/three/three.module.js`). Importer aussi `three.core.js` avec un `?v=` charge le cœur deux fois (« Multiple instances of Three.js »). Corollaire : `three.core.js` n'est jamais estampillé ; à un changement de version de three, renommer le dossier `vendor/three-<version>/`.
- `ShapeUtils.triangulateShape` exige des `Vector2` (il appelle `.equals`) : des objets `{x, y}` plantent.
- Vue 3D inclinée : le bord proche de l'emprise est plus large à l'écran ; `cadrer` ajoute (h/2)·sin(inclinaison) à la distance.
