// La vue 3D du jeu beta (three.js) : sol vierge, routes, marquages, pistes
// cyclables, carrefours, véhicules en blocs, et l'aperçu de la route en projet.
// Ce module dessine et vise : il ne modifie jamais l'état (main.js décide).
// Repère : x est, y nord (mètres) → scène X = x, Y = haut, Z = −y.
import * as THREE from '../../vendor/three/three.module.js?v=0.9.0';
import { pose, metresParPixel } from '../scene/camera.js?v=0.9.0';
import { decalerLigne } from '../geo/decalage.js?v=0.9.0';
import { longueur, pointA, sousLigne } from './reseau.js?v=0.9.0';

const COUCHE = { sol: 6, limite: 5, bordure: 4, asphalte: 3, velo: 2, marquage: 1, picto: 0, surlignage: -1, apercu: -2, ombre: -3 };

/** Un ruban entre les décalages g (gauche) et d (droite) d'une ligne : triangles à plat, poussés dans `out`. */
function ruban(out, ligne, g, d) {
  if (ligne.length < 2) return;
  const A = decalerLigne(ligne, g), B = decalerLigne(ligne, d);
  for (let i = 1; i < ligne.length; i++) {
    const a0 = A[i - 1], a1 = A[i], b0 = B[i - 1], b1 = B[i];
    out.push(a0[0], 0, -a0[1], b0[0], 0, -b0[1], a1[0], 0, -a1[1], a1[0], 0, -a1[1], b0[0], 0, -b0[1], b1[0], 0, -b1[1]);
  }
}
/** Un polygone convexe (éventail). */
function eventail(out, poly) {
  for (let i = 1; i < poly.length - 1; i++) out.push(poly[0][0], 0, -poly[0][1], poly[i][0], 0, -poly[i][1], poly[i + 1][0], 0, -poly[i + 1][1]);
}
const disque = (c, r, n = 24) => Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos((2 * Math.PI * i) / n), c[1] + r * Math.sin((2 * Math.PI * i) / n)]);
/** Les tirets d'une ligne (longueurs en m), chacun un ruban. */
function tirets(out, ligne, decalage, largeur, plein, vide) {
  const L = longueur(ligne);
  for (let s = vide / 2; s + plein <= L; s += plein + vide) ruban(out, sousLigne(ligne, s, s + plein), decalage + largeur / 2, decalage - largeur / 2);
}

/** Le picto vélo, dessiné une fois dans un canvas (blanc sur transparent). */
function textureVelo(couleur) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = couleur; g.fillStyle = couleur; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round';
  // Vu du dessus, la roue avant vers le haut du canvas (sens de marche)
  g.translate(64, 64); g.rotate(-Math.PI / 2); g.translate(-64, -64);
  g.beginPath(); g.arc(32, 80, 20, 0, 2 * Math.PI); g.stroke();
  g.beginPath(); g.arc(96, 80, 20, 0, 2 * Math.PI); g.stroke();
  g.beginPath(); g.moveTo(32, 80); g.lineTo(54, 48); g.lineTo(84, 48); g.lineTo(96, 80); g.moveTo(54, 48); g.lineTo(64, 80); g.lineTo(84, 48); g.moveTo(84, 48); g.lineTo(80, 36); g.lineTo(90, 36); g.moveTo(50, 40); g.lineTo(60, 40); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * conteneur : élément qui reçoit le canvas ; P : PALETTE_BETA ; R : ROUTE ; C : CAMERA.
 */
