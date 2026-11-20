// Le jeu beta « Carte blanche » : réseau (tracé en arc, découpe, refus), géométrie, trafic.
import { basculerBus, basculerPisteDouble, basculerFeux, reglerFeu, coteDe, feuxDe } from '../js/beta/reseau.js';
import { etatFeux, cycle } from '../js/beta/feux.js';
import { posePieton } from '../js/beta/pietons.js';
import { reseauDepart, tracerArc, projetRoute, construireRoute, viser, accroche, basculerVoies, basculerVelo, demolir, branches, longueur, relireReseau } from '../js/beta/reseau.js';
import { geometrieReseau, enveloppe } from '../js/beta/geometrie.js';
import { preparerTrafic, creerTrafic, avancer, reconcilier, compter, sources, aCeder } from '../js/beta/roulage.js';
import { pointA } from '../js/beta/reseau.js';
import { ROUTE, TRACE, TRAFIC, VEHICULES, FEUX, PIETONS } from '../js/beta/donnees.js';

const depart = () => reseauDepart({ longueur: 1100 }); // plus courte que DEPART : les voitures traversent vite
/** Tire une route depuis le point (x, 0) de la route de départ jusqu'à `fin`. */
function tirer(reseau, de, fin) {
  const v = viser(reseau, de, TRACE.visee);
  const a = accroche(reseau, v, TRACE);
  return projetRoute(reseau, a, fin, ROUTE, TRACE);
}

