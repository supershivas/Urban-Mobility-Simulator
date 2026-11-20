// La vue 3D du corridor (three.js) : sol, surfaces de voirie, bâtiments, axes,
// nœuds, rails, emprise. Semi-réaliste depuis la v0.10 : un soleil qui suit l'heure du
// trafic (ombres portées), des façades à fenêtres (hypothèse de jeu), des marquages au
// sol là où le scénario définit les voies. Elle lit les mêmes GeoJSON que la carte MapLibre et
// garde les mêmes identifiants ; tout est en mètres dans le repère local.
// Ce module dessine et vise : il ne modifie jamais l'état du jeu (main.js décide).
// Une image n'est calculée que sur demande (le trafic, v0.6, en demande une à chaque pas
// de la boucle), et jamais quand la vue est inactive ou l'onglet caché.
import * as THREE from '../../vendor/three/three.module.js?v=0.10.0';
import { versScene, depuisScene } from '../geo/repere.js?v=0.10.0';
import { distancePointLigne, boite } from '../geo/geometrie.js?v=0.10.0';
import { decalerLigne } from '../geo/decalage.js?v=0.10.0';
import { pose, contraindre, deplacer, tourner, zoomer, cadrer, metresParPixel, interpoler } from './camera.js?v=0.10.0';
import {
  maillerSurfaces, maillerBatiments, maillerAxes, maillerRuban, maillerRubans, maillerSections, maillerPolygones, segmentsDeLignes, lignesLocales, rangDuTriangle,
  marquagesSection, tirets,
} from './geometrie3d.js?v=0.10.0';
import { positionSoleil, directionSoleil, partDeJour } from './soleil.js?v=0.10.0';
import { PALETTE_3D as P3 } from '../palette.js?v=0.10.0';
import { BANDES } from '../data/bandes.js?v=0.10.0';
import { VEHICULES } from '../data/circulation.js?v=0.10.0';
import { HIERARCHIE_PRINCIPALE, SURFACE_PIETONNE, SURFACE_SOUTERRAINE } from '../carte/style.js?v=0.10.0';

const rad = deg => (deg * Math.PI) / 180;

/**
 * conteneur : élément qui reçoit le canvas ; repere : js/geo/repere.js ;
 * P : palette ; R : réglages (R.scene) ; donnees : { batiments, surfaces, rues, noeuds, infra, emprise } (GeoJSON) ;
 * surChoix({ type, id } | null) : un clic a visé un objet (ou le vide) ; surRendu() : une image vient d'être dessinée.
 */
