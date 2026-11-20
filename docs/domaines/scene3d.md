# Vue 3D (three.js)

<!-- Sorti de CLAUDE.md, texte inchangé : décisions datées, mesures et pièges avec leur coût. Un ajout se range ici. -->

- three.js : **un seul point d'entrée** (`vendor/three/three.module.js`). Importer aussi `three.core.js` avec un `?v=` charge le cœur deux fois (« Multiple instances of Three.js »). Corollaire : `three.core.js` n'est jamais estampillé ; à un changement de version de three, renommer le dossier `vendor/three-<version>/`.
- `ShapeUtils.triangulateShape` exige des `Vector2` (il appelle `.equals`) : des objets `{x, y}` plantent.
- Vue 3D inclinée : le bord proche de l'emprise est plus large à l'écran ; `cadrer` ajoute (h/2)·sin(inclinaison) à la distance.

## Vue semi-réaliste (v0.10)

Décisions (Jérôme, v0.10.0) :

| Sujet | Décision |
|---|---|
| Lumière | **Le soleil suit l'heure du trafic** (la partie repart à 8 h) : `js/scene/soleil.js` (pur, testé), le 15 mai en heure d'été (`R.scene.soleilJour`, `soleilDecalageUTC` : un choix de jeu). Ombres portées autour du point visé (carte de 4096 px, carré de 1,6 distance de caméra) ; le soir le soleil rougit, la nuit il s'éteint, la lumière diffuse bleuit, le ciel et la brume suivent, des fenêtres s'allument |
| Façades | **Fenêtres en hypothèse de jeu** (assouplissement du pilier 6) : un étage tous les 3 m, une travée tous les 2,8 m, centrées sur le mur, seulement sur les étages entiers ; dessinées au rendu (attribut `facade` de `maillerBatiments`, nuanceur de `MeshLambertMaterial`), fondues dans leur teinte moyenne de loin. Les bâtiments sans hauteur restent à plat, cernés de `inconnu` |
| Toits | Plats (les formes de toiture restent exclues), zinc gris, contour en corniche |
| Marquages | **Seulement là où le scénario définit les voies** (`marquagesSection`) : tirets entre deux voies d'un même sens, ligne continue entre deux sens et le long d'une voie bus ou d'une piste, tirets le long d'un stationnement ; passages piétons en bandes blanches sur l'asphalte. Une chaussée non découpée reste sans ligne |
| Axes et nœuds | **Discrets** : couches éteintes par défaut en 3D (`etat.couches3d`, sauvegardé), réactivables (3, 4) ; un tronçon ou un nœud se choisit toujours au clic, au clavier et au survol |
| Couleurs | `PALETTE_3D` (`js/palette.js`) : sol, asphalte, pierre, façade, toit, vitre, marquage, ciel de jour et de nuit, lumières. Les couleurs qui portent un sens (pistes, bus, sélection, trafic) restent celles de `PALETTE` (fondues de 30 % dans l'asphalte pour les bandes) |

Matériaux : `decor()` (Lambert, éclairé, reçoit les ombres) pour le monde ; `aplat()` (sans lumière) pour l'interface : axes, nœuds, sélection, flèches, raccords. Les maillages éclairés calculent leurs normales (`geometrie(m, true)`) ; les murs ont 4 sommets propres, donc des normales franches.

Debug : `__jeu.soleil(h)` impose l'heure du soleil (décimale) et rend son état ; `soleil(null)` le rend au trafic.

Pièges :

- Lumières three.js en unités physiques (version du dépôt) : intensités de l'ordre de 2 à 3 pour le soleil ; au-delà, le sol clair sature (mesuré : 3,2 + ciel 2,4 rendait le sol presque blanc).
- `definirHeure` ne doit pas être appelée pendant la création de la scène : `demander()` lit des variables déclarées plus bas (zone morte temporelle) ; `main.js` l'appelle une fois la scène active.
- Un tiret qui passe un sommet de la ligne a deux morceaux (test `scene.test.mjs`).
