// v0.8 : les missions — chacune est ratée sans rien faire et réussie par une solution simple,
// sur le vrai corridor et le vrai trafic simulé (graine fixe). Sinon une mission serait impossible
// ou gratuite : c'est ce que ce fichier interdit.
import { readFileSync } from 'node:fs';
import { construireReseau, creerTrafic } from '../js/circulation.js';
import { sectionMesuree, decalages, changerSens } from '../js/section.js';
import { appliquerOutil, decouperChaussee } from '../js/outils.js';
import { MISSIONS } from '../js/data/missions.js';
import { mission, suivante, suivi, evaluer } from '../js/missions.js';
import { DESSIN_CARREFOUR as D } from '../js/data/carrefours.js';
import { wgs84VersLambert } from '../js/geo/coordonnees.js';

const lire = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const reseau = lire('data/processed/network.json');
const rues = lire('data/processed/streets.geojson');
const segments = new Map(reseau.streetSegments.map(s => [s.id, s]));
const noeuds = new Map(reseau.intersections.map(n => [n.id, n]));
const lignes = new Map(rues.features.map(f => [f.properties.id, f.geometry.coordinates.map(wgs84VersLambert)]));

/** Joue une mission : scénario de départ + modifications, `minutes` simulées ; rend le dernier suivi. */
function jouer(m, { sections = {}, carrefours = {} } = {}, minutes = 10) {
  const sc = { sections, carrefours: { ...(m.depart?.carrefours ?? {}), ...carrefours } };
  const r = construireReseau({
    segments, noeuds, sectionDe: id => sc.sections[id] ?? sectionMesuree(segments.get(id)), ligneDe: id => lignes.get(id) ?? null,
    carrefourDe: id => sc.carrefours[id] ?? null, regulationDe: id => sc.carrefours[id]?.regulation ?? null, vitesseVeloKmh: 18.6, D,
  });
  const t = creerTrafic(r, { graine: 1 });
  // Le trafic s'installe 3 minutes avant le début de la mission (comme en jeu, la partie tourne déjà)
  for (let i = 0; i < 3600; i++) t.pas();
  let s = suivi(t.temps);
  for (let sec = 0; sec < minutes * 60 && !s.reussie; sec++) {
    for (let k = 0; k < 20; k++) t.pas();
    s = evaluer(m, s, { temps: t.temps, trafic: t });
  }
  return s;
}

group('missions — données');
test('chaque mission vise des lieux qui existent, une suite sans trou', () => {
  for (const m of MISSIONS) {
    for (const id of [m.lieu.troncon, m.objectif.troncon].filter(Boolean)) assert.ok(segments.has(id), `${m.id} : ${id}`);
    for (const id of [m.lieu.noeud, m.objectif.noeud].filter(Boolean)) assert.ok(noeuds.has(id), `${m.id} : ${id}`);
  }
  assert.equal(mission('piste-loi').guidee, true);
  assert.equal(suivante('piste-loi').id, MISSIONS[1].id);
  assert.equal(suivante(MISSIONS.at(-1).id), null);
});

group('missions — faisables, pas gratuites (simulation du corridor)');
test('Rue de la Loi : sans piste, aucun vélo sur une piste ; avec une piste posée à l\'outil, l\'objectif est atteint', () => {
  const m = mission('piste-loi'), seg = segments.get(m.objectif.troncon);
  assert.equal(jouer(m, {}, 5).reussie, false);
  const s0 = sectionMesuree(seg), ch = decalages(s0).find(b => b.type === 'chaussee');
  const r = appliquerOutil(s0, ch.droite + 1, 'cyclable', { sensSource: seg.sourceAttributes.oneway });
  const fin = jouer(m, { sections: { [seg.id]: r.section } }, 10);
  assert.ok(fin.reussie, `${fin.valeur} vélos sur la piste`);
});
test('Cortenbergh : des blocs se perdent ; une chaussée remise à sens unique (sortant du carrefour) les rend tous', () => {
  const m = mission('cortenbergh'), seg = segments.get(m.lieu.troncon);
  const sansRien = jouer(m, {}, 6);
  assert.equal(sansRien.reussie, false);
  assert.ok(sansRien.valeur > 0, 'des pertes au départ');
  // Le sens qui quitte le nœud : « aller » si l'axe part du nœud
  const sens = seg.fromNode === m.objectif.noeud ? 'aller' : 'retour';
  let s = decouperChaussee(sectionMesuree(seg), 1, null).section;
  s.bandes.forEach((b, i) => { if (b.type === 'voiture') s = changerSens(s, i, sens).section; });
  const fin = jouer(m, { sections: { [seg.id]: s } }, 10);
  assert.ok(fin.reussie, `tenu ${fin.tenuS} s, ${fin.valeur} pertes`);
});
test('Trèves × Lalaing : le feu mal réglé fait une file ; plus de vert à l\'axe chargé la résorbe', () => {
  const m = mission('feux-treves');
  const mal = jouer(m, {}, 10);
  assert.equal(mal.reussie, false, `file ${mal.valeur}`);
  const bon = { ...m.depart.carrefours[m.objectif.noeud], feux: { modele: 'axes', verts: [50, 26] } };
  const fin = jouer(m, { carrefours: { [m.objectif.noeud]: bon } }, 15);
  assert.ok(fin.reussie, `file ${fin.valeur}, tenu ${fin.tenuS} s`);
});