group('beta — tracé');
test('l\'arc part perpendiculairement à la route, du côté du pointeur, et finit au pointeur', () => {
  const t = tracerArc({ p: [0, 0], dir: [1, 0] }, [60, 80], 4);
  const d = [t.points[1][0] - t.points[0][0], t.points[1][1] - t.points[0][1]];
  assert.ok(Math.abs(d[0]) < 0.6 * Math.abs(d[1]) && d[1] > 0, 'part vers le nord');
  assert.deepEqual(t.points.at(-1), [60, 80]);
  const bas = tracerArc({ p: [0, 0], dir: [1, 0] }, [0, -50], 4);
  assert.equal(bas.rayon, Infinity);
  assert.ok(bas.points[1][1] < 0);
});
test('une route droite perpendiculaire se construit et coupe la route de départ en deux', () => {
  const r0 = depart();
  const p = tirer(r0, [0, 0], [0, 120]);
  assert.equal(p.refus, undefined);
  const { reseau, troncon } = construireRoute(r0, p, TRACE);
  assert.equal(Object.keys(reseau.troncons).length, 3);
  const t = reseau.troncons[troncon];
  assert.equal(branches(reseau, t.a).length, 3, 'un carrefour en T');
  assert.equal(branches(reseau, t.b).length, 1, 'une impasse');
  assert.ok(Math.abs(longueur(t.points) - 120) < 0.01);
  assert.equal(r0.troncons.t1.points.length, 2, 'le réseau de départ n\'est pas modifié');
});
test('les refus sont dits : trop court, trop serré, trop près, hors carte, bord', () => {
  const r0 = depart();
  assert.equal(tirer(r0, [0, 0], [0, 15]).refus, 'court');
  assert.equal(tirer(r0, [0, 0], [35, 12]).refus, 'serre');
  assert.equal(tirer(r0, [0, 0], [0, 700]).refus, 'hors');
  assert.equal(tirer(r0, [540, 0], [540, 100]).refus, 'bord');
  const { reseau } = construireRoute(r0, tirer(r0, [0, 0], [0, 150]), TRACE);
  assert.equal(tirer(reseau, [8, 0], [8, 150]).refus, 'angle', 'au carrefour même, deux branches presque superposées');
  assert.equal(tirer(reseau, [30, 0], [-30, 140]).refus, 'proche');
});
test('l\'arrivée sur une autre route fait un carrefour', () => {
  let r = depart();
  r = construireRoute(r, tirer(r, [0, 0], [0, 150]), TRACE).reseau;
  const p = tirer(r, [100, 0], [3, 97]);
  assert.equal(p.refus, undefined);
  assert.equal(p.fin.libre, undefined);
  const { reseau, troncon } = construireRoute(r, p, TRACE);
  const t = reseau.troncons[troncon];
  assert.equal(branches(reseau, t.a).length, 3);
  assert.equal(branches(reseau, t.b).length, 3);
});
test('doubler les voies et ajouter une piste cyclable, puis revenir', () => {
  const r0 = depart();
  const r1 = basculerVoies(r0, 't1', ROUTE, TRACE).reseau;
  assert.equal(r1.troncons.t1.voies, 2);
  const r3 = basculerVoies(r1, 't1', ROUTE, TRACE).reseau, r4 = basculerVoies(r3, 't1', ROUTE, TRACE).reseau;
  assert.deepEqual([r3.troncons.t1.voies, r4.troncons.t1.voies], [3, 4], '3 × 3 puis 4 × 4');
  assert.equal(basculerVoies(r4, 't1', ROUTE, TRACE).reseau.troncons.t1.voies, 1, 'au-delà de 4 × 4 : retour à 2 voies');
  assert.equal(basculerVoies(r3, 't1', ROUTE, TRACE, -1).reseau.troncons.t1.voies, 2, 'Maj + clic : une de moins');
  assert.equal(basculerVoies(r0, 't1', ROUTE, TRACE, -1).refus, 'uneVoie');
  const r2 = basculerVelo(r1, 't1', ROUTE, TRACE).reseau;
  assert.deepEqual(r2.troncons.t1.pistes, { g: 'simple', d: 'simple' });
  const g = geometrieReseau(r2, ROUTE).troncons.t1;
  assert.equal(g.voies[1].length, 2);
  assert.ok(g.pistes);
  assert.equal(g.demi, 2 * 3 + 0.5 + 1.75);
  assert.ok(basculerVoies(r0, 'inconnu', ROUTE).refus);
});
test('démolir une impasse referme le carrefour : la route de départ redevient un seul tronçon', () => {
  const r0 = depart();
  const { reseau, troncon } = construireRoute(r0, tirer(r0, [0, 0], [0, 120]), TRACE);
  const r = demolir(reseau, troncon).reseau;
  assert.equal(Object.keys(r.troncons).length, 1);
  assert.equal(Object.keys(r.noeuds).length, 2);
  const t = Object.values(r.troncons)[0];
  assert.ok(Math.abs(longueur(t.points) - 1100) < 0.01);
  assert.equal(demolir(r, Object.keys(r.troncons)[0]).refus, 'bordDemolir', 'la route qui mène au bord reste');
});
test('démolir un tronçon entre deux carrefours referme les deux ; des voies différentes ne se recollent pas', () => {
  let r = depart();
  r = construireRoute(r, tirer(r, [0, 0], [0, 150]), TRACE).reseau;
  r = construireRoute(r, tirer(r, [100, 0], [3, 97]), TRACE).reseau;
  const milieu = Object.entries(r.troncons).find(([, t]) => t.points.every(p => p[1] === 0) && t.points.every(p => p[0] >= -1 && p[0] <= 201))[0];
  const avant = Object.keys(r.troncons).length;
  const apres = demolir(r, milieu).reseau;
  assert.equal(Object.keys(apres.troncons).length, avant - 3, 'un tronçon démoli, deux paires recollées');
  assert.equal(Object.values(apres.noeuds).filter(n => branches(apres, Object.keys(apres.noeuds).find(k => apres.noeuds[k] === n)).length === 2).length, 0, 'plus aucun nœud de passage');
  // Sur la route nouvelle : une moitié en 2 × 2, l'autre non → le nœud reste quand on démolit la diagonale
  const diag = Object.keys(r.troncons).at(-1);
  const nord = Object.entries(r.troncons).find(([id, t]) => id !== diag && t.points.at(-1)[1] > 140)[0];
  const r2 = basculerVoies(r, nord, ROUTE, TRACE).reseau;
  assert.ok(Object.keys(demolir(r2, diag).reseau.troncons).length === Object.keys(r2.troncons).length - 2, 'la route de départ se recolle, pas la route nord');
});
test('la sauvegarde relue est le même réseau', () => {
  let r = depart();
  r = construireRoute(r, tirer(r, [0, 0], [60, 140]), TRACE).reseau;
  r = basculerVelo(r, Object.keys(r.troncons)[0], ROUTE, TRACE).reseau;
  assert.deepEqual(relireReseau(JSON.parse(JSON.stringify(r))), r);
  assert.equal(relireReseau({ noeuds: {}, troncons: { t: { a: 'x', b: 'y', points: [] } } }), null);
});

group('beta — géométrie');
test('les voies roulent à droite et la zone du carrefour couvre le nœud', () => {
  let r = depart();
  r = construireRoute(r, tirer(r, [0, 0], [0, 150]), TRACE).reseau;
  const geo = geometrieReseau(r, ROUTE);
  const ouest = Object.entries(r.troncons).find(([, t]) => t.points[0][0] < -500)[0];
  assert.ok(geo.troncons[ouest].voies[1][0][0][1] < 0, 'vers l\'est : au sud de l\'axe');
  assert.ok(geo.troncons[ouest].voies[-1][0][0][1] > 0, 'vers l\'ouest : au nord');
  const carrefour = Object.values(geo.noeuds).find(n => n.degre === 3);
  assert.ok(carrefour.recul > ROUTE.largeurVoie);
  assert.ok(carrefour.zone.length >= 4);
  assert.equal(enveloppe([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]]).length, 4);
});

