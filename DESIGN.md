# Urban Mobility Simulator — Bible du jeu

Ce document décrit **l'intention** : ce que le jeu est et veut être. La technique est
dans `CLAUDE.md`, le cadrage complet dans `docs/PITCH.md`. Les décisions de Jérôme sont
datées par version (« Jérôme, v0.1.0 ») ; les propositions pas encore tranchées portent
`[À VALIDER]`.

## Intention

On prend en main une vraie rue de Bruxelles, entre Schuman et Roodebeek, et l'on
découvre qu'elle a une largeur, et qu'elle n'en aura jamais d'autre. Chaque mètre donné
au trottoir, à la piste cyclable ou au bus est pris à quelqu'un d'autre. Le jeu rend ce
compromis visible, puis mesurable : on compte les personnes qui passent, pas les
voitures. On y revient pour essayer un autre partage de la même rue.

En v0.3, le joueur ouvre la section transversale d'un tronçon : la largeur de l'espace public,
mesurée sur les surfaces UrbIS, est fixe ; il la redistribue entre trottoirs, pistes, bus, voies,
stationnement et plantations. Le découpage réel de la chaussée en voies est inconnu : il le reste
tant que le joueur ne le dessine pas.

## Piliers

1. **Réalisme géographique** : rues, intersections et bâtiments à leur emplacement réel ; l'échelle prime sur l'effet.
2. **L'espace public est une ressource limitée** : la somme des largeurs ne dépasse jamais l'emprise disponible.
3. **La sécurité est une contrainte de conception** : on parle d'exposition aux conflits, jamais de prédiction d'accidents.
4. **Mesurer les personnes, pas les véhicules** : indicateur central = personnes transportées par heure.
5. **Données sources immuables** : `originalData` → `normalizedData` → `currentScenario` ; le joueur n'édite qu'un scénario.
6. **Aucune valeur inventée** : l'inconnu s'affiche « Non renseigné » ; une estimation porte sa méthode et sa confiance.

## Genre et inspirations

City / colonie builder · Gestion / automatisation · Simulation (Jérôme, v0.1.0). Inspirations
de mécanique seulement : *Traffic City* (réorganiser un réseau pour le fluidifier),
*Junxions* (concevoir carrefours et raccordements). Jamais leur nom, leurs visuels ni leurs niveaux.

## La boucle de jeu (cible, à partir de la v0.3)

- **Seconde** : choisir un tronçon, déplacer une limite entre deux usages (trottoir, piste, bus, voiture, stationnement) ; la largeur restante se recalcule.
- **Minute** : refaire une section transversale, puis un carrefour ; voir changer l'exposition aux conflits et les personnes par heure.
- **Partie** : un scénario pour tout le corridor, comparé à l'état réel.
- **Entre deux parties** : le scénario est sauvegardé ; on en ouvre un autre sur la même rue.

En v0.3 la boucle est : **choisir un tronçon → ouvrir sa section (M) → répartir sa largeur mesurée entre les usages → voir le résultat sur la carte et en 3D**. En v0.4 s'y ajoute : **choisir un carrefour (N) → raccorder les voies, poser les traversées, la régulation**. En v0.5 : **poser la demande d'un tronçon (F) → lire ce qui passe** : capacité, saturation, personnes / heure, temps et délai, conflits des carrefours. La demande vient d'un comptage réel (vélos, Bruxelles Mobilité) ou d'une hypothèse du joueur, jamais d'une valeur inventée ; une coupe qui retire une voie se lit aussitôt en personnes, pas en véhicules.

## Le lot minimal (v0.1)

1. Carte 2D du corridor Schuman–Roodebeek : rues, intersections, bâtiments, couches activables, retour à l'emprise.
2. Sélection d'un tronçon, avec surbrillance et inspecteur.
3. Les valeurs inconnues restent « Non renseigné ».

**Critère de validation** (Jérôme, v0.1.0) : données traçables et justes — 0 identifiant
en double, 100 % des `fromNode` / `toNode` renseignés existants, 20 tronçons tirés au sort
ouvrent le bon inspecteur, carte prête en moins de 3 s en local.
Mesuré par `npm test` (`test/donnees.test.mjs`) et `node outils/critere-v01.mjs`.

## L'éditeur de section (v0.3)

