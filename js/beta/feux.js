// Les feux d'un carrefour du jeu beta (Jérôme, v0.9.2). Pur, testé.
// Une phase par branche, dans l'ordre des angles : tout ce qui vient de cette branche
// passe (voitures et vélos, ceux-ci sur leurs feux plus petits). Puis une phase piétonne :
// tous les véhicules au rouge, tous les passages au vert. Entre deux phases : orange,
// puis rouge intégral (dégagement).

/** La durée d'un cycle complet (s). */
export function cycle(feux, F) {
  return [...feux.verts, feux.pietons].reduce((s, v) => s + v + F.orange + F.rougeIntegral, 0);
}

/**
 * L'état des feux au temps t (s) : couleurs des branches ('vert' | 'orange' | 'rouge'),
 * piétons au vert ou non, phase en cours et secondes avant la fin de son vert.
 * `decalage` désynchronise les carrefours entre eux.
 */
export function etatFeux(feux, F, t, decalage = 0) {
  const phases = [...feux.verts, feux.pietons], k = feux.verts.length;
  let reste = (((t + decalage) % cycle(feux, F)) + cycle(feux, F)) % cycle(feux, F);
  const couleurs = Array(k).fill('rouge');
  for (let i = 0; i < phases.length; i++) {
    const vert = phases[i], tranche = vert + F.orange + F.rougeIntegral;
    if (reste < tranche) {
      const etape = reste < vert ? 'vert' : reste < vert + F.orange ? 'orange' : 'rouge';
      if (i < k) couleurs[i] = etape;
      return { couleurs, pietons: i === k && etape === 'vert', phase: i === k ? 'pietons' : i, resteVert: Math.max(0, vert - reste) };
    }
    reste -= tranche;
  }
  return { couleurs, pietons: false, phase: null, resteVert: 0 };
}

/** Un décalage stable par nœud (deux carrefours voisins ne passent pas au vert ensemble). */
export function decalageDe(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  return h;
}