group('beta — trafic');
function simuler(reseau, secondes, graine = 7, P = null) {
  const ctx = preparerTrafic(reseau, ROUTE, FEUX), etat = creerTrafic(TRAFIC, graine);
  for (let i = 0; i < secondes * 30; i++) avancer(etat, ctx, TRAFIC, VEHICULES, 1 / 30, P);
  return { ctx, etat };
}
function sansChevauchement(etat) {
  // Deux véhicules ne sont jamais l'un sur l'autre (centres à moins d'un mètre ; deux vélos de front : 0,5 m)
  const pos = etat.vehicules.map(v => pointA(v.ligne, v.s).p);
  for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
    const a = etat.vehicules[i], b = etat.vehicules[j], seuil = a.mode === 'velo' && b.mode === 'velo' ? 0.5 : 1;
    assert.ok(Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]) > seuil, `véhicules ${a.id} (${a.mode}, ${a.etape}) et ${b.id} (${b.mode}, ${b.etape})`);
  }
}
test('des voitures passent à intervalle sur la route de départ, dans les deux sens', () => {
  const { etat } = simuler(depart(), 200);
  assert.ok(etat.sortis.voiture > 30, `${etat.sortis.voiture} sorties`);
  const sens = new Set(etat.vehicules.map(v => v.voie.sens));
  assert.deepEqual([...sens].sort(), [-1, 1]);
  sansChevauchement(etat);
});
test('au carrefour, les voitures tournent dans la route nouvelle et en sortent', () => {
  let r = depart();
  r = construireRoute(r, tirer(r, [0, 0], [0, 150]), TRACE).reseau;
  const { etat, ctx } = simuler(r, 200);
  const nouvelle = Object.keys(r.troncons).at(-1);
  assert.ok(etat.vehicules.some(v => v.voie.troncon === nouvelle), 'quelqu\'un roule sur la nouvelle route');
  assert.ok(etat.sortis.voiture > 20, `${etat.sortis.voiture}`);
  sansChevauchement(etat);
  assert.equal(sources(ctx, TRAFIC).filter(s => s.mode === 'voiture').length, 3);
});
test('même graine, même trafic', () => {
  let r = depart();
  r = construireRoute(r, tirer(r, [0, 0], [0, 150]), TRACE).reseau;
  const a = simuler(r, 60, 3).etat, b = simuler(r, 60, 3).etat;
  assert.deepEqual(a.vehicules.map(v => [v.id, v.s.toFixed(3)]), b.vehicules.map(v => [v.id, v.s.toFixed(3)]));
});
test('des vélos roulent sur la piste cyclable', () => {
  const r = basculerVelo(depart(), 't1', ROUTE, TRACE).reseau;
  const { etat } = simuler(r, 320);
  assert.ok(compter(etat).velo > 0);
  assert.ok(etat.sortis.velo > 5);
  assert.ok(etat.vehicules.filter(v => v.mode === 'velo').every(v => ['velo', 'velo2'].includes(v.voie.voie)));
});
test('après une modification, les véhicules restent sur leur voie', () => {
  const r0 = depart();
  const { etat } = simuler(r0, 60);
  const avant = etat.vehicules.length;
  const r1 = basculerVoies(r0, 't1', ROUTE, TRACE).reseau;
  reconcilier(etat, preparerTrafic(r1, ROUTE, FEUX));
  assert.ok(etat.vehicules.length >= avant - 2, `${avant} → ${etat.vehicules.length}`);
});
test('2 × 2 voies avec pistes et deux carrefours : le trafic tourne sans se chevaucher', () => {
  let r = depart();
  r = construireRoute(r, tirer(r, [0, 0], [0, 150]), TRACE).reseau;
  r = construireRoute(r, tirer(r, [100, 0], [3, 97]), TRACE).reseau;
  for (const id of Object.keys(r.troncons)) r = basculerVelo(basculerVoies(r, id, ROUTE, TRACE).reseau, id, ROUTE, TRACE).reseau;
  const { etat } = simuler(r, 240);
  assert.ok(etat.sortis.voiture > 20, `${etat.sortis.voiture}`);
  assert.ok(etat.sortis.velo > 5);
  sansChevauchement(etat);
});

group('noms de fichiers');
test('aucun module servi au joueur ne porte un nom que les bloqueurs de publicités refusent', async () => {
  // Vu deux fois : js/trafic.js (0.6.0) puis js/beta/trafic.js (0.9.0), « main.js introuvable » chez Jérôme
  const { readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const interdits = /trafic|traffic|stats|analytic|track|counter|(^|[-_.])ads?([-_.]|$)|beacon|pixel/i;
  const parcourir = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? parcourir(p) : [p]; });
  for (const f of [...parcourir('js'), ...parcourir('css')]) assert.ok(!interdits.test(f.split('/').pop()), f);
});

