import { controler } from '../js/geo/topologie.js';

const noeud = (id, position, niveau = 0) => ({ id, position, niveau });
const seg = (id, fromNode, toNode, ligne, niveau = 0) => ({ id, fromNode, toNode, ligne, niveau });
const types = r => r.anomalies.map(a => a.type).sort();

group('topologie');
test('un réseau propre ne rapporte rien', () => {
  const r = controler([seg('s1', 'a', 'b', [[0, 0], [10, 0]]), seg('s2', 'b', 'c', [[10, 0], [10, 10]])],
    [noeud('a', [0, 0]), noeud('b', [10, 0]), noeud('c', [10, 10])]);
  assert.deepEqual(r.anomalies, []);
  assert.equal(r.degres.get('b'), 2);
});
test('nœud absent de la source, introuvable, éloigné, isolé', () => {
  const r = controler([
    seg('s1', null, 'b', [[0, 0], [10, 0]]),
    seg('s2', 'b', 'z', [[10, 0], [20, 0]]),
    seg('s3', 'b', 'c', [[10, 0], [30, 30]]),
  ], [noeud('b', [10, 0]), noeud('c', [30, 25]), noeud('seul', [99, 99])]);
  assert.deepEqual(types(r), ['extremite-eloignee-du-noeud', 'noeud-absent-source', 'noeud-introuvable', 'noeud-isole']);
});
test('croisement : même niveau → anomalie ; niveaux différents → dénivelé attendu', () => {
  const noeuds = ['a', 'b', 'c', 'd'].map((id, i) => noeud(id, [[0, 0], [10, 10], [0, 10], [10, 0]][i]));
  const plan = controler([seg('s1', 'a', 'b', [[0, 0], [10, 10]]), seg('s2', 'c', 'd', [[0, 10], [10, 0]])], noeuds);
  assert.deepEqual(types(plan), ['croisement-sans-noeud']);
  const pont = controler([seg('s1', 'a', 'b', [[0, 0], [10, 10]]), seg('s2', 'c', 'd', [[0, 10], [10, 0]], -1)], noeuds);
  assert.deepEqual(pont.anomalies, []);
  assert.equal(pont.croisementsDenivele, 1);
});
test('même tracé, même en sens inverse : doublon rapporté, rien n\'est fusionné', () => {
  const r = controler([seg('s1', 'a', 'b', [[0, 0], [10, 0]]), seg('s2', 'b', 'a', [[10, 0], [0, 0]])], [noeud('a', [0, 0]), noeud('b', [10, 0])]);
  assert.deepEqual(types(r), ['geometrie-dupliquee']);
});
test('identifiant en double et longueur nulle', () => {
  const r = controler([seg('s1', 'a', 'b', [[0, 0], [10, 0]]), seg('s1', 'a', 'a', [[0, 0], [0, 0]])], [noeud('a', [0, 0]), noeud('b', [10, 0])]);
  assert.ok(types(r).includes('identifiant-double'));
  assert.ok(types(r).includes('longueur-nulle'));
});
