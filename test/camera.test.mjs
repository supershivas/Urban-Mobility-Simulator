// La caméra orbitale de la vue 3D : règles pures.
import { pose, axes, contraindre, deplacer, tourner, zoomer, cadrer, metresParPixel, mppDuZoom, distancePourZoom, zoomPourDistance, interpoler } from '../js/scene/camera.js';

const proche = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const L = { boite: [-100, -50, 100, 50], distanceMin: 40, distanceMax: 1000, inclinaisonMax: 1.4 };
const E = { cible: [10, 20], distance: 200, azimut: 0, inclinaison: 0 };

group('caméra orbitale');
test('vue de dessus : la caméra est à la verticale de la cible, le nord en haut de l\'écran', () => {
  const p = pose(E);
  assert.deepEqual(p.position, [10, 200, -20]);
  assert.deepEqual(p.cible, [10, 0, -20]);
  assert.ok(proche(p.haut[0], 0) && proche(p.haut[1], 0) && proche(p.haut[2], -1));
});
test('inclinée, elle recule à l\'opposé du regard et reste à la bonne distance', () => {
  const p = pose({ ...E, azimut: Math.PI / 2, inclinaison: Math.PI / 3 }); // regarde vers l'est
  assert.ok(p.position[0] < 10 && proche(p.position[2], -20, 1e-6));
  assert.ok(proche(Math.hypot(p.position[0] - 10, p.position[1], p.position[2] + 20), 200, 1e-6));
  const regard = [p.cible[0] - p.position[0], p.cible[1] - p.position[1], p.cible[2] - p.position[2]];
  assert.ok(proche(regard[0] * p.haut[0] + regard[1] * p.haut[1] + regard[2] * p.haut[2], 0, 1e-6), 'haut ⟂ regard');
});
test('elle ne passe jamais sous le sol ni hors des bornes', () => {
  const c = contraindre({ cible: [500, -500], distance: 5, azimut: 7, inclinaison: 3 }, L);
  assert.deepEqual(c.cible, [100, -50]);
  assert.equal(c.distance, 40);
  assert.equal(c.inclinaison, 1.4);
  assert.ok(c.azimut > -Math.PI && c.azimut <= Math.PI && proche(Math.sin(c.azimut), Math.sin(7)));
  assert.ok(pose(c).position[1] > 0);
  assert.equal(contraindre({ ...E, inclinaison: -1 }, L).inclinaison, 0);
});
test('glisser : le sol suit le pointeur, dans le repère de l\'écran', () => {
  const nord = deplacer(E, 30, 0, 2); // pointeur vers la droite : la cible part vers l'ouest
  assert.ok(proche(nord.cible[0], 10 - 60) && proche(nord.cible[1], 20));
  const bas = deplacer(E, 0, 30, 2); // pointeur vers le bas : la cible avance (vers le nord)
  assert.ok(proche(bas.cible[0], 10) && proche(bas.cible[1], 20 + 60));
  const est = deplacer({ ...E, azimut: Math.PI / 2 }, 30, 0, 2); // regard vers l'est : la droite de l'écran est le sud
  assert.ok(proche(est.cible[0], 10, 1e-6) && proche(est.cible[1], 20 + 60, 1e-6));
});
test('tourner et zoomer ne déplacent pas la cible', () => {
  assert.deepEqual(tourner(E, 0.5, 0.2).cible, E.cible);
  assert.equal(tourner(E, 0.5, 0.2).azimut, 0.5);
  assert.equal(zoomer(E, 0.5).distance, 100);
  assert.deepEqual(axes(0), { avant: [0, 1], droite: [1, -0] });
});
test('retour à l\'emprise : toute la boîte tient dans la vue', () => {
  const boite = [-2000, -600, 2000, 600], fov = 40;
  for (const inclinaison of [0, 0.87]) {
    const e = cadrer(boite, 688, 720, fov, { inclinaison, margePx: 24 });
    assert.deepEqual(e.cible, [0, 0]);
    const mpp = metresParPixel(e, 720, fov);
    assert.ok(4000 / mpp <= 688 - 48 + 1e-6, `largeur à l'écran : ${4000 / mpp}`);
    assert.ok((1200 * Math.cos(inclinaison)) / mpp <= 720 - 48 + 1e-6);
  }
});
test('même échelle que la carte au point visé (zoom ↔ distance)', () => {
  const lat = 50.84, h = 720, fov = 40;
  for (const z of [11, 15.5, 20]) {
    const d = distancePourZoom(z, lat, h, fov);
    assert.ok(proche(metresParPixel({ distance: d }, h, fov), mppDuZoom(z, lat), 1e-9));
    assert.ok(proche(zoomPourDistance(d, lat, h, fov), z, 1e-9));
  }
  assert.ok(Math.abs(mppDuZoom(15, 50.84) - 1.5083) < 0.01, 'zoom 15 à Bruxelles ≈ 1,5 m par pixel (tuiles de 512 px)');
});
test('un vol part de l\'état de départ, arrive à l\'état visé, par le plus court chemin angulaire', () => {
  const a = { cible: [0, 0], distance: 100, azimut: 3, inclinaison: 0 }, b = { cible: [10, 10], distance: 400, azimut: -3, inclinaison: 1 };
  assert.deepEqual(interpoler(a, b, 0), a);
  const fin = interpoler(a, b, 1);
  assert.ok(proche(fin.distance, 400, 1e-6) && proche(Math.sin(fin.azimut), Math.sin(-3)) && proche(fin.inclinaison, 1));
  assert.ok(Math.abs(interpoler(a, b, 0.5).azimut - 3) < 0.3, 'passe par π, pas par 0');
});