group('beta — pistes à double sens, feux, piétons');
const carrefourT = () => { const r = depart(); return construireRoute(r, tirer(r, [0, 0], [0, 150]), TRACE).reseau; };
const noeudT = r => Object.keys(r.noeuds).find(n => branches(r, n).length === 3);
test('une piste à double sens d\'un côté : les deux sens roulent sur le même côté, chacun à sa droite', () => {
  const r = basculerPisteDouble(depart(), 't1', coteDe(depart(), 't1', [0, 5]), ROUTE, TRACE).reseau;
  assert.deepEqual(r.troncons.t1.pistes, { g: 'double', d: null }, 'au nord, vu d\'ouest en est');
  const g = geometrieReseau(r, ROUTE).troncons.t1;
  const yEst = g.pistes[1][0][0][1], yOuest = g.pistes[-1][0][0][1];
  assert.ok(yEst > 0 && yOuest > 0, 'les deux au nord de l\'axe');
  assert.ok(yOuest > yEst, 'vers l\'ouest : le côté extérieur (sa droite)');
  assert.equal(g.d, ROUTE.largeurVoie, 'au sud : la chaussée seule');
  assert.deepEqual(basculerPisteDouble(r, 't1', 'gauche', ROUTE, TRACE).reseau.troncons.t1.pistes, { g: null, d: null }, 'second clic : retirée');
  assert.deepEqual(basculerVelo(r, 't1', ROUTE, TRACE).reseau.troncons.t1.pistes, { g: 'simple', d: 'simple' });
});
test('deux pistes à double sens : chaque sens a deux files, une de chaque côté', () => {
  let r = basculerPisteDouble(depart(), 't1', 'gauche', ROUTE, TRACE).reseau;
  r = basculerPisteDouble(r, 't1', 'droite', ROUTE, TRACE).reseau;
  assert.deepEqual(r.troncons.t1.pistes, { g: 'double', d: 'double' });
  const g = geometrieReseau(r, ROUTE).troncons.t1;
  assert.equal(g.pistes[1].length, 2);
  assert.ok(g.pistes[1][0][0][1] < 0 && g.pistes[1][1][0][1] > 0, 'vers l\'est : au sud d\'abord, au nord ensuite');
  const { etat } = simuler(r, 300);
  assert.ok(etat.sortis.velo > 40, `${etat.sortis.velo} vélos sortis`);
  assert.ok(etat.vehicules.some(v => v.voie.voie === 'velo2'), 'des vélos sur la piste d\'en face');
});
test('trop large : refusé au-delà de largeurMax, ou s\'il mord sur une route voisine', () => {
  let r = depart();
  for (let k = 0; k < 3; k++) r = basculerVoies(r, 't1', ROUTE, TRACE).reseau; // 4 × 4 : 24 m
  r = basculerPisteDouble(r, 't1', 'gauche', ROUTE, TRACE).reseau; // + 3 m = 27 m
  assert.equal(basculerPisteDouble(r, 't1', 'droite', ROUTE, TRACE).refus, 'large');
  assert.equal(basculerVelo(r, 't1', ROUTE, TRACE).refus, 'large');
  // Deux routes parallèles à 14 m l'une de l'autre : la première ne s'élargit pas jusqu'à mordre sur la seconde
  let q = { v: 1, suivant: 9, noeuds: { a: { x: 0, y: 0 }, b: { x: 0, y: 150 }, c: { x: 14, y: 0 }, d: { x: 14, y: 150 } },
    troncons: { u: { a: 'a', b: 'b', points: [[0, 0], [0, 150]], voies: 1, pistes: { g: null, d: null } }, w: { a: 'c', b: 'd', points: [[14, 0], [14, 150]], voies: 1, pistes: { g: null, d: null } } } };
  const nord = 'u';
  let refus = null;
  for (let k = 0; k < 3 && !refus; k++) { const res = basculerVoies(q, nord, ROUTE, TRACE); refus = res.refus; q = res.reseau ?? q; }
  assert.equal(refus, 'chevauche');
});
test('les anciennes sauvegardes (velo, piste) deviennent des pistes par côté', () => {
  const vieux = JSON.parse(JSON.stringify(depart()));
  delete vieux.troncons.t1.pistes; vieux.troncons.t1.velo = true;
  assert.deepEqual(relireReseau(vieux).troncons.t1.pistes, { g: 'simple', d: 'simple' });
  const v2 = JSON.parse(JSON.stringify(depart()));
  delete v2.troncons.t1.pistes; v2.troncons.t1.piste = 'droite';
  assert.deepEqual(relireReseau(v2).troncons.t1.pistes, { g: null, d: 'double' });
});
test('carrefour en angle aigu : chaque branche recule assez pour que deux passages ne se touchent jamais', () => {
  // Un carrefour à la main : est, ouest, et une branche à 62° de l\'est (limite basse)
  const a = (62 * Math.PI) / 180, pts = [[100, 0], [-100, 0], [100 * Math.cos(a), 100 * Math.sin(a)]];
  const r = { v: 1, suivant: 10, noeuds: { c: { x: 0, y: 0 } }, troncons: {} };
  pts.forEach((p, i) => { r.noeuds[`n${i}`] = { x: p[0], y: p[1] }; r.troncons[`t${i}`] = { a: 'c', b: `n${i}`, points: [[0, 0], p], voies: 2, pistes: { g: 'double', d: 'simple' } }; });
  const geo = geometrieReseau(r, ROUTE);
  const passages = Object.values(geo.pietons.points).flatMap(p => p.liens.filter(l => l.traversee)).map(l => l.ligne);
  const proche = (u, v) => Math.min(...[0, 0.25, 0.5, 0.75, 1].flatMap(i => [0, 0.25, 0.5, 0.75, 1].map(j => {
    const p = [u[0][0] + (u[1][0] - u[0][0]) * i, u[0][1] + (u[1][1] - u[0][1]) * i], q = [v[0][0] + (v[1][0] - v[0][0]) * j, v[0][1] + (v[1][1] - v[0][1]) * j];
    return Math.hypot(p[0] - q[0], p[1] - q[1]);
  })));
  for (let i = 0; i < passages.length; i++) for (let j = i + 1; j < passages.length; j++) {
    const u = passages[i], v = passages[j];
    if (Math.hypot(u[0][0] - v[1][0], u[0][1] - v[1][1]) < 0.01 && Math.hypot(u[1][0] - v[0][0], u[1][1] - v[0][1]) < 0.01) continue; // le même passage, dans l\'autre sens
    assert.ok(proche(u, v) > ROUTE.largeurTraversee, `passages ${i} et ${j} à ${proche(u, v).toFixed(1)} m`);
  }
  const recul = id => geo.noeuds.c.branches.find(b => b.troncon === id).recul;
  assert.ok(recul('t0') > recul('t1') + 5 && recul('t2') > recul('t1') + 5, `les deux branches de l\'angle aigu reculent plus : ${['t0', 't1', 't2'].map(id => recul(id).toFixed(1))}`);
});
test('les feux : posés sur un carrefour seulement, une phase par branche puis les piétons, durées bornées', () => {
  const r = carrefourT(), n = noeudT(r);
  assert.equal(basculerFeux(r, 'n1', FEUX).refus, 'pasCarrefour');
  const r1 = basculerFeux(r, n, FEUX).reseau;
  assert.deepEqual(feuxDe(r1, n, FEUX).verts, [FEUX.vert, FEUX.vert, FEUX.vert]);
  const r2 = reglerFeu(r1, n, 1, +100, FEUX).reseau;
  assert.equal(feuxDe(r2, n, FEUX).verts[1], FEUX.max);
  assert.equal(feuxDe(reglerFeu(r1, n, 'pietons', -100, FEUX).reseau, n, FEUX).pietons, FEUX.min);
  const f = feuxDe(r1, n, FEUX), C = cycle(f, FEUX);
  assert.equal(C, 3 * (FEUX.vert + FEUX.orange + FEUX.rougeIntegral) + FEUX.vertPietons + FEUX.orange + FEUX.rougeIntegral);
  assert.deepEqual(etatFeux(f, FEUX, 1).couleurs, ['vert', 'rouge', 'rouge']);
  assert.deepEqual(etatFeux(f, FEUX, FEUX.vert + 1).couleurs, ['orange', 'rouge', 'rouge']);
  assert.equal(etatFeux(f, FEUX, C - FEUX.vertPietons - FEUX.orange - FEUX.rougeIntegral + 1).pietons, true);
  assert.equal(basculerFeux(r1, n, FEUX).reseau.noeuds[n].feux, undefined, 'second clic : retirés');
});
test('aux feux, seules les voitures de la branche au vert sont dans le carrefour', () => {
  const r = basculerFeux(carrefourT(), noeudT(carrefourT()), FEUX).reseau, n = noeudT(r);
  const ctx = preparerTrafic(r, ROUTE, FEUX), etat = creerTrafic(TRAFIC, 5);
  let vus = 0;
  for (let i = 0; i < 240 * 30; i++) {
    avancer(etat, ctx, TRAFIC, VEHICULES, 1 / 30, PIETONS);
    const dedans = etat.vehicules.filter(v => v.etape === 'raccord' && (v.voie.sens === 1 ? r.troncons[v.voie.troncon].b : r.troncons[v.voie.troncon].a) === n);
    const bras = new Set(dedans.map(v => v.voie.troncon));
    assert.ok(bras.size <= 1, `t = ${etat.t.toFixed(1)} : ${[...bras]}`);
    vus += dedans.length ? 1 : 0;
  }
  assert.ok(vus > 100 && etat.sortis.voiture > 20, `${vus} pas avec du monde dans le carrefour, ${etat.sortis.voiture} sorties`);
});
test('des piétons marchent, traversent, et aucun véhicule ne roule sur un passage occupé', () => {
  for (const feux of [false, true]) {
    let r = carrefourT();
    if (feux) r = basculerFeux(r, noeudT(r), FEUX).reseau;
    const ctx = preparerTrafic(r, ROUTE, FEUX), etat = creerTrafic(TRAFIC, 9);
    let traverses = 0;
    for (let i = 0; i < 200 * 30; i++) {
      avancer(etat, ctx, TRAFIC, VEHICULES, 1 / 30, PIETONS);
      for (const p of etat.pietons) {
        if (!p.lien.traversee || p.attend || p.s < 0.5) continue;
        traverses++;
        const q = posePieton(p, PIETONS);
        for (const v of etat.vehicules) {
          const c = pointA(v.ligne, v.s).p;
          assert.ok(Math.hypot(c[0] - q.x, c[1] - q.y) > 1.2, `feux ${feux}, t = ${etat.t.toFixed(1)} : véhicule ${v.id} sur le piéton ${p.id}`);
        }
      }
    }
    assert.ok(etat.pietons.length > 30, `${etat.pietons.length} piétons`);
    assert.ok(traverses > 100, `feux ${feux} : ${traverses} pas de traversée`);
    assert.ok(etat.sortis.voiture > 15, `feux ${feux} : ${etat.sortis.voiture} voitures sorties`);
  }
});
test('le réseau piéton : chaque point a un lien, les impasses se contournent, le carrefour a trois passages', () => {
  const r = carrefourT(), geo = geometrieReseau(r, ROUTE);
  const pts = Object.values(geo.pietons.points);
  assert.ok(pts.every(p => p.liens.length >= 1));
  const passages = new Set(pts.flatMap(p => p.liens.filter(l => l.traversee).map(l => l.traversee)));
  assert.equal(passages.size, 3);
  assert.ok(pts.some(p => p.liens.some(l => l.coin && l.ligne.length > 2)), 'le tour de l\'impasse');
});