export function creerSceneBeta({ conteneur, P, R, C }) {
  const rendu = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  rendu.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  rendu.setClearColor(P.sol);
  rendu.shadowMap.enabled = true;
  const canvas = rendu.domElement;
  canvas.className = 'beta-canvas';
  conteneur.prepend(canvas);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(P.sol, 400, 1500);
  const camera = new THREE.PerspectiveCamera(C.fov, 1, 1, 6000);

  const aplat = (couche, plus = {}) => new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: COUCHE[couche], polygonOffsetUnits: COUCHE[couche] * 4, ...plus });
  const maillage = (positions, materiau) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.Mesh(g, materiau);
  };

  // Sol, ombres portées (un calque qui ne montre que l'ombre), limite de la carte constructible
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), aplat('sol', { color: P.sol }));
  sol.rotation.x = -Math.PI / 2;
  scene.add(sol);
  const ombre = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.ShadowMaterial({ opacity: 0.18, depthWrite: false, polygonOffset: true, polygonOffsetFactor: COUCHE.ombre, polygonOffsetUnits: COUCHE.ombre * 4 }));
  ombre.rotation.x = -Math.PI / 2;
  ombre.receiveShadow = true;
  ombre.renderOrder = 10; // dessinée en dernier, sans écrire la profondeur : elle ne masque ni pictos ni aperçu
  scene.add(ombre);

  const lumiere = new THREE.DirectionalLight(0xffffff, 2.2);
  lumiere.castShadow = true;
  lumiere.shadow.mapSize.set(2048, 2048);
  scene.add(lumiere, lumiere.target, new THREE.HemisphereLight(0xffffff, 0x888888, 1.6));

  const materiaux = {
    bordure: aplat('bordure', { color: P.bordure }),
    asphalte: aplat('asphalte', { color: P.asphalte }),
    velo: aplat('velo', { color: P.velo }),
    marquage: aplat('marquage', { color: P.marquage }),
    limite: aplat('limite', { color: P.limite }),
    surlignage: aplat('surlignage', { color: P.surlignage, transparent: true, opacity: 0.35, depthWrite: false }),
    apercu: aplat('apercu', { color: P.apercu, transparent: true, opacity: 0.6, depthWrite: false }),
    refus: aplat('apercu', { color: P.refus, transparent: true, opacity: 0.6, depthWrite: false }),
    anneau: aplat('apercu', { color: P.apercu, depthWrite: false }),
    anneauRefus: aplat('apercu', { color: P.refus, depthWrite: false }),
    picto: aplat('picto', { map: textureVelo(P.marquage), transparent: true, depthWrite: false }),
  };

  const groupeReseau = new THREE.Group(), groupeSurvol = new THREE.Group();
  scene.add(groupeReseau, groupeSurvol);

  /** La limite de la carte constructible : un filet carré. */
  function dessinerLimite(zone) {
    const out = [], c = [[-zone, -zone], [zone, -zone], [zone, zone], [-zone, zone], [-zone, -zone]];
    tirets(out, c, 0, 1.2, 8, 6);
    scene.add(maillage(out, materiaux.limite));
  }

  const vider = g => { for (const o of [...g.children]) { g.remove(o); o.geometry?.dispose(); } };

  /** Redessine tout le réseau depuis sa géométrie (geometrie.js). */
  function majReseau(reseau, geo) {
    vider(groupeReseau);
    const bord = [], asph = [], velo = [], marq = [];
    const Lv = R.largeurVoie, w = 0.15;
    for (const [id, t] of Object.entries(reseau.troncons)) {
      const g = geo.troncons[id], axe = g.axe, demi = g.demi;
      ruban(bord, axe, demi + R.accotement, -demi - R.accotement);
      ruban(asph, axe, demi, -demi);
      // Axe : tirets sur une 2 voies, ligne continue doublée sur une 2 × 2 (on ne dépasse pas)
      if (t.voies === 1) tirets(marq, axe, 0, w, 3, 6);
      else { ruban(marq, axe, 0.12 + w / 2, 0.12 - w / 2); ruban(marq, axe, -0.12 + w / 2, -0.12 - w / 2); }
      for (let k = 1; k < t.voies; k++) for (const sg of [1, -1]) tirets(marq, axe, sg * k * Lv, w, 3, 6);
      // Rives : la ligne au bord de la chaussée automobile
      for (const sg of [1, -1]) ruban(marq, axe, sg * (t.voies * Lv - 0.1) + w / 2, sg * (t.voies * Lv - 0.1) - w / 2);
      if (t.velo) {
        const x0 = t.voies * Lv + R.separateurPiste, x1 = x0 + R.largeurPiste;
        for (const sg of [1, -1]) ruban(velo, axe, sg === 1 ? x1 : -x0, sg === 1 ? x0 : -x1);
      }
    }
    for (const [id, n] of Object.entries(geo.noeuds)) {
      if (n.zone) { eventail(asph, n.zone); eventail(bord, agrandir(n.zone, n.p, R.accotement)); }
      else if (n.degre === 1 && !n.bord) {
        // Impasse : un bout arrondi
        const b = n.branches[0], demi = geo.troncons[b.troncon].demi;
        eventail(asph, disque(n.p, demi)); eventail(bord, disque(n.p, demi + R.accotement));
      }
      // Lignes d'arrêt en entrée de carrefour (au moins trois branches)
      if (n.degre >= 3) for (const b of n.branches) {
        const t = reseau.troncons[b.troncon], g = geo.troncons[b.troncon];
        // La branche vue depuis le carrefour : on arrive par le sens opposé à celui qui en part
        const ext = b.sens === 1 ? g.axe : g.axe.slice().reverse();
        const bout = sousLigne(ext, 0, 0.4);
        ruban(marq, bout, t.voies * Lv - 0.1, 0); // à gauche de la branche qui part = les files qui arrivent
      }
    }
    groupeReseau.add(maillage(bord, materiaux.bordure), maillage(asph, materiaux.asphalte), maillage(velo, materiaux.velo), maillage(marq, materiaux.marquage));
    // Pictos vélo, tous les 30 m, dans le sens de marche
    const pictos = [];
    for (const g of Object.values(geo.troncons)) if (g.pistes) for (const sens of [1, -1]) {
      const l = g.pistes[sens], L = longueur(l);
      for (let s = 12; s < L - 6; s += 30) pictos.push(pointA(l, s));
    }
    if (pictos.length) {
      const plan = new THREE.PlaneGeometry(1.4, 1.4).rotateX(-Math.PI / 2);
      const im = new THREE.InstancedMesh(plan, materiaux.picto, pictos.length);
      im.frustumCulled = false; // la sphère englobante serait celle d'un seul picto, à l'origine
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), axeY = new THREE.Vector3(0, 1, 0);
      pictos.forEach(({ p, dir }, i) => {
        // Le haut du picto (−Z de la texture couchée) pointe dans le sens de marche
        q.setFromAxisAngle(axeY, Math.atan2(dir[1], dir[0]) - Math.PI / 2);
        im.setMatrixAt(i, m.compose(new THREE.Vector3(p[0], 0, -p[1]), q, new THREE.Vector3(1, 1, 1)));
      });
      groupeReseau.add(im);
    }
    demanderRendu();
  }
  // Un polygone convexe agrandi de d autour de son centre (bordure du carrefour)
  function agrandir(poly, c, d) {
    return poly.map(p => { const dx = p[0] - c[0], dy = p[1] - c[1], l = Math.hypot(dx, dy) || 1; return [p[0] + (dx / l) * d, p[1] + (dy / l) * d]; });
  }

  // ─── Survol : tronçon surligné, route en projet, anneaux ─────────────────
  function majSurvol({ troncon = null, projet = null, point = null, refus = false } = {}) {
    vider(groupeSurvol);
    if (troncon) { const out = []; ruban(out, troncon.ligne, troncon.demi + 0.8, -troncon.demi - 0.8); groupeSurvol.add(maillage(out, materiaux.surlignage)); }
    if (projet) {
      const out = [], demi = R.largeurVoie;
      ruban(out, projet.points, demi, -demi);
      groupeSurvol.add(maillage(out, projet.refus ? materiaux.refus : materiaux.apercu));
      // L'axe de la route en projet, en tirets blancs
      const axe = []; tirets(axe, projet.points, 0, 0.2, 3, 6);
      groupeSurvol.add(maillage(axe, materiaux.marquage));
      anneau(projet.depart.p, projet.refus);
      if (!projet.fin.libre) anneau(projet.fin.p, projet.refus);
    }
    if (point) anneau(point, refus);
    demanderRendu();
  }
  function anneau(p, refus) {
    const out = [], n = 32, r0 = 3.2, r1 = 4.2;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n, b = (2 * Math.PI * (i + 1)) / n;
      const q = [[r1 * Math.cos(a), r1 * Math.sin(a)], [r0 * Math.cos(a), r0 * Math.sin(a)], [r1 * Math.cos(b), r1 * Math.sin(b)], [r0 * Math.cos(b), r0 * Math.sin(b)]].map(v => [p[0] + v[0], 0, -(p[1] + v[1])]);
      out.push(...q[0], ...q[1], ...q[2], ...q[2], ...q[1], ...q[3]);
    }
    groupeSurvol.add(maillage(out, refus ? materiaux.anneauRefus : materiaux.anneau));
  }

  // ─── Véhicules : des blocs instanciés (caisse + vitres) ──────────────────
  const MAX = 500;
  const lambert = c => new THREE.MeshLambertMaterial({ color: c });
  const caisse = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), lambert(0xffffff), MAX);
  const vitres = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), lambert(P.vitre), MAX);
  // Un vélo : un cadre bas et fin, et le cycliste (un bloc vert) posé dessus
  const velos = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), lambert(P.vitre), MAX);
  const cyclistes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), lambert(P.cycliste), MAX);
  for (const im of [caisse, vitres, velos, cyclistes]) { im.castShadow = true; im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); }
  const couleurs = P.voitures.map(c => new THREE.Color(c));
  const m4 = new THREE.Matrix4(), qv = new THREE.Quaternion(), yv = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), ech = new THREE.Vector3();

  /** liste : [{ mode, x, y, cap, echelle, id }], V : dimensions par mode. */
  function majVehicules(liste, V) {
    let nc = 0, nv = 0;
    for (const v of liste) {
      if (v.echelle <= 0.01) continue;
      // Le cap est mesuré depuis l'est (x) vers le nord ; la boîte s'allonge selon X de la scène
      qv.setFromAxisAngle(yv, v.cap);
      const d = V[v.mode], k = v.echelle;
      if (v.mode === 'velo') {
        if (nv >= MAX) continue;
        velos.setMatrixAt(nv, m4.compose(pos.set(v.x, 0.25 * k, -v.y), qv, ech.set(d.longueur * k, d.hauteur * 0.35 * k, d.largeur * 0.25 * k)));
        cyclistes.setMatrixAt(nv++, m4.compose(pos.set(v.x, d.hauteur * 0.5 * k, -v.y), qv, ech.set(d.longueur * 0.3 * k, d.hauteur * 0.5 * k, d.largeur * k)));
        continue;
      }
      if (nc >= MAX) continue;
      caisse.setMatrixAt(nc, m4.compose(pos.set(v.x, 0, -v.y), qv, ech.set(d.longueur * k, d.hauteur * 0.62 * k, d.largeur * k)));
      caisse.setColorAt(nc, couleurs[v.id % couleurs.length]);
      // Les vitres : un bloc plus court, posé sur la caisse, un peu en arrière
      const recul = -0.12 * d.longueur * k, c = Math.cos(v.cap), s = Math.sin(v.cap);
      vitres.setMatrixAt(nc, m4.compose(pos.set(v.x + c * recul, d.hauteur * 0.62 * k, -(v.y + s * recul)), qv, ech.set(d.longueur * 0.5 * k, d.hauteur * 0.38 * k, d.largeur * 0.9 * k)));
      nc++;
    }
    caisse.count = vitres.count = nc; velos.count = cyclistes.count = nv;
    for (const im of [caisse, vitres, velos, cyclistes]) im.instanceMatrix.needsUpdate = true;
    if (caisse.instanceColor) caisse.instanceColor.needsUpdate = true;
    demanderRendu();
  }

  // ─── Caméra, visée, rendu ────────────────────────────────────────────────
  let etatCamera = null, largeur = 1, hauteur = 1, sale = true;
  function demanderRendu() { sale = true; }
  function redimensionner() {
    const r = conteneur.getBoundingClientRect();
    largeur = Math.max(1, r.width); hauteur = Math.max(1, r.height);
    rendu.setSize(largeur, hauteur, false);
    camera.aspect = largeur / hauteur;
    camera.updateProjectionMatrix();
    sale = true;
  }
  new ResizeObserver(redimensionner).observe(conteneur);
  redimensionner();

  function appliquerCamera(e) {
    etatCamera = e;
    const p = pose(e);
    camera.position.set(...p.position);
    camera.up.set(...p.haut);
    camera.lookAt(...p.cible);
    camera.near = Math.max(0.5, e.distance / 60);
    camera.far = e.distance * 12 + 2000;
    camera.updateProjectionMatrix();
    scene.fog.near = e.distance * 1.6 + 200;
    scene.fog.far = e.distance * 4 + 900;
    // L'ombre suit le point visé (une boîte à la taille de la vue)
    const [cx, , cz] = p.cible, portee = Math.min(900, e.distance * 1.6 + 40);
    lumiere.position.set(cx - 120, 300, cz + 180);
    lumiere.target.position.set(cx, 0, cz);
    Object.assign(lumiere.shadow.camera, { left: -portee, right: portee, top: portee, bottom: -portee, near: 10, far: 900 });
    lumiere.shadow.camera.updateProjectionMatrix();
    sale = true;
  }

  const rayon = new THREE.Raycaster(), ndc = new THREE.Vector2(), plan = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), touche = new THREE.Vector3();
  /** Le point du sol sous un pixel du conteneur : [x, y] en mètres, ou null (au-dessus de l'horizon). */
  function sousPointeur(px, py) {
    ndc.set((px / largeur) * 2 - 1, -(py / hauteur) * 2 + 1);
    rayon.setFromCamera(ndc, camera);
    return rayon.ray.intersectPlane(plan, touche) ? [touche.x, -touche.z] : null;
  }
  /** Le pixel d'un point du sol (pour poser une étiquette). */
  function versEcran(p) {
    const v = new THREE.Vector3(p[0], 0, -p[1]).project(camera);
    return [(v.x + 1) / 2 * largeur, (1 - v.y) / 2 * hauteur];
  }

  function rendre() {
    if (!sale) return false;
    rendu.render(scene, camera);
    sale = false;
    return true;
  }

  return {
    canvas, majReseau, majSurvol, majVehicules, dessinerLimite, appliquerCamera, sousPointeur, versEcran, rendre, demanderRendu,
    get etatCamera() { return etatCamera; },
    get taille() { return [largeur, hauteur]; },
    metresParPixel: () => metresParPixel(etatCamera, hauteur, C.fov),
  };
}
