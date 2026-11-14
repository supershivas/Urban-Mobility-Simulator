// L'appariement OSM est une estimation : il ne doit jamais inventer une valeur.
import { apparier, indexer, lireSens, attributsOsm } from '../js/geo/appariement.js';

const axe = [[0, 0], [100, 0]];
const chemin = (id, ligne, tags) => ({ id, ligne, tags: { highway: 'residential', ...tags } });

group('appariement OSM');
test('sens : seulement les valeurs explicites, ramenées au sens UrbIS', () => {
  assert.equal(lireSens({ oneway: 'yes' }, true), 'unique-direct');
  assert.equal(lireSens({ oneway: 'yes' }, false), 'unique-inverse');
  assert.equal(lireSens({ oneway: '-1' }, true), 'unique-inverse');
  assert.equal(lireSens({ oneway: 'no' }, true), 'double');
  assert.equal(lireSens({}, true), null);
  assert.equal(lireSens({ junction: 'roundabout' }, true), null, 'un rond-point n\'implique rien ici');
});
test('voies et vitesse : nombre si numérique, texte brut sinon, null si absent', () => {
  assert.deepEqual(attributsOsm({ lanes: '2', maxspeed: '30' }, true), { sens: null, voies: 2, voiesTexte: null, vitesseKmh: 30, vitesseTexte: null });
  assert.equal(attributsOsm({ maxspeed: 'BE:urban' }, true).vitesseTexte, 'BE:urban');
  assert.deepEqual(attributsOsm({}, true), { sens: null, voies: null, voiesTexte: null, vitesseKmh: null, vitesseTexte: null });
});
test('un chemin parallèle à 3 m est apparié, à 15 m non', () => {
  const pres = apparier(axe, indexer([chemin(1, [[-5, 3], [105, 3]], { oneway: 'yes' })]));
  assert.equal(pres.confiance, 'moyenne');
  assert.deepEqual(pres.osmIds, [1]);
  assert.equal(pres.attributs.sens, 'unique-direct');
  assert.equal(apparier(axe, indexer([chemin(2, [[-5, 15], [105, 15]], {})])), null);
});
test('un chemin perpendiculaire n\'est pas apparié', () => {
  assert.equal(apparier(axe, indexer([chemin(3, [[50, -50], [50, 50]], {})])), null);
});
test('un chemin dessiné à l\'envers inverse le sens', () => {
  const r = apparier(axe, indexer([chemin(4, [[105, 1], [-5, 1]], { oneway: 'yes' })]));
  assert.equal(r.memeDirection, false);
  assert.equal(r.attributs.sens, 'unique-inverse');
});
test('candidats contradictoires : ambigu, aucune valeur retenue', () => {
  const r = apparier(axe, indexer([chemin(5, [[-5, 2], [105, 2]], { maxspeed: '30' }), chemin(6, [[-5, -2], [105, -2]], { maxspeed: '50' })]));
  assert.equal(r.confiance, 'ambigue');
  assert.equal(r.attributs.vitesseKmh, null);
  assert.deepEqual(r.tags, {});
});