group('beta — bus, carrefour protégé, passages');
test('voie bus : il faut deux voies ; les voitures n\'y roulent jamais, les bus si', () => {
  let r = depart();
  assert.equal(basculerBus(r, 't1', 'droite').refus, 'busUneVoie');
  r = basculerVoies(r, 't1', ROUTE, TRACE).reseau;
  r = basculerBus(r, 't1', 'droite').reseau;
  r = basculerBus(r, 't1', 'gauche').reseau;
  assert.deepEqual(r.troncons.t1.bus, { g: true, d: true });
  const ctx = preparerTrafic(r, ROUTE, FEUX), etat = creerTrafic(TRAFIC, 4);
  let bus = 0;
  for (let i = 0; i < 200 * 30; i++) {
    avancer(etat, ctx, TRAFIC, VEHICULES, 1 / 30);
    for (const v of etat.vehicules) {
      if (v.mode === 'voiture') assert.notEqual(v.voie.voie, 1, `voiture ${v.id} sur la voie bus`);
      if (v.mode === 'bus') { bus++; assert.equal(v.voie.voie, 1); }
    }
  }
  assert.ok(bus > 0 && etat.sortis.bus > 2, `${etat.sortis.bus} bus sortis`);
  assert.equal(basculerVoies(r, 't1', ROUTE, TRACE, -1).reseau.troncons.t1.bus.d, false, 'une seule voie : plus de voie bus');
});
test('carrefour protégé : les vélos font le tour par l\'anneau, et aucun véhicule ne roule sur un vélo qui traverse', () => {
  let r = carrefourT();
  for (const id of Object.keys(r.troncons)) r = basculerVelo(r, id, ROUTE, TRACE).reseau;
  const geo = geometrieReseau(r, ROUTE), n = geo.noeuds[noeudT(r)];
  assert.ok(n.protege && n.anneau.coins.length === 3 && n.anneau.traversees.length === 3);
  const ctx = preparerTrafic(r, ROUTE, FEUX), etat = creerTrafic(TRAFIC, 11);
  let surAnneau = 0, traverses = 0;
  for (let i = 0; i < 240 * 30; i++) {
    avancer(etat, ctx, TRAFIC, VEHICULES, 1 / 30, PIETONS);
    for (const v of etat.vehicules) {
      if (v.etape !== 'anneau') continue;
      surAnneau++;
      if (!v.anneau[v.iseg].traversee || !v.part) continue;
      traverses++;
      const q = pointA(v.ligne, v.s).p;
      for (const o of etat.vehicules) if (o.mode !== 'velo') {
        const c = pointA(o.ligne, o.s).p;
        assert.ok(Math.hypot(c[0] - q[0], c[1] - q[1]) > 1.5, `t = ${etat.t.toFixed(1)} : ${o.mode} ${o.id} sur le vélo ${v.id}`);
      }
    }
  }
  assert.ok(surAnneau > 500 && traverses > 100, `${surAnneau} pas sur l'anneau, ${traverses} en traversée`);
  assert.ok(etat.sortis.velo > 40 && etat.sortis.voiture > 15, `${etat.sortis.velo} vélos, ${etat.sortis.voiture} voitures`);
});
test('une piste à double sens qui arrive : la traversée d\'en face est à double sens', () => {
  let r = carrefourT();
  const ouest = Object.entries(r.troncons).find(([, t]) => t.points.some(p => p[0] < -500))[0];
  r = basculerPisteDouble(r, ouest, 'gauche', ROUTE, TRACE).reseau; // au nord de la route de départ, côté ouest
  const n = geometrieReseau(r, ROUTE).noeuds[noeudT(r)];
  const nord = n.branches.findIndex(b => r.troncons[b.troncon].points.some(p => p[1] > 100));
  assert.equal(n.anneau.traversees[nord].double, true);
  assert.equal(n.anneau.traversees[nord].largeur, ROUTE.largeurTraverseeVeloDouble);
});
test('deux carrefours très proches : un seul passage piéton entre eux', () => {
  let r = depart();
  r = construireRoute(r, tirer(r, [0, 0], [0, 150]), TRACE).reseau;
  r = construireRoute(r, tirer(r, [26, 0], [26, -150]), TRACE).reseau;
  const geo = geometrieReseau(r, ROUTE);
  const court = Object.entries(r.troncons).find(([, t]) => t.points.every(p => p[1] === 0 && p[0] >= -0.01 && p[0] <= 26.01))[0];
  const bouts = Object.values(geo.noeuds).flatMap(n => n.branches.filter(b => b.troncon === court));
  assert.deepEqual(bouts.map(b => b.passage).sort(), [false, true]);
});
test('aux feux, un sas vélo : la ligne des voitures recule de sas mètres', () => {
  const r0 = carrefourT(), n = noeudT(r0);
  const sans = geometrieReseau(r0, ROUTE).noeuds[n].branches[0].arret;
  const avec = geometrieReseau(basculerFeux(r0, n, FEUX).reseau, ROUTE).noeuds[n].branches[0];
  assert.equal(avec.sas, ROUTE.sas);
  assert.equal(avec.arret, sans + ROUTE.sas);
});
test('céder voie par voie : seulement à qui est sur sa voie ou va y entrer', () => {
  const r0 = carrefourT(), ouest = Object.entries(r0.troncons).find(([, t]) => t.points.some(p => p[0] < -500))[0];
  const r = basculerVoies(r0, ouest, ROUTE, TRACE).reseau;
  const ctx = preparerTrafic(r, ROUTE, FEUX), etat = creerTrafic(TRAFIC, 2), n = noeudT(r), g = ctx.geo.noeuds[n];
  const i = g.branches.findIndex(b => r.troncons[b.troncon].points.some(p => p[0] < -500)), b = g.branches[i];
  const ligne = ctx.geo.troncons[b.troncon].voies[-b.sens][0]; // la voie 0 qui arrive par l'ouest
  const L = longueur(ligne), Q = pointA(ligne, L - (b.z0 + ROUTE.largeurTraversee / 2));
  const cote = [-Q.dir[1], Q.dir[0]]; // vers la gauche du sens de marche : l'autre sens de circulation
  const pieton = (k, versLaVoie) => ({ p: [Q.p[0] + cote[0] * k, Q.p[1] + cote[1] * k], dir: versLaVoie ? [-cote[0], -cote[1]] : cote });
  const essai = liste => { etat.traversees = new Map([[`${n}|${i}`, liste]]); return aCeder(etat, ctx, n, i, ligne, true, 'voiture'); };
  assert.equal(essai([pieton(0, true)]), true, 'sur sa voie');
  assert.equal(essai([pieton(3, true)]), true, 'sur la voie voisine, il arrive');
  assert.equal(essai([pieton(3, false)]), false, 'sur la voie voisine, il s\'éloigne : on passe');
  assert.equal(essai([pieton(7, true)]), false, 'de l\'autre côté de la route : on passe');
});

