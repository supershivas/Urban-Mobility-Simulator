// La vue 3D du jeu beta (three.js) : sol vierge, routes, marquages, pistes
// cyclables, carrefours, véhicules en blocs, et l'aperçu de la route en projet.
// Ce module dessine et vise : il ne modifie jamais l'état (main.js décide).
// Repère : x est, y nord (mètres) → scène X = x, Y = haut, Z = −y.
import * as THREE from '../../vendor/three/three.module.js?v=0.9.6';
import { pose, metresParPixel } from '../scene/camera.js?v=0.9.6';
import { decalerLigne, sansDoublons } from '../geo/decalage.js?v=0.9.6';
import { longueur, pointA, sousLigne, busDe } from './reseau.js?v=0.9.6';
import { liaisonsVelo, largeurs } from './geometrie.js?v=0.9.6';
import { mouvementsDu, fleches, cle as cleVoie } from './mouvements.js?v=0.9.6';

const COUCHE = { sol: 7, limite: 6, trottoir: 5, bordure: 4, asphalte: 3, bus: 2.6, ilot: 2.3, velo: 2, marquage: 1, picto: 0, surlignage: -1, apercu: -2, ombre: -3 };

/** Un ruban entre les décalages g (gauche) et d (droite) d'une ligne : triangles à plat, poussés dans `out`. */
function ruban(out, ligne, g, d) {
  ligne = sansDoublons(ligne); // un point répété (aperçu de longueur nulle) n'a pas de normale
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

/** Un mot peint au sol (« BUS »), lu par qui arrive : le haut du canvas est le sens de marche. */
function textureTexte(texte, couleur) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = couleur; g.textAlign = 'center'; g.textBaseline = 'middle';
  // Allongé dans le sens de marche, comme les marquages réels (le texte est étiré en hauteur)
  g.setTransform(1, 0, 0, 2.4, 0, 0);
  g.font = 'bold 54px system-ui, sans-serif';
  g.fillText(texte, 64, 192 / 2 / 2.4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Une flèche au sol (haut du canvas = sens de marche) : toutdroit, gauche, droite, ou leurs combinaisons. */
function textureFleche(cle, couleur) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 192;
  const g = c.getContext('2d');
  g.strokeStyle = couleur; g.fillStyle = couleur; g.lineWidth = 9; g.lineCap = 'butt'; g.lineJoin = 'miter';
  const pointe = (x, y, ang) => { g.save(); g.translate(x, y); g.rotate(ang); g.beginPath(); g.moveTo(0, -16); g.lineTo(14, 10); g.lineTo(-14, 10); g.closePath(); g.fill(); g.restore(); };
  g.beginPath(); g.moveTo(32, 190); g.lineTo(32, 110); g.stroke(); // le fût
  for (const d of cle.split('+')) {
    if (d === 'toutdroit') { g.beginPath(); g.moveTo(32, 112); g.lineTo(32, 26); g.stroke(); pointe(32, 20, 0); }
    if (d === 'gauche') { g.beginPath(); g.moveTo(32, 120); g.quadraticCurveTo(32, 78, 14, 70); g.stroke(); pointe(10, 68, -Math.PI / 2.4); }
    if (d === 'droite') { g.beginPath(); g.moveTo(32, 120); g.quadraticCurveTo(32, 78, 50, 70); g.stroke(); pointe(54, 68, Math.PI / 2.4); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Le picto vélo, dessiné une fois dans un canvas (blanc sur transparent). */
function textureVelo(couleur) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = couleur; g.fillStyle = couleur; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round';
  // Comme sur une vraie piste : le vélo de profil, debout pour le cycliste qui arrive (roues de son
  // côté, en bas du canvas ; le haut du canvas est le sens de marche), tourné vers la droite.
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

  const aplat = (couche, plus = {}) => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: COUCHE[couche], polygonOffsetUnits: COUCHE[couche] * 4, ...plus });
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
    trottoir: aplat('trottoir', { color: P.trottoir }),
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
    texteBus: aplat('picto', { map: textureTexte('BUS', P.marquage), transparent: true, depthWrite: false }),
    bus: aplat('bus', { color: P.voieBus }),
    ilot: aplat('ilot', { color: P.trottoir }),
    plante: aplat('picto', { color: P.plante }),
    refuge: aplat('surlignage', { color: P.trottoir }),
    ilotCentral: aplat('ilot', { color: P.bordure }),
    planteCentrale: aplat('velo', { color: P.plante }),
    apron: aplat('velo', { color: P.trottoir }),
    mouvement: aplat('apercu', { color: P.apercu, transparent: true, opacity: 0.85, depthWrite: false }),
    mouvementRefus: aplat('apercu', { color: P.refus, transparent: true, opacity: 0.85, depthWrite: false }),
    poigneeEntree: aplat('apercu', { color: P.marquage, depthWrite: false }),
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
    const trot = [], bord = [], asph = [], velo = [], marq = [], plante = [], refuge = [], ilotC = [], planteC = [], apron = [];
    const Lv = R.largeurVoie, w = 0.15, A = R.accotement, Tw = R.largeurTrottoir, Lp = R.largeurTraversee;
    const bus = [], ilots = [], textesBus = [], sasPictos = [];
    const brancheDe = (n, id, sens) => geo.noeuds[n].branches.find(x => x.troncon === id && x.sens === sens);
    for (const [id, t] of Object.entries(reseau.troncons)) {
      const g = geo.troncons[id], axe = g.axe, La = longueur(axe);
      ruban(trot, axe, g.g + A + Tw, -(g.d + A + Tw));
      ruban(bord, axe, g.g + A, -(g.d + A));
      ruban(asph, axe, g.g, -g.d);
      // Les lignes de voie s'arrêtent à la ligne d'arrêt : rien ne se peint sur les passages ni dans le sas
      const coupe = (n, sens) => { const b = brancheDe(n, id, sens); return geo.noeuds[n].traversees ? Math.max(b.arret, b.arretPassage) - 0.2 : 0; };
      const c0 = Math.min(coupe(t.a, 1), La / 2), c1 = Math.min(coupe(t.b, -1), La / 2);
      const lignes = c0 + c1 < La - 1 ? sousLigne(axe, c0, La - c1) : null;
      const m = largeurs(t, R).mediane;
      if (lignes) {
        // Axe : tirets sur une 2 voies, ligne continue doublée à partir de 2 × 2 (on ne dépasse pas) ;
        // avec un îlot central, une ligne continue de chaque côté de l'îlot
        if (m) for (const sg of [1, -1]) ruban(marq, lignes, sg * (m - 0.05) + w / 2, sg * (m - 0.05) - w / 2);
        else if (t.voies === 1) tirets(marq, lignes, 0, w, 3, 6);
        else { ruban(marq, lignes, 0.12 + w / 2, 0.12 - w / 2); ruban(marq, lignes, -0.12 + w / 2, -0.12 - w / 2); }
        for (let k = 1; k < t.voies; k++) for (const sg of [1, -1]) {
          // Une voie bus se sépare des autres par une ligne continue large
          const versBus = busDe(t)[sg === 1 ? 'g' : 'd'] && k === t.voies - 1, o = sg * (m + k * Lv);
          if (versBus) ruban(marq, lignes, o + 0.15, o - 0.15); else tirets(marq, lignes, o, w, 3, 6);
        }
        // Rives : la ligne au bord de la chaussée automobile
        for (const sg of [1, -1]) ruban(marq, lignes, sg * (m + t.voies * Lv - 0.1) + w / 2, sg * (m + t.voies * Lv - 0.1) - w / 2);
        // L'îlot central, entre les lignes d'arrêt : zone peinte hachurée (refuges) ou terre-plein planté et bordé
        if (t.ilot === 'refuges') {
          const Lm = longueur(lignes);
          for (let s0 = 1; s0 + 0.5 < Lm; s0 += 2.5) { const seg = sousLigne(lignes, s0, s0 + 0.5); ruban(marq, seg, m - 0.2, -m + 0.2); }
        } else if (t.ilot === 'terreplein') {
          ruban(bord, lignes, m - 0.1, -m + 0.1); ruban(plante, sousLigne(lignes, 0.3, Math.max(0.4, longueur(lignes) - 0.3)), m - 0.4, -m + 0.4);
        }
      }
      // Voies bus : la voie la plus à droite de chaque sens, teintée, avec « BUS » au sol
      for (const [k, sg, sens] of [['g', 1, -1], ['d', -1, 1]]) {
        if (!busDe(t)[k]) continue;
        const x1 = m + t.voies * Lv, x0 = x1 - Lv;
        ruban(bus, axe, sg === 1 ? x1 : -x0, sg === 1 ? x0 : -x1);
        const ligne = g.voies[sens][t.voies - 1], L = longueur(ligne);
        for (let s = 15; s < L - 10; s += 45) textesBus.push(pointA(ligne, s));
      }
      // Pistes, de chaque côté : simple, ou à double sens (tirets blancs au milieu)
      const x0 = largeurs(t, R).x0;
      for (const [k, sg] of [['g', 1], ['d', -1]]) {
        const p = t.pistes[k];
        if (!p) continue;
        const l = p === 'double' ? R.largeurPisteDouble : R.largeurPiste;
        ruban(velo, axe, sg === 1 ? x0 + l : -x0, sg === 1 ? x0 : -(x0 + l));
        if (p === 'double') tirets(marq, axe, sg * (x0 + l / 2), 0.12, 1.5, 2.5);
      }
    }
    // Hors des carrefours protégés (un simple passage d'un tronçon à l'autre) : la piste continue tout droit
    for (const l of liaisonsVelo(reseau, geo)) ruban(velo, l, 0.8, -0.8);
    for (const n of Object.values(geo.noeuds)) {
      if (n.zone) {
        // Carrefour protégé : la chaussée se resserre (zone et amorces), les îlots de coin sont du trottoir
        eventail(asph, n.zone); eventail(bord, agrandir(n.zone, n.p, A)); eventail(trot, agrandir(n.zoneTotale, n.p, A + Tw));
        for (const q of n.amorces || []) { eventail(asph, q); eventail(bord, agrandir(q, [(q[0][0] + q[3][0]) / 2, (q[0][1] + q[3][1]) / 2], A)); }
      } else if (n.virage) {
        // Un virage entre deux tronçons : la route suit une courbe, marquages compris
        const v = n.virage, t0 = reseau.troncons[v.troncon], l0 = largeurs(t0, R), m = l0.mediane, ax = v.axe;
        ruban(trot, ax, v.g + A + Tw, -(v.d + A + Tw)); ruban(bord, ax, v.g + A, -(v.d + A)); ruban(asph, ax, v.g, -v.d);
        if (m) for (const sg of [1, -1]) ruban(marq, ax, sg * (m - 0.05) + w / 2, sg * (m - 0.05) - w / 2);
        else if (t0.voies === 1) tirets(marq, ax, 0, w, 3, 6);
        else { ruban(marq, ax, 0.12 + w / 2, 0.12 - w / 2); ruban(marq, ax, -0.12 + w / 2, -0.12 - w / 2); }
        for (let k = 1; k < t0.voies; k++) for (const sg of [1, -1]) tirets(marq, ax, sg * (m + k * Lv), w, 3, 6);
        for (const sg of [1, -1]) ruban(marq, ax, sg * (m + t0.voies * Lv - 0.1) + w / 2, sg * (m + t0.voies * Lv - 0.1) - w / 2);
        const [b0, b1] = n.branches;
        for (const [p, sg] of [[b0.pisteD || b1.pisteG, 1], [b0.pisteG || b1.pisteD, -1]]) {
          if (!p) continue;
          const l = p === 'double' ? R.largeurPisteDouble : R.largeurPiste;
          ruban(velo, ax, sg === 1 ? l0.x0 + l : -l0.x0, sg === 1 ? l0.x0 : -(l0.x0 + l));
        }
      } else if (n.degre === 1 && !n.bord) {
        // Impasse : un bout arrondi
        const demi = geo.troncons[n.branches[0].troncon].demi;
        eventail(asph, disque(n.p, demi)); eventail(bord, disque(n.p, demi + A)); eventail(trot, disque(n.p, demi + A + Tw));
      }
      if (!n.traversees) continue;
      if (n.giratoire) {
        // Rond-point : l'îlot central (planté, ou franchissable pour un mini-giratoire), la voie intérieure en tirets
        const G = n.giratoire;
        eventail(ilotC, disque(n.p, G.interieur, 48));
        eventail(G.plante ? planteC : apron, disque(n.p, G.interieur - (G.plante ? 0.6 : 1.2), 48));
        if (G.voies === 2) { const r = G.rayon - (G.rayon - G.interieur) / 2, c = disque(n.p, r, 64); tirets(marq, [...c, c[0]], 0, w, 3, 3); }
      }
      if (n.anneau) {
        // Carrefour protégé : l'anneau cyclable (coins autour d'un îlot, traversées bordées de tirets)
        for (const c of n.anneau.coins) {
          ruban(velo, c.ligne, c.largeur / 2, -c.largeur / 2);
          // L'îlot de coin : entre le bord de la chaussée automobile et l'intérieur du coin cyclable
          const b = n.branches[c.i], b2 = n.branches[(c.i + 1) % n.degre];
          const pa = pointA(b.ext, 0), pz = pointA(b2.ext, 0);
          const ca = [pa.p[0] - pa.dir[1] * (b.voitureG + 0.3), pa.p[1] + pa.dir[0] * (b.voitureG + 0.3)];
          const cz = [pz.p[0] + pz.dir[1] * (b2.voitureD + 0.3), pz.p[1] - pz.dir[0] * (b2.voitureD + 0.3)];
          const interieur = decalerLigne(c.ligne, c.largeur / 2 + 0.25);
          void ca; void cz; void interieur; // l'îlot est le trottoir laissé entre la zone des voitures et la piste
        }
        for (const tr of n.anneau.traversees) {
          const l = tr.largeur;
          ruban(velo, tr.ligne, l / 2, -l / 2);
          for (const o of [l / 2, -l / 2]) tirets(marq, tr.ligne, o, 0.18, 0.5, 0.5);
          if (tr.double) tirets(marq, tr.ligne, 0, 0.12, 0.8, 0.8); // à double sens : une ligne au milieu
        }
      }
      for (const b of n.branches) {
        const t = reseau.troncons[b.troncon], lt = largeurs(t, R), V = lt.voiture, m = lt.mediane;
        // Passage piéton (sauf s'il a fusionné avec celui d'à côté) : des bandes blanches sur la chaussée automobile
        // seulement (la piste continue en vert à travers le passage, comme dans la réalité)
        if (b.passage) {
          const bande = sousLigne(b.ext, b.z0 + 0.15, b.z0 + Lp - 0.15);
          for (let o = -V + 0.25; o + 0.5 <= V - 0.1; o += 1) if (o + 0.5 <= -m || o >= m) ruban(marq, bande, o + 0.5, o);
          // Le refuge : un îlot surélevé au droit du passage, un peu plus long que lui
          if (m) { const r = sousLigne(b.ext, Math.max(0.2, b.z0 - 0.8), b.z0 + Lp + 0.8); ruban(bord, r, m, -m); ruban(refuge, r, m - 0.25, -m + 0.25); }
        }
        // Rond-point : « cédez le passage » à l'entrée de l'anneau, des dents de requin sur les files qui arrivent
        if (n.giratoire) {
          const q = pointA(b.ext, Math.max(0.3, b.arret - 0.4)), nrm = [-q.dir[1], q.dir[0]];
          for (let o = m + 0.3; o + 0.5 <= V - 0.1; o += 0.9) {
            const base = k => [q.p[0] + nrm[0] * k, q.p[1] + nrm[1] * k], pointe = [q.p[0] + nrm[0] * (o + 0.25) + q.dir[0] * 0.7, q.p[1] + nrm[1] * (o + 0.25) + q.dir[1] * 0.7];
            eventail(marq, [base(o), base(o + 0.5), pointe]);
          }
        }
        // Ligne d'arrêt des files qui arrivent (à gauche de la branche vue depuis le nœud)
        const arretVelo = b.arret - b.sas;
        if (!n.giratoire) ruban(marq, sousLigne(b.ext, arretVelo - 0.2, arretVelo + 0.2), Math.max(V - 0.1, b.gauche - 0.1), m);
        if (b.sas) {
          // Sas vélo : la ligne des voitures recule ; entre les deux, une zone verte et un vélo par voie
          ruban(marq, sousLigne(b.ext, b.arret - 0.2, b.arret + 0.2), V - 0.1, m);
          ruban(velo, sousLigne(b.ext, arretVelo + 0.2, b.arret - 0.2), V - 0.15, m + 0.15);
          for (let k = 0; k < t.voies; k++) {
            const q = pointA(b.ext, (arretVelo + b.arret) / 2), o = m + (k + 0.5) * Lv;
            sasPictos.push({ p: [q.p[0] - q.dir[1] * o, q.p[1] + q.dir[0] * o], dir: [-q.dir[0], -q.dir[1]] });
          }
        }
      }
    }
    const ilotsPos = [];
    for (const poly of ilots) eventail(ilotsPos, poly);
    groupeReseau.add(maillage(trot, materiaux.trottoir), maillage(bord, materiaux.bordure), maillage(asph, materiaux.asphalte), maillage(bus, materiaux.bus), maillage(ilotsPos, materiaux.ilot), maillage(velo, materiaux.velo), maillage(marq, materiaux.marquage), maillage(plante, materiaux.plante), maillage(refuge, materiaux.refuge), maillage(ilotC, materiaux.ilotCentral), maillage(planteC, materiaux.planteCentrale), maillage(apron, materiaux.apron));
    // Flèches au sol : sur chaque voie qui arrive à un carrefour, les directions qu'elle permet
    const parFleche = {};
    for (const [id, n] of Object.entries(geo.noeuds)) {
      if (n.degre < 3 || n.giratoire) continue;
      const mv = mouvementsDu(reseau, n, id);
      for (const b of n.branches) {
        const t = reseau.troncons[b.troncon], m = largeurs(t, R).mediane, ext = b.ext, L = longueur(ext), s0 = Math.max(b.arret, b.arretPassage) + 6;
        if (s0 > L - 3) continue;
        const q = pointA(ext, s0), nrm = [-q.dir[1], q.dir[0]];
        for (let k = 0; k < t.voies; k++) {
          const dirs = fleches(n, mv, cleVoie({ troncon: b.troncon, sens: -b.sens, voie: k }));
          if (!dirs.length) continue;
          const o = m + (k + 0.5) * Lv;
          (parFleche[dirs.join('+')] ??= []).push({ p: [q.p[0] + nrm[0] * o, q.p[1] + nrm[1] * o], dir: [-q.dir[0], -q.dir[1]] });
        }
      }
    }
    for (const [cle, liste] of Object.entries(parFleche)) poser(liste, materiauFleche(cle), 1.6, 4.8);
    // Pictos vélo, tous les 30 m, dans le sens de marche de chaque file (deux par piste à double sens)
    const pictos = [];
    for (const g of Object.values(geo.troncons)) if (g.pistes) for (const sens of [1, -1]) for (const l of g.pistes[sens]) {
      const L = longueur(l);
      for (let s = sens === 1 ? 12 : 27; s < L - 6; s += 30) pictos.push(pointA(l, s));
    }
    pictos.push(...sasPictos);
    poser(textesBus, materiaux.texteBus, 2.2, 3.4);
    if (pictos.length) {
      const plan = new THREE.PlaneGeometry(1.3, 2.0).rotateX(-Math.PI / 2); // allongé dans le sens de marche, comme un marquage au sol
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
    majMats(reseau, geo);
    demanderRendu();
  }

  // ─── Feux : un mât par branche, la tête voiture en haut, la tête vélo (plus petite) plus bas ──
  const matFeu = new THREE.MeshLambertMaterial({ color: P.vitre });
  const lampe = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const boite = new THREE.BoxGeometry(1, 1, 1);
  let signaux = []; // { noeud, i, p, dir, velo }
  const mats = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6).translate(0, 0.5, 0), matFeu, 400);
  const tetes = new THREE.InstancedMesh(boite, matFeu, 800);
  const lampes = new THREE.InstancedMesh(boite, lampe, 800);
  for (const im of [mats, tetes, lampes]) { im.count = 0; im.frustumCulled = false; scene.add(im); }
  mats.castShadow = tetes.castShadow = true;
  const TETE = { voiture: { y: 2.4, h: 1.0, l: 0.38, lampe: 0.3 }, velo: { y: 1.25, h: 0.6, l: 0.24, lampe: 0.18 } };
  function majMats(reseau, geo) {
    signaux = [];
    for (const [id, n] of Object.entries(geo.noeuds)) {
      if (!reseau.noeuds[id]?.feux || n.degre < 3) continue;
      n.branches.forEach((b, i) => signaux.push({ noeud: id, i, p: b.feu.p, dir: pointA(b.ext, 0).dir, velo: b.feu.velo }));
    }
    let nt = 0;
    signaux.forEach((s, k) => {
      const haut = TETE.voiture.y + TETE.voiture.h;
      mats.setMatrixAt(k, m4.compose(pos.set(s.p[0], 0, -s.p[1]), qv.identity(), ech.set(1, haut, 1)));
      qv.setFromAxisAngle(yv, Math.atan2(s.dir[1], s.dir[0]));
      for (const type of s.velo ? ['voiture', 'velo'] : ['voiture']) {
        const T = TETE[type];
        tetes.setMatrixAt(nt++, m4.compose(pos.set(s.p[0], T.y, -s.p[1]), qv, ech.set(T.l, T.h, T.l)));
      }
    });
    mats.count = signaux.length; tetes.count = nt;
    mats.instanceMatrix.needsUpdate = tetes.instanceMatrix.needsUpdate = true;
  }
  const teinte = { rouge: new THREE.Color(P.feuRouge), orange: new THREE.Color(P.feuOrange), vert: new THREE.Color(P.feuVert) };
  const RANG = { rouge: 2, orange: 1, vert: 0 }; // de bas en haut : vert, orange, rouge
  /** etats : { [nœud]: etatFeux(…) } — une lampe allumée par tête, à sa place (rouge en haut). */
  function majFeux(etats) {
    let nl = 0;
    for (const s of signaux) {
      const c = etats[s.noeud]?.couleurs[s.i] ?? 'rouge';
      qv.setFromAxisAngle(yv, Math.atan2(s.dir[1], s.dir[0]));
      for (const type of s.velo ? ['voiture', 'velo'] : ['voiture']) {
        const T = TETE[type], y = T.y + (T.h / 3) * (RANG[c] + 0.5);
        // Face aux files qui arrivent : du côté de la branche, devant la tête
        const k = T.l / 2 + 0.01;
        lampes.setMatrixAt(nl, m4.compose(pos.set(s.p[0] + s.dir[0] * k, y, -(s.p[1] + s.dir[1] * k)), qv, ech.set(0.04, T.lampe, T.lampe)));
        lampes.setColorAt(nl++, teinte[c]);
      }
    }
    lampes.count = nl;
    lampes.instanceMatrix.needsUpdate = true;
    if (lampes.instanceColor) lampes.instanceColor.needsUpdate = true;
    demanderRendu();
  }

  const fleches_ = {};
  const materiauFleche = cle => (fleches_[cle] ??= aplat('picto', { map: textureFleche(cle, P.marquage), transparent: true, depthWrite: false }));

  // ─── Vue « Mouvements » : les liaisons voie à voie du carrefour choisi, et les poignées à tirer ──
  const groupeMouvements = new THREE.Group();
  scene.add(groupeMouvements);
  /** liens : [{ ligne, survol }], entrees / sorties : [p], apercu : { ligne, refus } | null. */
  function majMouvements(vue) {
    vider(groupeMouvements);
    if (!vue) { demanderRendu(); return; }
    const ok = [], surv = [];
    for (const l of vue.liens) ruban(l.survol ? surv : ok, l.ligne, l.survol ? 0.35 : 0.2, l.survol ? -0.35 : -0.2);
    groupeMouvements.add(maillage(ok, materiaux.mouvement), maillage(surv, materiaux.mouvementRefus));
    if (vue.apercu) { const a = []; ruban(a, vue.apercu.ligne, 0.3, -0.3); groupeMouvements.add(maillage(a, vue.apercu.refus ? materiaux.mouvementRefus : materiaux.mouvement)); }
    const poignee = (liste, mat, r) => { const out = []; for (const p of liste) eventail(out, disque(p, r, 16)); groupeMouvements.add(maillage(out, mat)); };
    poignee(vue.sorties, materiaux.anneau, 0.7);
    poignee(vue.entrees, materiaux.poigneeEntree, 0.8);
    demanderRendu();
  }

  /** Des marquages au sol (une texture), posés à plat dans le sens de marche. */
  function poser(liste, materiau, l, h) {
    if (!liste.length) return;
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(l, h).rotateX(-Math.PI / 2), materiau, liste.length);
    im.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), axeY = new THREE.Vector3(0, 1, 0);
    liste.forEach(({ p, dir }, i) => {
      q.setFromAxisAngle(axeY, Math.atan2(dir[1], dir[0]) - Math.PI / 2);
      im.setMatrixAt(i, m.compose(new THREE.Vector3(p[0], 0, -p[1]), q, new THREE.Vector3(1, 1, 1)));
    });
    groupeReseau.add(im);
  }
  // Un polygone convexe agrandi de d autour de son centre (bordure du carrefour)
  function agrandir(poly, c, d) {
    return poly.map(p => { const dx = p[0] - c[0], dy = p[1] - c[1], l = Math.hypot(dx, dy) || 1; return [p[0] + (dx / l) * d, p[1] + (dy / l) * d]; });
  }

  // ─── Survol : tronçon surligné, route en projet, anneaux ─────────────────
  function majSurvol({ troncon = null, projet = null, point = null, refus = false, carrefour = null } = {}) {
    vider(groupeSurvol);
    if (troncon) {
      // Tout le tronçon, ou un seul côté (piste à double sens)
      const out = [], g = troncon.g + 0.8, d = troncon.d + 0.8;
      ruban(out, troncon.ligne, troncon.cote === 'droite' ? 0 : g, troncon.cote === 'gauche' ? 0 : -d);
      groupeSurvol.add(maillage(out, troncon.demolir ? materiaux.refus : materiaux.surlignage));
    }
    if (carrefour) anneau(carrefour.p, carrefour.refus, carrefour.rayon, carrefour.rayon + 1.2);
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
  function anneau(p, refus, r0 = 3.2, r1 = 4.2) {
    const out = [], n = 32;
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
  const couleurs = P.voitures.map(c => new THREE.Color(c)), teinteBus = new THREE.Color(P.bus);
  const m4 = new THREE.Matrix4(), qv = new THREE.Quaternion(), yv = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), ech = new THREE.Vector3();

  // Piétons : un bloc fin, de la couleur de ses vêtements
  const pietons = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), lambert(0xffffff), 800);
  pietons.castShadow = true; pietons.count = 0; pietons.frustumCulled = false; pietons.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(pietons);
  const teintesPietons = P.pietons.map(c => new THREE.Color(c));
  /** liste : [{ x, y, cap, echelle, id }] ; d : dimensions d'un piéton. */
  function majPietons(liste, d) {
    let n = 0;
    for (const p of liste) {
      if (p.echelle <= 0.01 || n >= 800) continue;
      qv.setFromAxisAngle(yv, p.cap);
      pietons.setMatrixAt(n, m4.compose(pos.set(p.x, 0, -p.y), qv, ech.set(d.longueur, d.hauteur * p.echelle, d.largeur)));
      pietons.setColorAt(n++, teintesPietons[p.id % teintesPietons.length]);
    }
    pietons.count = n;
    pietons.instanceMatrix.needsUpdate = true;
    if (pietons.instanceColor) pietons.instanceColor.needsUpdate = true;
  }

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
      if (v.mode === 'bus') {
        // Un bus : une longue caisse ocre, un bandeau de vitres sur toute la longueur
        // Caisse pleine hauteur (le toit reste ocre vu d'en haut), bandeau de vitres un peu en saillie sur les flancs
        caisse.setMatrixAt(nc, m4.compose(pos.set(v.x, 0.3 * k, -v.y), qv, ech.set(d.longueur * k, (d.hauteur - 0.3) * k, d.largeur * k)));
        caisse.setColorAt(nc, teinteBus);
        vitres.setMatrixAt(nc, m4.compose(pos.set(v.x, d.hauteur * 0.5 * k, -v.y), qv, ech.set(d.longueur * 0.92 * k, d.hauteur * 0.3 * k, d.largeur * 1.03 * k)));
        nc++;
        continue;
      }
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
    canvas, majReseau, majSurvol, majVehicules, majPietons, majFeux, majMouvements, dessinerLimite, appliquerCamera, sousPointeur, versEcran, rendre, demanderRendu,
    get etatCamera() { return etatCamera; },
    get taille() { return [largeur, hauteur]; },
    metresParPixel: () => metresParPixel(etatCamera, hauteur, C.fov),
  };
}
