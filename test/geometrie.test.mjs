import { longueur, distancePointSegment, distancePointLigne, pointA, segmentsSeCroisent, ecartAngle, pointDansAnneau } from '../js/geo/geometrie.js';

group('géométrie');
test('longueur d\'une polyligne', () => assert.equal(longueur([[0, 0], [3, 4], [3, 10]]), 11));
test('distance point–segment, extrémités comprises', () => {
  assert.equal(distancePointSegment([5, 3], [0, 0], [10, 0]), 3);
  assert.equal(distancePointSegment([13, 4], [0, 0], [10, 0]), 5);
  assert.equal(distancePointSegment([1, 1], [0, 0], [0, 0]), Math.SQRT2);
});
test('segment le plus proche', () => assert.deepEqual(distancePointLigne([9, 1], [[0, 0], [5, 0], [10, 0]]), { distance: 1, segment: 1 }));
test('point à mi-longueur', () => assert.deepEqual(pointA([[0, 0], [10, 0], [10, 10]], 0.5), [10, 0]));
test('croisement propre de segments', () => {
  assert.ok(segmentsSeCroisent([0, 0], [10, 10], [0, 10], [10, 0]));
  assert.ok(!segmentsSeCroisent([0, 0], [10, 0], [0, 1], [10, 1]));
  assert.ok(!segmentsSeCroisent([0, 0], [5, 5], [5, 5], [10, 0]), 'une extrémité commune n\'est pas un croisement');
});
test('écart d\'angle ramené à [0, π]', () => {
  assert.ok(Math.abs(ecartAngle(0.1, 2 * Math.PI - 0.1) - 0.2) < 1e-9);
  assert.ok(Math.abs(ecartAngle(0, Math.PI) - Math.PI) < 1e-9);
});
test('point dans un anneau', () => {
  const carre = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  assert.ok(pointDansAnneau([5, 5], carre));
  assert.ok(!pointDansAnneau([15, 5], carre));
});