group('beta — îlots, mouvements, ronds-points, virages');
test('îlot central : refuges puis terre-plein ; la chaussée s\'écarte, on traverse en deux fois', async () => {
  const { basculerIlot } = await import('../js/beta/reseau.js');
  let r = carrefourT();
  const ouest = Object.entries(r.troncons).find(([, t]) => t.points.some(p => p[0] < -500))[0];
  r = basculerIlot(r, ouest, ROUTE, TRACE).reseau;
  assert.equal(r.troncons[ouest].ilot, 'refuges');
  const geo = geometrieReseau(r, ROUTE);
  assert.ok(geo.troncons[ouest].voies[1][0][0][1] < -ROUTE.largeurRefuge / 2, 'la voie s\'écarte de l\'axe');
  const moities = Object.values(geo.pietons.points).flatMap(p => p.liens.filter(l => l.moitie)).length;
  assert.equal(moities, 4, 'deux moitiés, dans les deux sens');
  assert.equal(basculerIlot(r, ouest, ROUTE, TRACE).reseau.troncons[ouest].ilot, 'terreplein');
  const { etat } = simuler(r, 240, 3, PIETONS);
  assert.ok(etat.sortis.voiture > 15, `${etat.sortis.voiture}`);
});
test('mouvements par défaut : une voie va partout ; à deux voies, gauche + tout droit et droite + tout droit', async () => {
  const { mouvementsDu, fleches, basculerMouvement } = await import('../js/beta/mouvements.js');
  let r = carrefourT();
  const ouest = Object.entries(r.troncons).find(([, t]) => t.points.some(p => p[0] < -500))[0];
  const n = noeudT(r), g1 = geometrieReseau(r, ROUTE).noeuds[n], mv1 = mouvementsDu(r, g1, n);
  const e1 = Object.keys(mv1).find(k => k.startsWith(ouest + '|'));
  assert.deepEqual(fleches(g1, mv1, e1), ['gauche', 'toutdroit']);
  r = basculerVoies(r, ouest, ROUTE, TRACE).reseau;
  const g2 = geometrieReseau(r, ROUTE).noeuds[n], mv2 = mouvementsDu(r, g2, n);
  const [e0, e1b] = Object.keys(mv2).filter(k => k.startsWith(ouest + '|')).sort();
  assert.deepEqual(fleches(g2, mv2, e0), ['gauche', 'toutdroit'], 'voie de gauche');
  assert.deepEqual(fleches(g2, mv2, e1b), ['toutdroit'], 'voie de droite : pas de droite dans ce T, tout droit');
  // Retirer le tout-droit de la voie de gauche : elle ne tourne plus qu'à gauche ; le dernier ne se retire pas
  const td = mv2[e0].find(s => fleches(g2, { [e0]: [s] }, e0)[0] === 'toutdroit');
  const r2 = basculerMouvement(r, g2, n, e0, td).reseau;
  assert.deepEqual(fleches(g2, mouvementsDu(r2, g2, n), e0), ['gauche']);
  assert.equal(basculerMouvement(r2, g2, n, e0, mouvementsDu(r2, g2, n)[e0][0]).refus, 'dernierMouvement');
  // Le trafic suit : plus aucune voiture ne va tout droit depuis la voie de gauche
  const ctx = preparerTrafic(r2, ROUTE, FEUX), etat = creerTrafic(TRAFIC, 6);
  for (let i = 0; i < 150 * 30; i++) {
    avancer(etat, ctx, TRAFIC, VEHICULES, 1 / 30);
    for (const v of etat.vehicules) if (v.etape === 'voie' && `${v.voie.troncon}|${v.voie.sens}|${v.voie.voie}` === e0 && v.suite) assert.notEqual(`${v.suite.troncon}|${v.suite.sens}`, td.split('|').slice(0, 2).join('|'));
  }
});
test('rond-point : trois tailles, les voitures tournent sans se chevaucher, et sortent', async () => {
  const { basculerGiratoire } = await import('../js/beta/reseau.js');
  let r = carrefourT();
  const n = noeudT(r);
  const tailles = [];
  for (let k = 0; k < 4; k++) { r = basculerGiratoire(r, n).reseau; tailles.push(r.noeuds[n].giratoire ?? null); }
  assert.deepEqual(tailles, ['mini', 'urbain', 'grand', null]);
  r = basculerGiratoire(basculerGiratoire(r, n).reseau, n).reseau; // urbain
  assert.equal(basculerFeux(r, n, FEUX).refus, 'feuxGiratoire');
  const geo = geometrieReseau(r, ROUTE);
  assert.ok(geo.noeuds[n].branches.every(b => b.recul >= 16), 'les branches reculent au-delà de l\'anneau');
  const { etat } = simuler(r, 240, 8, PIETONS);
  assert.ok(etat.sortis.voiture > 20, `${etat.sortis.voiture} sorties`);
  sansChevauchement(etat);
  assert.equal(etat.abandons, 0);
});
test('virage à angle droit : les deux bouts reculent et la route se courbe', () => {
  let r = depart();
  r = construireRoute(r, tirer(r, [0, 0], [0, 120]), TRACE).reseau;
  r = construireRoute(r, tirer(r, [-120, 0], [0, 120]), TRACE).reseau;
  const n = Object.values(geometrieReseau(r, ROUTE).noeuds).find(x => x.degre === 2);
  assert.ok(n.virage && n.recul > 4, `recul ${n.recul}`);
});
test('rond-point : autant de voies que la plus large des routes d\'accès ; piste puis trottoir à l\'extérieur', async () => {
  const { basculerGiratoire } = await import('../js/beta/reseau.js');
  let r = carrefourT();
  const n = noeudT(r);
  const ouest = Object.entries(r.troncons).find(([, t]) => t.points.some(p => p[0] < -500))[0];
  for (let k = 0; k < 2; k++) r = basculerVoies(r, ouest, ROUTE, TRACE).reseau; // 3 × 3
  for (const id of Object.keys(r.troncons)) r = basculerVelo(r, id, ROUTE, TRACE).reseau;
  r = basculerGiratoire(r, n).reseau; // mini, d'ordinaire à une voie
  const g = geometrieReseau(r, ROUTE).noeuds[n];
  assert.equal(g.giratoire.voies, 3);
  assert.equal(g.giratoire.anneaux.length, 3);
  // La traversée cyclable commence à 1 m du bord de l'anneau : la piste fait le tour juste contre lui
  assert.ok(g.branches.every(b => Math.abs(b.recul - (g.giratoire.rayon + 1)) < 1e-9));
  const { etat } = simuler(r, 200, 5, PIETONS);
  assert.ok(etat.sortis.voiture > 10, `${etat.sortis.voiture}`);
  sansChevauchement(etat);
});