export function creerScene({ conteneur, repere, P, R, donnees, surChoix, surRendu, mouvementReduit = false }) {
  const S = R.scene;
  const rvb = hex => new THREE.Color(hex).toArray(); // sRGB de la palette → linéaire, attendu par les couleurs de sommet
  const melange = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k).toArray();

  const rendu = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  rendu.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  rendu.setClearColor(P3.ciel);
  rendu.shadowMap.enabled = true;
  const canvas = rendu.domElement;
  canvas.className = 'scene-canvas';
  conteneur.prepend(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(S.fovDegres, 1, 1, 10000);

  // ─── Maillages ───────────────────────────────────────────────────────────
  const geometrie = ({ positions, couleurs, indices }, eclairee = false) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (couleurs) g.setAttribute('color', new THREE.BufferAttribute(couleurs, 3));
    if (indices) g.setIndex(new THREE.BufferAttribute(indices, 1));
    if (eclairee) g.computeVertexNormals(); // la lumière a besoin des normales (murs : 4 sommets propres, normales franches)
    return g;
  };
  // Des aplats coplanaires (sol, surfaces, axes, sélection) : le décalage de profondeur les ordonne sans les déplacer.
  // `aplat` : l'interface (axes, nœuds, sélection), sans lumière ; `decor` : le monde, éclairé par le soleil, qui reçoit les ombres.
  const aplat = (decalage, plus = {}) => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: decalage, polygonOffsetUnits: decalage, ...plus });
  const decor = (decalage, plus = {}) => new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: decalage, polygonOffsetUnits: decalage, ...plus });
  const auSol = (g, m) => { const o = new THREE.Mesh(g, m); o.receiveShadow = true; return o; };
  const lignes = (positions, couleur) => new THREE.LineSegments(geometrie({ positions }), new THREE.LineBasicMaterial({ color: couleur }));
  const groupes = {};
  const groupe = (couche, ...objets) => { (groupes[couche] ??= scene.add(new THREE.Group()).children.at(-1)).add(...objets); };

  const empriseLocale = lignesLocales(donnees.emprise.features[0].geometry, repere)[0];
  const boiteEmprise = boite(empriseLocale);
  const limites = { boite: boiteEmprise, distanceMin: S.distanceMinM, distanceMax: S.distanceMaxM, inclinaisonMax: rad(S.inclinaisonMaxDegres) };

  // Sol : un rectangle papier plus large que l'emprise (les objets gardés entiers dépassent du bord)
  const marge = S.margeSolM;
  const sol = auSol(new THREE.PlaneGeometry(boiteEmprise[2] - boiteEmprise[0] + 2 * marge, boiteEmprise[3] - boiteEmprise[1] + 2 * marge), decor(4, { color: P3.sol }));
  sol.rotation.x = -Math.PI / 2;
  sol.position.set(...versScene([(boiteEmprise[0] + boiteEmprise[2]) / 2, (boiteEmprise[1] + boiteEmprise[3]) / 2], 0));
  scene.add(sol);

  // Surfaces de voirie : mêmes filtres que la carte ; asphalte et pierre
  const teinteTrottoir = rvb(P3.trottoir), teinteVoirie = rvb(P3.asphalte);
  const mSurfaces = maillerSurfaces(donnees.surfaces.features, repere,
    p => (p.niveau < 0 || SURFACE_SOUTERRAINE.includes(p.type) ? null : SURFACE_PIETONNE.includes(p.type) ? teinteTrottoir : teinteVoirie));
  groupe('surfaces', auSol(geometrie(mSurfaces, true), decor(2, { vertexColors: true })));

  // Bâtiments : prisme à la hauteur de la source, ou emprise à plat (hauteur inconnue) cernée de la couleur « inconnu ».
  // Façades à fenêtres (v0.10, Jérôme) : une hypothèse de jeu — un étage tous les S.etageM mètres, aucune source ne les donne.
  const mBatiments = maillerBatiments(donnees.batiments.features, repere, { toit: rvb(P3.toit), plat: rvb(P.bati), mur: () => rvb(P3.facade) });
  const gBatiments = geometrie(mBatiments, true);
  gBatiments.setAttribute('facade', new THREE.BufferAttribute(mBatiments.facades, 4));
  const facade = {
    uNuit: { value: 0 }, uVitre: { value: new THREE.Color(P3.vitre) }, uLueur: { value: new THREE.Color(P3.lueur) },
    uGrille: { value: new THREE.Vector4(S.etageM, S.traveeM, S.fenetreLargeur, S.fenetreHauteur) }, uAllumees: { value: S.fenetresAllumees },
  };
  const matBatiments = decor(1, { vertexColors: true });
  matBatiments.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, facade);
    sh.vertexShader = 'attribute vec4 facade;\nvarying vec4 vFacade;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFacade = facade;');
    sh.fragmentShader = `uniform float uNuit; uniform float uAllumees; uniform vec3 uVitre; uniform vec3 uLueur; uniform vec4 uGrille;
varying vec4 vFacade;
float hasard(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  float vitreF = 0.0, allumeF = 0.0;
  if (vFacade.x >= 0.0) {
    // Les travées sont centrées sur le mur ; seuls les étages entiers ont des fenêtres
    float et = uGrille.x, tr = uGrille.y, n = floor(vFacade.w / tr), nEt = floor(vFacade.z / et);
    float x = vFacade.x - (vFacade.w - n * tr) * 0.5, y = vFacade.y;
    if (n >= 1.0 && nEt >= 1.0 && x > 0.0 && x < n * tr && y < nEt * et) {
      vec2 c = vec2(x / tr, y / et), f = fract(c), w = max(fwidth(c), vec2(1e-4));
      float lx = uGrille.z * 0.5, hy = uGrille.w;
      float mx = smoothstep(0.5 - lx - w.x, 0.5 - lx + w.x, f.x) * (1.0 - smoothstep(0.5 + lx - w.x, 0.5 + lx + w.x, f.x));
      float my = smoothstep(0.3 - w.y, 0.3 + w.y, f.y) * (1.0 - smoothstep(0.3 + hy - w.y, 0.3 + hy + w.y, f.y));
      // De loin, la grille se fond dans sa teinte moyenne (pas de moiré)
      float loin = clamp(max(w.x, w.y) * 3.0 - 0.5, 0.0, 1.0);
      vitreF = mix(mx * my, uGrille.z * uGrille.w, loin);
      allumeF = vitreF * step(1.0 - uAllumees, hasard(floor(c) + vec2(vFacade.w, vFacade.z)));
    }
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, uVitre, vitreF * 0.7);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uLueur * allumeF * uNuit;');
  };
  const batiments = new THREE.Mesh(gBatiments, matBatiments);
  batiments.castShadow = true; batiments.receiveShadow = true;
  const rangBatiment = new Map(mBatiments.ids.map((id, i) => [id, i]));
  groupe('batiments', batiments, lignes(mBatiments.contours, P3.corniche), lignes(mBatiments.contoursPlats, P.inconnu));

  // Axes de rue : des rubans (épaisseur de dessin en mètres), tunnels plus fins comme sur la carte
  const teinteEncre = rvb(P.encre), teinteBord = rvb(P.bord);
  const mAxes = maillerAxes(donnees.rues.features, repere, p => {
    const principal = HIERARCHIE_PRINCIPALE.includes(p.hierarchie);
    if (p.niveau < 0) return { couleur: teinteBord, largeur: S.axeTunnelM };
    return { couleur: principal ? teinteEncre : teinteBord, largeur: principal ? S.axePrincipalM : S.axeSecondaireM };
  });
  const niveauAxe = new Map(donnees.rues.features.map(f => [f.properties.id, f.properties.niveau]));
  groupe('rues', new THREE.Mesh(geometrie(mAxes), aplat(-1, { vertexColors: true })));

  // Nœuds : des disques, une seule géométrie instanciée
  const positionNoeud = new Map(donnees.noeuds.features.map(f => [f.properties.id, repere.lonLatVersLocal(f.geometry.coordinates)]));
  const disque = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  const noeuds = new THREE.InstancedMesh(disque, aplat(-2, { color: P.noeud }), positionNoeud.size);
  const m4 = new THREE.Matrix4();
  [...positionNoeud.values()].forEach((p, i) => noeuds.setMatrixAt(i, m4.makeScale(S.noeudRayonM, 1, S.noeudRayonM).setPosition(...versScene(p, 0))));
  groupe('intersections', noeuds);

  // Rails, ouvrages, stations, emprise
  const infra = famille => donnees.infra.features.filter(f => f.properties.famille === famille);
  groupe('rails', lignes(segmentsDeLignes(infra('rail').flatMap(f => lignesLocales(f.geometry, repere)), S.hauteurLignesM), P.noeud));
  groupe('ouvrages', lignes(segmentsDeLignes([...infra('tunnel'), ...infra('pont')].flatMap(f => lignesLocales(f.geometry, repere)).map(l => [...l, l[0]]), S.hauteurLignesM), P.encre));
  const stations = infra('station').map(f => ({ nom: f.properties.nom, local: repere.lonLatVersLocal(f.geometry.coordinates) }));
  for (const s of stations) {
    for (const [rayon, couleur, decalage] of [[S.stationRayonM, P.voirie, -3], [S.stationRayonM * 0.7, P.encre, -4]]) {
      const d = new THREE.Mesh(disque, aplat(decalage, { color: couleur }));
      d.scale.set(rayon, 1, rayon);
      d.position.set(...versScene(s.local, 0));
      groupe('stations', d);
    }
  }
  const contour = new THREE.Line(geometrie({ positions: Float32Array.from([...empriseLocale, empriseLocale[0]].flatMap(p => versScene(p, S.hauteurLignesM))) }),
    new THREE.LineDashedMaterial({ color: P.encre, dashSize: S.tiretsEmpriseM[0], gapSize: S.tiretsEmpriseM[1] }));
  contour.computeLineDistances();
  groupe('emprise', contour);

  // ─── Flèches de direction (v0.7) : polygones au sol, posés sur le carrefour ──
  const groupeFleches = scene.add(new THREE.Group()).children.at(-1);
  let signatureFleches = '';
  // fleches : [{ anneau (local), couleur (palette) }] ; ne refait le maillage que si elles ont changé
  function definirFleches(fleches) {
    const sig = JSON.stringify(fleches.map(f => [f.couleur, f.anneau[0]]));
    if (sig === signatureFleches) return;
    signatureFleches = sig;
    vider(groupeFleches);
    const m = maillerPolygones(fleches.map(f => ({ anneau: f.anneau, couleur: rvb(f.couleur) })), S.hauteurLignesM / 2);
    if (m.indices.length) groupeFleches.add(new THREE.Mesh(geometrie(m), aplat(-3, { vertexColors: true })));
    demander();
  }

  // ─── Trafic (v0.6) : un bloc par véhicule, des instances par mode (couche « flux ») ──
  // Voitures en `noeud` [À VALIDER] : l'encre se perdait sur les axes principaux, le blanc sur la chaussée.
  // Éclairés par le soleil, ils portent leur ombre (v0.10).
  const TEINTE_MODE = { voiture: P.noeud, bus: P.bus, velo: P.cyclable };
  const blocs = {};
  const fantome = new THREE.Object3D();
  for (const [mode, G] of Object.entries(VEHICULES)) {
    const g = new THREE.BoxGeometry(G.longueur, G.hauteur, G.largeur);
    g.translate(0, G.hauteur / 2, 0);
    const m = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: TEINTE_MODE[mode] }), 4000);
    m.castShadow = true;
    m.count = 0;
    m.frustumCulled = false; // les instances bougent : la boîte englobante du maillage ne les suit pas
    blocs[mode] = m;
    groupe('flux', m);
  }
  // lots : { mode → Float32Array [x, y, cap, …] } en Lambert 72 (cap : angle depuis l'est, sens trigonométrique)
  function definirTrafic(lots) {
    const [ox, oy] = repere.origine;
    for (const [mode, m] of Object.entries(blocs)) {
      const t = lots[mode] ?? new Float32Array(0), n = Math.min(t.length / 3, m.instanceMatrix.count);
      for (let i = 0; i < n; i++) {
        fantome.position.set(t[i * 3] - ox, 0, -(t[i * 3 + 1] - oy));
        fantome.rotation.set(0, t[i * 3 + 2], 0); // tourner +X (est) vers −Z (nord) : rotation positive autour de Y
        fantome.updateMatrix();
        m.setMatrixAt(i, fantome.matrix);
      }
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
    demander();
  }

  // ─── Sections transversales (v0.3) : refaites quand le scénario change ──
  // Posées sur les surfaces, sous les axes ; mêmes bords que sur la carte.
  const groupeSections = scene.add(new THREE.Group()).children.at(-1);
  groupes.sections = groupeSections;
  let mSections = { ids: [], bandes: new Map(), indices: [] }, bandeChoisie = null;
  // Teintes des bandes en 3D : celles qui portent un sens gardent leur couleur de plan, un peu fondue dans l'asphalte
  const TEINTE_BANDE_3D = { voiture: P3.asphalte, chaussee: P3.asphalte, trottoir: P3.trottoir, 'terre-plein': P3.trottoir, separation: P3.bordure };
  const teinteBande = type => (TEINTE_BANDE_3D[type] ? rvb(TEINTE_BANDE_3D[type]) : melange(P[BANDES[type]?.couleur ?? 'voirie'], P3.asphalte, type === 'plante' ? 0.15 : 0.3));
  function dessinerSections(entrees) {
    vider(groupeSections);
    const avecLigne = entrees.map(e => ({ ...e, ligne: mAxes.lignes.get(e.section.troncon) })).filter(e => e.ligne);
    mSections = maillerSections(avecLigne, teinteBande);
    if (!mSections.ids.length) return;
    groupeSections.add(auSol(geometrie(mSections, true), decor(0, { vertexColors: true })));
    // Marquages au sol (v0.10) : lignes de voie, bords de piste et de voie bus — là où le scénario définit les voies
    const continus = [], pointilles = [];
    for (const e of avecLigne) for (const mq of marquagesSection(e.ligne, e.section)) (mq.style === 'tirets' ? pointilles : continus).push(mq.ligne);
    const traits = [...continus, ...pointilles.flatMap(l => tirets(l, ...S.tiretsMarquageM))];
    if (traits.length) groupeSections.add(auSol(geometrie(maillerRubans(traits, S.marquageM), true), decor(-1, { color: P3.marquage })));
    // Les autres bords des bandes, en filet de bordure : lisibles sans la couleur
    const bords = [];
    for (const e of avecLigne) {
      const choisie = bandeChoisie?.startsWith(`${e.section.troncon}:`) ? bandeChoisie.split(':')[1] : null;
      for (const b of e.decalages) for (const d of [b.gauche, b.droite]) bords.push({ l: decalerLigne(e.ligne, d), choisie: b.id === choisie });
    }
    // (une géométrie vide ferait calculer à three.js une sphère englobante NaN : rien n'est ajouté sans bord)
    const ordinaires = segmentsDeLignes(bords.filter(b => !b.choisie).map(b => b.l), S.hauteurLignesM / 3);
    if (ordinaires.length) groupeSections.add(lignes(ordinaires, P3.bordure));
    // Bande choisie : ses deux bords en rubans, sélection sur un cerne d'encre (comme sur la carte)
    for (const b of bords.filter(x => x.choisie)) {
      groupeSections.add(new THREE.Mesh(geometrie(maillerRuban(b.l, S.bandeChoisieM * 2.5, 0)), aplat(-3, { color: P.encre })));
      groupeSections.add(new THREE.Mesh(geometrie(maillerRuban(b.l, S.bandeChoisieM, 0)), aplat(-4, { color: P.selection })));
    }
  }

  // ─── Carrefours (v0.4) : zone, traversées, raccords — la géométrie de la carte ─
  // Posés sur les sections ; raccords proposés en tirets, choisis en trait plein, ceux de la voie choisie en sélection cernée.
  const groupeCarrefours = scene.add(new THREE.Group()).children.at(-1);
  let carrefoursDessines = [];
  function dessinerCarrefours(entrees, voie) {
    vider(groupeCarrefours);
    carrefoursDessines = entrees;
    const polys = [];
    for (const e of entrees) {
      if (e.complet && e.zone) polys.push({ anneau: e.zone, couleur: rvb(P3.asphalte) });
      for (const tr of e.traversees) polys.push({ anneau: tr.anneau, couleur: tr.type === 'velo' ? melange(P.cyclable, P3.asphalte, 0.3) : rvb(P3.asphalte) });
    }
    const m = maillerPolygones(polys);
    if (m.indices.length) groupeCarrefours.add(auSol(geometrie(m, true), decor(-1, { vertexColors: true })));
    // Passage piéton : bandes blanches sur l'asphalte, perpendiculaires à la marche (lisible sans la couleur)
    const zebres = [];
    for (const e of entrees) for (const tr of e.traversees.filter(x => x.type === 'pieton')) zebres.push(...tr.bandes ?? []);
    if (zebres.length) groupeCarrefours.add(auSol(geometrie(maillerPolygones(zebres.map(a => ({ anneau: a, couleur: rvb(P3.marquage) }))), true), decor(-2, { vertexColors: true })));
    const contours = entrees.filter(e => e.complet && e.zone).map(e => e.zone);
    if (contours.length) groupeCarrefours.add(lignes(segmentsDeLignes(contours, S.hauteurLignesM / 3), P3.bordure));
    const raccords = entrees.filter(e => e.complet).flatMap(e => e.raccords);
    for (const [origine, tirets] of [['propose', true], ['joueur', false]]) {
      const ls = raccords.filter(r => r.origine === origine && r.de !== voie).map(r => r.ligne);
      if (!ls.length) continue;
      const seg = new THREE.LineSegments(geometrie({ positions: segmentsDeLignes(ls, S.hauteurLignesM) }),
        tirets ? new THREE.LineDashedMaterial({ color: P.noeud, dashSize: 0.8, gapSize: 0.6 }) : new THREE.LineBasicMaterial({ color: P.noeud }));
      if (tirets) seg.computeLineDistances();
      groupeCarrefours.add(seg);
    }
    for (const r of raccords.filter(x => x.de === voie)) {
      groupeCarrefours.add(new THREE.Mesh(geometrie(maillerRuban(r.ligne, S.bandeChoisieM * 2.5, 0)), aplat(-3, { color: P.encre })));
      groupeCarrefours.add(new THREE.Mesh(geometrie(maillerRuban(r.ligne, S.bandeChoisieM, 0)), aplat(-4, { color: P.selection })));
    }
  }

  // ─── Surbrillance de la sélection (même objet que sur la carte) ──────────
  const surbrillance = scene.add(new THREE.Group()).children.at(-1);
  let choisi = null, largeurRuban = 0; // { type, id, noeuds }
  const vider = g => { for (const o of [...g.children]) { g.remove(o); if (o.geometry !== disque) o.geometry.dispose(); o.material.dispose(); } };
  function dessinerSelection() {
    vider(surbrillance);
    if (!choisi) return;
    if (choisi.type === 'batiment') {
      const f = donnees.batiments.features[rangBatiment.get(choisi.id)];
      if (!f) return;
      // Façades un peu assombries selon leur orientation : le volume choisi reste lisible
      const teinte = rvb(P.selection);
      const m = maillerBatiments([f], repere, { toit: teinte, plat: teinte, mur: o => melange(P.selection, P.encre, S.ombreSelectionMin + (S.ombreSelectionMax - S.ombreSelectionMin) * o) });
      const plein = new THREE.Mesh(geometrie(m), aplat(-5, { vertexColors: true }));
      // mêmes sommets que le bâtiment : le décalage de profondeur le fait passer devant
      surbrillance.add(plein, lignes(m.contours.length ? m.contours : m.contoursPlats, P.encre));
    } else if (choisi.type === 'noeud') {
      const p = positionNoeud.get(choisi.id);
      if (!p) return;
      largeurRuban = largeurSelection();
      // Un anneau autour du nœud, cerné d'encre : il ne cache pas les raccords du carrefour
      for (const [rayon, couleur, decalage] of [[largeurRuban * 1.25, P.encre, -6], [largeurRuban, P.selection, -7], [largeurRuban * 0.55, P.voirie, -8]]) {
        const d = new THREE.Mesh(disque, aplat(decalage, { color: couleur }));
        d.scale.set(rayon, 1, rayon);
        d.position.set(...versScene(p, 0));
        surbrillance.add(d);
      }
    } else {
      const ligne = mAxes.lignes.get(choisi.id);
      if (!ligne) return;
      largeurRuban = largeurSelection();
      surbrillance.add(new THREE.Mesh(geometrie(maillerRuban(ligne, largeurRuban, 0)), aplat(-5, { color: P.selection })));
      for (const n of choisi.noeuds ?? []) {
        const p = positionNoeud.get(n);
        if (!p) continue;
        for (const [rayon, couleur, decalage] of [[largeurRuban, P.selection, -6], [largeurRuban * 0.6, P.voirie, -7]]) {
          const d = new THREE.Mesh(disque, aplat(decalage, { color: couleur }));
          d.scale.set(rayon, 1, rayon);
          d.position.set(...versScene(p, 0));
          surbrillance.add(d);
        }
      }
    }
  }
  // Le trait de sélection garde une épaisseur lisible à l'écran, quelle que soit la distance
  // Affiné quand la section du tronçon est dessinée : le trait ne doit pas cacher ses bandes
  let fin = false;
  const largeurSelection = () => (choisi?.type === 'noeud' ? Math.max(S.noeudRayonM * 1.5, mpp() * S.noeudChoisiPx)
    : fin ? Math.max(S.selectionFinM, mpp() * S.selectionFinPx) : Math.max(S.selectionM, mpp() * S.selectionPx));

  // ─── Lumière (v0.10) : le soleil suit l'heure du trafic, le ciel et la brume avec lui ─
  const ciel = new THREE.HemisphereLight(P3.lumiereCiel, P3.lumiereSol, S.lumiereCiel);
  const soleil = new THREE.DirectionalLight(P3.lumiereSoleil, S.lumiereSoleil);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(S.ombreTaillePx, S.ombreTaillePx);
  soleil.shadow.bias = -0.0004;
  soleil.shadow.normalBias = 0.6;
  scene.add(ciel, soleil, soleil.target);
  scene.fog = new THREE.Fog(P3.ciel, 1000, 10000);
  const [lonCentre, latCentre] = repere.localVersLonLat([(boiteEmprise[0] + boiteEmprise[2]) / 2, (boiteEmprise[1] + boiteEmprise[3]) / 2]);
  let directionVersSoleil = [0, 1, 0], heureSoleil = null;
  const fondJour = new THREE.Color(P3.ciel), fondNuit = new THREE.Color(P3.cielNuit), fond = new THREE.Color();
  /** Règle le soleil, le ciel, la brume et les fenêtres éclairées pour une heure légale (décimale). */
  function definirHeure(heure) {
    if (heureSoleil !== null && Math.abs(heure - heureSoleil) < 1 / 60) return; // au plus une fois par minute de jeu
    heureSoleil = heure;
    const pos = positionSoleil(heure, S.soleilJour, latCentre, lonCentre, S.soleilDecalageUTC);
    const jour = partDeJour(pos.elevation, rad(S.crepusculeDegres), rad(S.pleinJourDegres));
    directionVersSoleil = directionSoleil(pos);
    // Bas sur l'horizon, le soleil rougit ; sous l'horizon, il s'éteint et la lumière diffuse bleuit
    const bas = 1 - Math.max(0, Math.min(1, pos.elevation / rad(25)));
    soleil.color.set(P3.lumiereSoleil).lerp(new THREE.Color(P3.lumiereCouchant), bas);
    soleil.intensity = S.lumiereSoleil * jour;
    soleil.castShadow = jour > 0.05;
    ciel.intensity = S.lumiereNuit + (S.lumiereCiel - S.lumiereNuit) * jour;
    ciel.color.set(P3.lumiereNuit).lerp(new THREE.Color(P3.lumiereCiel), jour);
    fond.copy(fondNuit).lerp(fondJour, jour);
    rendu.setClearColor(fond);
    scene.fog.color.copy(fond);
    facade.uNuit.value = 1 - jour;
    demander();
  }

  // ─── Caméra orbitale ─────────────────────────────────────────────────────
  let largeur = 1, hauteur = 1, actif = false, image = 0, vol = null, prete = false;
  const defaut = () => cadrer(boiteEmprise, largeur, hauteur, S.fovDegres, { inclinaison: rad(S.inclinaisonDefautDegres), margePx: S.margeEmprisePx });
  let etat = defaut();
  const mpp = () => metresParPixel(etat, hauteur, S.fovDegres);

  function dessiner() {
    image = 0;
    if (!actif || document.hidden) return;
    if (vol) {
      const t = Math.min(1, (performance.now() - vol.debut) / vol.duree);
      etat = interpoler(vol.de, vol.vers, t);
      if (t >= 1) vol = null;
    }
    const p = pose(etat);
    camera.position.set(...p.position);
    camera.up.set(...p.haut);
    camera.lookAt(...p.cible);
    camera.near = Math.max(1, etat.distance * S.planProche);
    camera.far = Math.max(S.planLointainMinM, etat.distance * S.planLointain);
    camera.updateProjectionMatrix();
    // Le soleil éclaire le point visé : la carte d'ombres couvre un carré autour de lui, à la mesure de la vue
    const demi = Math.min(S.ombreMaxM, Math.max(S.ombreMinM, etat.distance * S.ombreEtendue)) / 2, c = p.cible, loin = demi * 4;
    soleil.target.position.set(...c);
    soleil.position.set(c[0] + directionVersSoleil[0] * loin, c[1] + directionVersSoleil[1] * loin, c[2] + directionVersSoleil[2] * loin);
    Object.assign(soleil.shadow.camera, { left: -demi, right: demi, top: demi, bottom: -demi, near: 1, far: loin * 2 });
    soleil.shadow.camera.updateProjectionMatrix();
    scene.fog.near = etat.distance * S.brumeDebut;
    scene.fog.far = etat.distance * S.brumeFin;
    if ((choisi?.type === 'troncon' || choisi?.type === 'noeud') && Math.abs(largeurSelection() - largeurRuban) > largeurRuban * 0.2) dessinerSelection();
    rendu.render(scene, camera);
    prete = true;
    surRendu?.();
    if (vol) demander();
  }
  function demander() { if (!image && actif && !document.hidden) image = requestAnimationFrame(dessiner); }
  // Onglet caché : rien ne tourne ; un vol en cours est terminé d'un coup, l'image est refaite au retour
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(image); image = 0; if (vol) { etat = vol.vers; vol = null; } } else demander();
  });

  function definirEtat(e, { anime = false } = {}) {
    const vers = contraindre({ ...etat, ...e }, limites);
    if (anime && !mouvementReduit && actif) vol = { de: etat, vers, debut: performance.now(), duree: S.dureeVolMs };
    else { vol = null; etat = vers; }
    demander();
  }

  function redimensionner() {
    const r = conteneur.getBoundingClientRect();
    if (!r.width || !r.height) return;
    largeur = r.width; hauteur = r.height;
    rendu.setSize(largeur, hauteur, false);
    camera.aspect = largeur / hauteur;
    demander();
  }
  new ResizeObserver(redimensionner).observe(conteneur);
  redimensionner();
  etat = defaut();

  // ─── Viser : quel objet est sous un point de l'écran ? ───────────────────
  // Une couche « discrète » (v0.10 : axes et nœuds éteints par défaut en 3D) reste visée au clic et au clavier
  let discretes = new Set();
  const vise = c => groupes[c].visible || discretes.has(c);
  const rayon = new THREE.Raycaster(), planSol = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), v3 = new THREE.Vector3();
  function viser(x, y) {
    camera.updateMatrixWorld();
    rayon.setFromCamera(new THREE.Vector2((x / largeur) * 2 - 1, -(y / hauteur) * 2 + 1), camera);
    // 1. Un bâtiment en volume cache ce qui est derrière lui
    const touche = groupes.batiments.visible ? rayon.intersectObject(batiments, false)[0] : null;
    const rang = touche ? rangDuTriangle(mBatiments.debuts, touche.faceIndex) : -1;
    if (rang >= 0 && mBatiments.hauteurs[rang] !== null) return { type: 'batiment', id: mBatiments.ids[rang] };
    // 2. Sinon un nœud, puis l'axe le plus proche du point du sol visé, dans la tolérance de clic (en pixels, comme sur la carte)
    const sol3 = rayon.ray.intersectPlane(planSol, v3);
    if (sol3) {
      const p = depuisScene(sol3.toArray());
      const mppIci = (2 * camera.position.distanceTo(sol3) * Math.tan(rad(S.fovDegres) / 2)) / hauteur;
      const n = vise('intersections') ? noeudPres(p, Math.max(S.noeudRayonM * 1.5, mppIci * R.selection.toleranceNoeudPx)) : null;
      if (n) return { type: 'noeud', id: n };
      const id = vise('rues') ? tronconPres(p, mppIci * R.selection.toleranceClicPx) : null;
      if (id) return { type: 'troncon', id };
    }
    // 3. Sinon un bâtiment à plat (hauteur non renseignée)
    return rang >= 0 ? { type: 'batiment', id: mBatiments.ids[rang] } : null;
  }
  function noeudPres(p, tolerance = Infinity) {
    let meilleur = null, dMin = tolerance;
    for (const [id, q] of positionNoeud) {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d <= dMin) { dMin = d; meilleur = id; }
    }
    return meilleur;
  }
  function tronconPres(p, tolerance = Infinity) {
    let meilleur = null, dMin = tolerance;
    for (const [id, ligne] of mAxes.lignes) {
      const d = distancePointLigne(p, ligne).distance;
      if (d <= dMin) { dMin = d; meilleur = id; }
    }
    return meilleur;
  }

  // ─── Souris : glisser = déplacer, clic droit ou Maj + glisser = tourner, molette = zoom ─
  let prise = null, peinture = null, survol = null;
  canvas.addEventListener('pointerleave', () => survol?.(null));
  // Le point du sol sous un point de l'écran, en Lambert 72 (null : la caméra ne voit pas le sol là)
  function solSous(x, y) {
    camera.updateMatrixWorld();
    rayon.setFromCamera(new THREE.Vector2((x / largeur) * 2 - 1, -(y / hauteur) * 2 + 1), camera);
    const p = rayon.ray.intersectPlane(planSol, v3);
    if (!p) return null;
    const l = depuisScene(p.toArray());
    return [l[0] + repere.origine[0], l[1] + repere.origine[1]];
  }
  const ici = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    prise = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, tourne: e.button === 2 || e.shiftKey || e.ctrlKey, bouton: e.button, bouge: false };
    // Outil actif (v0.7) : le bouton gauche peint ; tourner reste au clic droit ou à Maj
    if (peinture && e.button === 0 && !prise.tourne) { prise.peint = true; const p = solSous(...ici(e)); if (p) peinture('debut', p); }
  });
  canvas.addEventListener('pointermove', e => {
    if (!prise) { if (survol) { const [x, y] = ici(e); survol(solSous(x, y), x, y); } return; } // v0.8 : la voie sous l'outil
    if (prise.peint) { prise.bouge = true; const p = solSous(...ici(e)); if (p) peinture?.('glisse', p); return; }
    const dx = e.clientX - prise.x, dy = e.clientY - prise.y;
    if (!prise.bouge && Math.hypot(e.clientX - prise.x0, e.clientY - prise.y0) < S.seuilClicPx) return;
    prise.bouge = true; prise.x = e.clientX; prise.y = e.clientY;
    definirEtat(prise.tourne ? tourner(etat, -dx * rad(S.rotationDegresParPx), -dy * rad(S.rotationDegresParPx)) : deplacer(etat, dx, dy, mpp()));
  });
  const lacher = e => {
    if (!prise) return;
    const clic = !prise.bouge && prise.bouton === 0 && e.type === 'pointerup';
    const peint = prise.peint;
    prise = null;
    if (peint) { peinture?.('fin', null); return; }
    if (clic) { const [x, y] = ici(e); surChoix?.(viser(x, y), { x, y }); }
  };
  canvas.addEventListener('pointerup', lacher);
  canvas.addEventListener('pointercancel', lacher);
  canvas.addEventListener('wheel', e => { e.preventDefault(); definirEtat(zoomer(etat, Math.exp(e.deltaY * S.zoomParCran))); }, { passive: false });

  return {
    canvas,
    stations,
    /** Active ou suspend le rendu (vue 2D affichée : la scène ne calcule rien). */
    activer(oui) { actif = oui; if (oui) { redimensionner(); demander(); } else { cancelAnimationFrame(image); image = 0; vol = null; } },
    etat: () => ({ ...etat, cible: [...etat.cible] }),
    definirEtat,
    pose: () => pose(etat),
    mpp,
    recentrer: () => definirEtat({ ...defaut(), azimut: 0 }, { anime: true }),
    deplacerPx: (dx, dy) => definirEtat(deplacer(etat, dx, dy, mpp()), { anime: true }),
    tourner: (dAzimut, dInclinaison) => definirEtat(tourner(etat, dAzimut, dInclinaison), { anime: true }),
    zoomer: f => definirEtat(zoomer(etat, f), { anime: true }),
    /** Met en évidence { type: 'troncon' | 'batiment' | 'noeud', id, noeuds? } ou rien (null). */
    selectionner(objet) { choisi = objet; dessinerSelection(); demander(); },
    surbrillance: () => choisi?.id ?? null,
    /** Trait de sélection fin (la section du tronçon choisi est dessinée) ou normal. */
    affinerSelection(v) { if (fin !== v) { fin = v; dessinerSelection(); demander(); } },
    /** Couches visibles ; `visees` : couches éteintes qu'on peut tout de même choisir (axes et nœuds discrets, v0.10). */
    definirCouches(couches, visees = []) { for (const [c, g] of Object.entries(groupes)) g.visible = couches[c] !== false; groupeCarrefours.visible = couches.sections !== false; discretes = new Set(visees); demander(); },
    /** L'heure légale (décimale) du trafic : place le soleil (v0.10). */
    definirHeure,
    soleil: () => ({ heure: heureSoleil, direction: [...directionVersSoleil], intensite: soleil.intensity, nuit: facade.uNuit.value, ombres: soleil.castShadow }),
    viser,
    tronconAuCentre: () => (vise('rues') ? tronconPres(etat.cible) : null),
    /** Position à l'écran (dans le conteneur) d'un point local à une hauteur donnée ; visible : devant la caméra. */
    versEcran(local, h = 0) {
      v3.set(...versScene(local, h)).project(camera);
      return { x: ((v3.x + 1) / 2) * largeur, y: ((1 - v3.y) / 2) * hauteur, visible: v3.z > -1 && v3.z < 1 };
    },
    /** Un point à l'intérieur de l'emprise d'un bâtiment (le centre du premier triangle de son toit), et sa hauteur. */
    pointSurBatiment(id) {
      const r = rangBatiment.get(id);
      if (r === undefined) return null;
      const i = mBatiments.debuts[r] * 3, s = k => mBatiments.indices[i + k] * 3, P3 = mBatiments.positions;
      const c = [0, 2].map(a => (P3[s(0) + a] + P3[s(1) + a] + P3[s(2) + a]) / 3);
      return { local: [c[0], -c[1]], hauteur: mBatiments.hauteurs[r] };
    },
    niveauAxe: id => niveauAxe.get(id) ?? null,
    /** Les sections à dessiner : [{ section, decalages }] (js/section.js) ; bande : "troncon:bande" mise en évidence. */
    definirSections(entrees, bande = null) { bandeChoisie = bande; dessinerSections(entrees); demander(); },
    /** Les carrefours à dessiner (v0.4) : [{ noeud, zone, traversees, raccords, complet }] en local ; voie : la voie entrante choisie. */
    definirCarrefours(entrees, voie = null) { dessinerCarrefours(entrees, voie); demander(); },
    /** Flèches de direction au sol (v0.7) : [{ anneau (local), couleur }]. */
    definirFleches,
    /** Outil actif (v0.7) : rappel(phase 'debut' | 'glisse' | 'fin', point Lambert 72) pendant un glisser au bouton gauche ; null : rien. */
    definirPeinture(rappel) { peinture = rappel; canvas.classList.toggle('peinture', !!rappel); },
    solSous,
    /** Survol (v0.8) : rappel(point Lambert 72 | null, x, y) quand la souris bouge sans bouton ; null : rien. */
    definirSurvol(rappel) { survol = rappel; },
    /** Les blocs du trafic (v0.6) : { mode → Float32Array [x, y, cap, …] } en Lambert 72. */
    definirTrafic,
    blocs: () => Object.fromEntries(Object.entries(blocs).map(([m, b]) => [m, { n: b.count, visible: b.visible && b.parent?.visible, premier: b.count ? [...b.instanceMatrix.array.slice(12, 15)] : null }])),
    /** Ce que la scène dessine des raccords : { "de>vers": { debut, fin, origine } } (local). */
    raccords: () => Object.fromEntries(carrefoursDessines.filter(e => e.complet).flatMap(e => e.raccords)
      .map(r => [`${r.de}>${r.vers}`, { debut: r.ligne[0], fin: r.ligne.at(-1), origine: r.origine }])),
    noeudAuCentre: () => (vise('intersections') ? noeudPres(etat.cible) : null),
    /** Ce que la scène dessine des sections : { "troncon:bande": { gauche, droite, type } }. */
    sections: () => Object.fromEntries(mSections.bandes),
    comptes: { batiments: mBatiments.ids.length, surfaces: mSurfaces.ids.length, troncons: mAxes.ids.length, triangles: (mBatiments.indices.length + mSurfaces.indices.length + mAxes.indices.length) / 3 },
    /** Dessine tout de suite (sans attendre l'image suivante) : sert à mesurer la première image. */
    dessinerMaintenant() { cancelAnimationFrame(image); image = 0; dessiner(); return prete; },
  };
}
