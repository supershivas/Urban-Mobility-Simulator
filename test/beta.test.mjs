// Le jeu beta « Carte blanche » : réseau (tracé en arc, découpe, refus), géométrie, trafic.
import { basculerPisteDouble, basculerFeux, reglerFeu, coteDe, feuxDe } from '../js/beta/reseau.js';
import { etatFeux, cycle } from '../js/beta/feux.js';
import { posePieton } from '../js/beta/pietons.js';
import { reseauDepart, tracerArc, projetRoute, construireRoute, viser, accroche, basculerVoies, basculerVelo, demolir, branches, longueur, relireReseau } from '../js/beta/reseau.js';
import { geometrieReseau, enveloppe } from '../js/beta/geometrie.js';
import { preparerTrafic, creerTrafic, avancer, reconcilier, compter, sources } from '../js/beta/roulage.js';
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
  const p = tirer(r, [200, 0], [3, 100]);
  assert.equal(p.refus, undefined);
  assert.equal(p.fin.libre, undefined);
  const { reseau, troncon } = construireRoute(r, p, TRACE);
  const t = reseau.troncons[troncon];
  assert.equal(branches(reseau, t.a).length, 3);
  assert.equal(branches(reseau, t.b).length, 3);
});
test('doubler les voies et ajouter une piste cyclable, puis revenir', () => {
  const r0 = depart();
  const r1 = basculerVoies(r0, 't1', ROUTE).reseau;
  assert.equal(r1.troncons.t1.voies, 2);
  assert.equal(basculerVoies(r1, 't1', ROUTE).reseau.troncons.t1.voies, 1);
  const r2 = basculerVelo(r1, 't1').reseau;
  assert.equal(r2.troncons.t1.piste, 'deux');
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
  r = construireRoute(r, tirer(r, [200, 0], [3, 100]), TRACE).reseau;
  const milieu = Object.entries(r.troncons).find(([, t]) => t.points.every(p => p[1] === 0) && t.points.every(p => p[0] >= -1 && p[0] <= 201))[0];
  const avant = Object.keys(r.troncons).length;
  const apres = demolir(r, milieu).reseau;
  assert.equal(Object.keys(apres.troncons).length, avant - 3, 'un tronçon démoli, deux paires recollées');
  assert.equal(Object.values(apres.noeuds).filter(n => branches(apres, Object.keys(apres.noeuds).find(k => apres.noeuds[k] === n)).length === 2).length, 0, 'plus aucun nœud de passage');
  // Sur la route nouvelle : une moitié en 2 × 2, l'autre non → le nœud reste quand on démolit la diagonale
  const diag = Object.keys(r.troncons).at(-1);
  const nord = Object.entries(r.troncons).find(([id, t]) => id !== diag && t.points.at(-1)[1] > 140)[0];
  const r2 = basculerVoies(r, nord, ROUTE).reseau;
  assert.ok(Object.keys(demolir(r2, diag).reseau.troncons).length === Object.keys(r2.troncons).length - 2, 'la route de départ se recolle, pas la route nord');
});
test('la sauvegarde relue est le même réseau', () => {
  let r = depart();
  r = construireRoute(r, tirer(r, [0, 0], [60, 140]), TRACE).reseau;
  r = basculerVelo(r, Object.keys(r.troncons)[0]).reseau;
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
  // Deux véhicules ne sont jamais l'un sur l'autre (centres à moins d'un mètre)
  const pos = etat.vehicules.map(v => pointA(v.ligne, v.s).p);
  for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
    assert.ok(Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]) > 1, `véhicules ${etat.vehicules[i].id} et ${etat.vehicules[j].id}`);
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
  assert.ok(etat.sortis.voiture > 30, `${etat.sortis.voiture}`);
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
  const r = basculerVelo(depart(), 't1').reseau;
  const { etat } = simuler(r, 320);
  assert.ok(compter(etat).velo > 0);
  assert.ok(etat.sortis.velo > 5);
  assert.ok(etat.vehicules.filter(v => v.mode === 'velo').every(v => v.voie.voie === 'velo'));
});
test('après une modification, les véhicules restent sur leur voie', () => {
  const r0 = depart();
  const { etat } = simuler(r0, 60);
  const avant = etat.vehicules.length;
  const r1 = basculerVoies(r0, 't1', ROUTE).reseau;
  reconcilier(etat, preparerTrafic(r1, ROUTE, FEUX));
  assert.ok(etat.vehicules.length >= avant - 2, `${avant} → ${etat.vehicules.length}`);
});
test('2 × 2 voies avec pistes et deux carrefours : le trafic tourne sans se chevaucher', () => {
  let r = depart();
  r = construireRoute(r, tirer(r, [0, 0], [0, 150]), TRACE).reseau;
  r = construireRoute(r, tirer(r, [200, 0], [3, 100]), TRACE).reseau;
  for (const id of Object.keys(r.troncons)) r = basculerVelo(basculerVoies(r, id, ROUTE).reseau, id).reseau;
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
  const r = basculerPisteDouble(depart(), 't1', coteDe(depart(), 't1', [0, 5])).reseau;
  assert.equal(r.troncons.t1.piste, 'gauche', 'au nord, vu d\'ouest en est');
  const g = geometrieReseau(r, ROUTE).troncons.t1;
  const yEst = g.pistes[1][0][1], yOuest = g.pistes[-1][0][1];
  assert.ok(yEst > 0 && yOuest > 0, 'les deux au nord de l\'axe');
  assert.ok(yOuest > yEst, 'vers l\'ouest : le côté extérieur (sa droite)');
  assert.equal(g.d, ROUTE.largeurVoie, 'au sud : la chaussée seule');
  assert.equal(basculerPisteDouble(r, 't1', 'gauche').reseau.troncons.t1.piste, null, 'second clic : retirée');
  assert.equal(basculerVelo(r, 't1').reseau.troncons.t1.piste, 'deux');
});
test('les anciennes sauvegardes (velo: true) deviennent des pistes des deux côtés', () => {
  const vieux = JSON.parse(JSON.stringify(depart()));
  delete vieux.troncons.t1.piste; vieux.troncons.t1.velo = true;
  assert.equal(relireReseau(vieux).troncons.t1.piste, 'deux');
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