- **Emprise** (Jérôme, v0.3.0) : la largeur publique bord à bord des trottoirs, mesurée par coupes perpendiculaires sur les surfaces UrbIS, avec sa méthode et sa confiance. Sans coupe valable (place, carrefour), le tronçon n'est pas éditable : « Non renseigné ».
- **Départ** (Jérôme, v0.3.0) : les bandes mesurées (trottoir, chaussée, terre-plein…) ; la chaussée reste « voies non renseignées ».
- **Bandeau sous la carte** (Jérôme, v0.3.0) : coupe à l'échelle, limites à glisser, outils de la bande choisie, refus écrits.
- **Règle** : la somme des bandes ne dépasse jamais l'emprise ; le reste est de l'espace libre. Un ordre impossible est refusé avec sa raison.
- **Couleurs des bandes** (Jérôme, v0.3.0 : teintes douces + motifs) : valeurs proposées [À VALIDER] ; chaque type porte aussi un sigle (éditeur) et un motif (carte).

## L'éditeur de carrefour (v0.4)

- **Raccords proposés, à revoir** (Jérôme, v0.4.0) : aucune source ne dit quelle voie mène où. Le jeu propose (chaque voie qui entre vers chaque autre branche, mode compatible, la voie de gauche tourne à gauche) et le dit : tirets, « proposé », méthode et confiance faible. Le joueur détache, rattache, ou valide.
- **Traversées et régulation** (Jérôme, v0.4.0) : passage piéton (exige un trottoir), traversée cyclable (exige une piste), régulation du carrefour ; tout part de « Non renseigné ».
- **Même bandeau** que l'éditeur de section (Jérôme, v0.4.0) : une carte par branche, lettrée comme sur la carte et en 3D.
- **Règle** : une voie créée dans un tronçon est raccordée à ses carrefours ; une voie retirée emporte ses raccords. Un raccord impossible (demi-tour, voiture vers une piste, contresens) est refusé avec sa raison ; une voie sans issue ou jamais atteinte est signalée.

## Le monde

Le corridor réel : tampon de 600 m le long du métro 1 (Schuman, Mérode, Montgomery,
Joséphine-Charlotte, Gribaumont, Tomberg, Roodebeek) plus la station Georges Henri
(Jérôme, v0.1.0). Quatre secteurs de travail : Schuman · Mérode – Montgomery ·
Georges Henri – Gribaumont · Roodebeek. Aucun lieu inventé, aucun nom inventé.

## Palette, échelle, son

- **Palette** « Plan d'urbaniste » (Jérôme, v0.1.0) : un plan papier lisible des heures ; la sélection en vermillon ressort sans évoquer une alarme. Valeurs dans `CLAUDE.md`.
- **Échelle** : mètres réels (Lambert 72), zoom 11 à 20, barre d'échelle métrique (Jérôme, v0.1.0).
- **Son** : aucun pour la v0.

## Public et accessibilité

Joueur averti, partie longue continue, sur bureau (≈ 1440 × 900), clavier et souris ;
toutes les actions existent aux deux. Français et anglais. Aucun texte indispensable
n'est porté par la seule couleur (la sélection est aussi plus épaisse, les tunnels sont
en tirets).

## Ce que le jeu refuse

- **Pas de fond de carte en ligne** : tout ce qui est dessiné vient de `data/` et est sourcé (porte ouverte vers Steam, pilier 6). (Choix par défaut, v0.1.0 : Jérôme n'a pas tranché.)
- **Pas de décor décoratif** : ni arbres, ni voitures, ni foule inventés pour faire joli (pilier 6). (Choix par défaut, v0.1.0.)
- **Pas de prédiction d'accidents** : on montre l'exposition aux conflits (pilier 3).
- **Pas d'élargissement de la rue, pas de construction de bâtiments** (pilier 2).

`[À VALIDER]` : pas de score global unique ; pas de tutoriel bavard.

## Questions ouvertes

- Largeurs de chaussée : UrbIS fournit des **surfaces** (chaussée, trottoir, terre-plein, site propre) mais aucune largeur ; la méthode de mesure (coupe perpendiculaire à l'axe sur les surfaces ?) est à décider avant l'éditeur (v0.3).
- Hauteurs des bâtiments : résolu en v0.2.0 par UrbIS 3D (Zmax − Zmin des solides, par identifiant). Restent sans source : le nombre de niveaux, et 721 bâtiments sans solide (dessinés à plat).
- Brussels Mobility (routes régionales, comptages) : hôte bloqué pendant la v0.1.
