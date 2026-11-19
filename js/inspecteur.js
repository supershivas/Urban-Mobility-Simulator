// Ce que l'inspecteur affiche pour un tronçon ou un bâtiment. Pur (aucun DOM), testé.
// Règle : une valeur absente reste « Non renseigné », jamais remplacée par une
// valeur supposée ; une estimation (OSM) affiche sa méthode et sa confiance.

/**
 * segment : entrée de network.json (streetSegments)
 * ctx : { t (i18n), lang, codes (data/urbis-codes.json), noeuds: Map(id → intersection), rues: Map(id → street),
 *         section : la section du scénario quand le joueur l'a modifiée (js/section.js), sinon null }
 * → [{ titre, lignes: [{ champ, valeur, inconnu, source?, copiable? }] }]  (copiable : identifiants, bouton « Copier »)
 */
export function lignesInspecteur(segment, { t, lang, codes, noeuds, rues, section = null }) {
  const inconnu = (champ, cle = 'valeur.inconnu') => ({ champ: t(champ), valeur: t(cle), inconnu: true });
  const ligne = (champ, valeur, source, copiable = false) => ({ champ: t(champ), valeur: String(valeur), inconnu: false, ...(source ? { source } : {}), ...(copiable ? { copiable: true } : {}) });
  const libelle = (table, code) => {
    if (code === null || code === undefined) return null;
    const l = codes[table]?.[code];
    return l ? `${l[lang] ?? l.fr} (${code})` : t('valeur.hors-spec', { code });
  };
  const nombre = n => n.toLocaleString(lang === 'en' ? 'en-GB' : 'fr-BE', { maximumFractionDigits: 1 });

  // Identité
  const nom = [segment.nom.fr, segment.nom.nl].filter(Boolean);
  const rue = segment.streetId ? rues.get(segment.streetId) : null;
  const identite = [
    nom.length ? ligne('champ.nom', [...new Set(nom)].join(' / ')) : inconnu('champ.nom'),
    ligne('champ.id', segment.id, null, true),
    segment.sourceIds.urbis ? ligne('champ.id-source', segment.sourceIds.urbis, null, true) : inconnu('champ.id-source'),
    rue ? ligne('champ.rue', t('valeur.rue', { n: rue.segmentIds.length })) : inconnu('champ.rue'),
  ];

  // Géométrie et connexions
  const noeud = (champ, id) => {
    if (!id) return inconnu(champ, 'valeur.absent-source');
    const n = noeuds.get(id);
    if (!n) return inconnu(champ);
    return ligne(champ, t('valeur.noeud', { id, type: libelle('noeudType', n.typeCode) ?? t('valeur.inconnu'), n: n.connectedSegmentIds.length }));
  };
  const niveau = segment.niveau === null ? null
    : segment.niveau === 0 ? t('valeur.niveau.0')
      : t(segment.niveau < 0 ? 'valeur.niveau.neg' : 'valeur.niveau.pos', { n: segment.niveau });
  const geometrie = [
    ligne('champ.longueur', t('valeur.metres', { n: nombre(segment.lengthMeters) })),
    segment.longueurSource === null ? inconnu('champ.longueur-source') : ligne('champ.longueur-source', t('valeur.metres', { n: nombre(segment.longueurSource) })),
    noeud('champ.depart', segment.fromNode),
    noeud('champ.arrivee', segment.toNode),
    segment.typeCode === null ? inconnu('champ.type') : ligne('champ.type', libelle('axeType', segment.typeCode)),
    segment.hierarchieCode === null ? inconnu('champ.hierarchie') : ligne('champ.hierarchie', libelle('hierarchie', segment.hierarchieCode)),
    niveau === null ? inconnu('champ.niveau') : ligne('champ.niveau', niveau),
    segment.penteDegres === null ? inconnu('champ.pente') : ligne('champ.pente', t('valeur.degres', { n: nombre(segment.penteDegres) })),
  ];

  // Circulation : seulement ce qu'OSM dit, avec sa provenance
  const osm = segment.complementOsm;
  const sourceOsm = osm ? t('valeur.source-osm', { confiance: t(`valeur.confiance.${osm.confiance}`) }) : null;
  const a = segment.sourceAttributes;
  const circulation = [
    a.oneway === null ? inconnu('champ.sens') : ligne('champ.sens', t(`valeur.sens.${a.oneway}`), sourceOsm),
    a.lanes === null ? inconnu('champ.voies') : ligne('champ.voies', a.lanes, sourceOsm),
    a.speedLimit === null ? inconnu('champ.vitesse')
      : ligne('champ.vitesse', typeof a.speedLimit === 'number' ? t('valeur.kmh', { n: a.speedLimit }) : a.speedLimit, sourceOsm),
    a.roadManager === null ? inconnu('champ.gestionnaire') : ligne('champ.gestionnaire', a.roadManager),
  ];

  // Emprise publique : mesurée sur les surfaces UrbIS (méthode et confiance), jamais supposée
  const e = segment.emprise;
  const metres = n => t('valeur.metres', { n: nombre(n) });
  const bandes = (liste, nom) => liste.map(b => t('valeur.bande', { nom: nom(b), n: nombre(b.largeur) })).join(' · ');
  const emprise = e ? [
    ligne('champ.emprise', metres(e.largeur), t('valeur.emprise-source', { coupes: e.coupes, ecart: nombre(e.ecart), confiance: t(`valeur.confiance.${e.confiance}`) })),
    ligne('champ.section-mesuree', bandes(e.bandes, b => libelle('surfaceType', b.type))),
    section ? ligne('champ.scenario', `${t('valeur.scenario.modifiee')} : ${bandes(section.bandes, b => t(`bande.${b.type}`) + (b.sens ? ` ${t(`sens.${b.sens}.signe`)}` : ''))}`)
      : ligne('champ.scenario', t('valeur.scenario.mesure')),
  ] : [segment.niveau === 0 && ['S', 'SC'].includes(segment.typeCode) ? inconnu('champ.emprise', 'valeur.emprise-absente') : inconnu('champ.emprise', 'valeur.emprise-sans-objet')];

  const sections = [
    { titre: t('inspecteur.section.identite'), lignes: identite },
    { titre: t('inspecteur.section.emprise'), lignes: emprise },
    { titre: t('inspecteur.section.geometrie'), lignes: geometrie },
    { titre: t('inspecteur.section.circulation'), lignes: circulation },
  ];
  if (osm) {
    sections.push({
      titre: t('inspecteur.section.osm'),
      lignes: [
        ligne('champ.chemins-osm', segment.sourceIds.osm.map(id => `way/${id}`).join(', ')),
        ...Object.entries(osm.tags).map(([k, v]) => ({ champ: k, valeur: v, inconnu: false })),
      ],
    });
  }
  sections.push({
    titre: t('inspecteur.section.qualite'),
    lignes: [
      ligne('champ.geometrie', t('valeur.geometrie-urbis')),
      ligne('champ.attributs', t('valeur.attributs-urbis')),
      ligne('champ.anomalies', segment.anomalies?.length ? segment.anomalies.map(x => t(`anomalie.${x}`)).join(' ; ') : t('valeur.aucune-anomalie')),
    ],
  });
  return sections;
}

/**
 * batiment : { id, hauteur (m ou null), solides (nombre de solides UrbIS 3D associés) } — propriétés de buildings.geojson
 * ctx : { t, lang, infos : metadata.json → batiments ({ prefixeUrbis, hauteurs: { dateSource } }) }
 * La hauteur ne vient que de la source ; sans solide associé elle reste « Non renseigné ».
 */
export function lignesInspecteurBatiment(batiment, { t, lang, infos }) {
  const inconnu = (champ, cle = 'valeur.inconnu') => ({ champ: t(champ), valeur: t(cle), inconnu: true });
  const ligne = (champ, valeur, source, copiable = false) => ({ champ: t(champ), valeur: String(valeur), inconnu: false, ...(source ? { source } : {}), ...(copiable ? { copiable: true } : {}) });
  const nombre = n => n.toLocaleString(lang === 'en' ? 'en-GB' : 'fr-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const numero = batiment.id.replace(/^bld-u/, '');
  const connue = typeof batiment.hauteur === 'number';
  return [
    {
      titre: t('inspecteur.section.identite'),
      lignes: [
        ligne('champ.id', batiment.id, null, true),
        infos?.prefixeUrbis ? ligne('champ.id-source', `${infos.prefixeUrbis}${numero}`, null, true) : inconnu('champ.id-source'),
      ],
    },
    {
      titre: t('inspecteur.section.volume'),
      lignes: [
        connue
          ? ligne('champ.hauteur', t('valeur.metres', { n: nombre(batiment.hauteur) }), t('valeur.source-hauteur', { date: infos?.hauteurs?.dateSource ?? '?', n: batiment.solides }))
          : inconnu('champ.hauteur', 'valeur.hauteur-absente'),
        inconnu('champ.etages', 'valeur.etages-absents'),
      ],
    },
    {
      titre: t('inspecteur.section.qualite'),
      lignes: [
        ligne('champ.geometrie', t('valeur.geometrie-batiment')),
        ligne('champ.methode-hauteur', t(connue ? 'valeur.methode-hauteur' : 'valeur.methode-hauteur-absente')),
      ],
    },
  ];
}

/**
 * Un nœud (carrefour, v0.4).
 * noeud : entrée de network.json (intersections) ; ctx : { t, lang, codes,
 *   branches : js/carrefour.js (avec nomTexte), raccords, verif, perdus, carrefour : les choix du scénario (ou null) }
 * La régulation et les traversées viennent du seul scénario : aucune source ne les donne, elles restent « Non renseigné ».
 */
export function lignesInspecteurNoeud(noeud, { t, lang, codes, branches, raccords, verif, perdus, carrefour }) {
  const inconnu = (champ, cle = 'valeur.inconnu') => ({ champ: t(champ), valeur: t(cle), inconnu: true });
  const ligne = (champ, valeur, source, copiable = false) => ({ champ: t(champ), valeur: String(valeur), inconnu: false, ...(source ? { source } : {}), ...(copiable ? { copiable: true } : {}) });
  const type = noeud.typeCode === null || noeud.typeCode === undefined ? null : codes.noeudType?.[noeud.typeCode];
  const niveau = noeud.niveau === null || noeud.niveau === undefined ? null
    : noeud.niveau === 0 ? t('valeur.niveau.0') : t(noeud.niveau < 0 ? 'valeur.niveau.neg' : 'valeur.niveau.pos', { n: noeud.niveau });
  const lettre = i => String.fromCharCode(65 + i);
  const proposes = raccords.filter(r => r.origine === 'propose').length;
  const poses = Object.entries(carrefour?.traversees ?? {}).flatMap(([id, tr]) => Object.entries(tr).filter(([, v]) => v !== null)
    .map(([k, v]) => `${lettre(branches.findIndex(b => b.troncon === id))} ${t(`traversee.${k}`)} : ${t(v ? 'traversee.oui' : 'traversee.non')}`));
  const editable = branches.length >= 2;
  return [
    {
      titre: t('inspecteur.section.identite'),
      lignes: [
        ligne('champ.id', noeud.id, null, true),
        noeud.sourceIds?.urbis ? ligne('champ.id-source', noeud.sourceIds.urbis, null, true) : inconnu('champ.id-source'),
        type ? ligne('champ.type', `${type[lang] ?? type.fr} (${noeud.typeCode})`) : inconnu('champ.type'),
        niveau === null ? inconnu('champ.niveau') : ligne('champ.niveau', niveau),
      ],
    },
    {
      titre: t('inspecteur.section.carrefour'),
      lignes: [
        ligne('champ.branches', branches.length ? branches.map((b, i) => `${lettre(i)} ${b.nomTexte ?? t('valeur.inconnu')}`).join(' · ') : t('valeur.aucune')),
        carrefour?.regulation ? ligne('champ.regulation', t(`regulation.${carrefour.regulation}`), t('valeur.scenario.modifiee')) : inconnu('champ.regulation', 'valeur.regulation-absente'),
        ...(editable ? [
          ligne('champ.raccords', t('valeur.raccords', { n: raccords.length, p: proposes, j: raccords.length - proposes }), t('valeur.methode-raccords')),
          ligne('champ.alertes', verif.impasses.length || verif.inaccessibles.length || perdus.length
            ? t('valeur.alertes', { i: verif.impasses.length, a: verif.inaccessibles.length, p: perdus.length }) : t('valeur.aucune-alerte')),
          poses.length ? ligne('champ.traversees', poses.join(' · ')) : inconnu('champ.traversees', 'valeur.traversees-absentes'),
        ] : [ligne('champ.raccords', t('valeur.pas-carrefour'))]),
      ],
    },
  ];
}

/**
 * Les flux d'un tronçon (v0.5), pour l'heure de référence.
 * e : js/simulation.js (etatTroncon) ; ctx : { t, lang, comptage (comptages.parTroncon[id] ou null) }
 * Un mode sans demande ni capacité n'a pas de ligne ; sans aucune demande : une ligne « Non renseigné ».
 */
export function lignesSimulation(e, { t, lang }) {
  const loc = lang === 'en' ? 'en-GB' : 'fr-BE';
  const n = v => v.toLocaleString(loc, { maximumFractionDigits: 0 });
  const pc = x => (x === Infinity ? t('sim.sans-voie') : `${Math.round(x * 100).toLocaleString(loc)} %`);
  const signe = s => (s === 'total' ? t('sim.deux-sens') : t(`sens.${s}.signe`));
  const parSens = (o, f) => ['aller', 'retour'].filter(s => o[s] !== null && o[s] !== undefined).map(s => `${f(o[s])} ${signe(s)}`).join(' · ');
  const valeur = (o, f) => (o.total !== null && o.aller === null && o.retour === null ? `${f(o.total)} ${signe('total')}` : parSens(o, f));
  const lignes = [];
  for (const [mode, m] of Object.entries(e.modes)) {
    const d = m.demande, c = m.capacite;
    if (d.origine === null) continue;
    const source = d.origine === 'comptage' ? t('sim.source-comptage', { compteurs: d.compteurs.join(', ') }) : t('sim.source-joueur');
    lignes.push({ champ: t(`sim.mode.${mode}`), valeur: t(`sim.unite.${mode}`, { v: valeur(d, n) }), inconnu: false, source });
    const cap = c.raison && valeur(c, n) === '' ? null : valeur(c, n);
    lignes.push(cap
      ? { champ: t('sim.capacite'), valeur: cap, inconnu: false, source: t(`sim.methode.${c.methode}`, { source: t(`ref.${c.source}`) }) }
      : { champ: t('sim.capacite'), valeur: t(`sim.raison.${c.raison ?? 'capacite-inconnue'}`), inconnu: true });
    const x = m.saturation.total !== null ? valeur({ aller: null, retour: null, total: m.saturation.total }, pc) : parSens(m.saturation, pc);
    if (x) lignes.push({ champ: t('sim.saturation'), valeur: x, inconnu: false });
    const sec = s => t('sim.secondes', { n: n(s) });
    const temps = mode === 'pieton' ? (m.temps.total === null ? '' : sec(m.temps.total)) : parSens(m.temps, sec);
    lignes.push(temps
      ? { champ: t('sim.temps'), valeur: temps, inconnu: false, source: t(mode === 'pieton' ? 'sim.methode-temps-pieton' : 'sim.methode-temps') }
      : { champ: t('sim.temps'), valeur: t(`sim.raison.${m.raisonTemps ?? 'vitesse-inconnue'}`), inconnu: true });
    if (mode !== 'pieton') {
      const dl = parSens(m.delai, sec);
      const raison = Object.values(m.raisonDelai).find(Boolean);
      lignes.push(dl ? { champ: t('sim.delai'), valeur: dl, inconnu: false, source: t('sim.methode-delai') }
        : { champ: t('sim.delai'), valeur: t(`sim.raison.${raison ?? 'regulation-inconnue'}`), inconnu: true });
    }
    lignes.push(m.personnes.transportees !== null
      ? { champ: t('sim.personnes'), valeur: t('sim.personnes-valeur', { d: n(m.personnes.demande), e: n(m.personnes.transportees) }), inconnu: false }
      : { champ: t('sim.personnes'), valeur: t(`sim.raison.${m.personnes.raison}`), inconnu: true });
  }
  if (!lignes.length) lignes.push({ champ: t('sim.demande'), valeur: t('sim.raison.sans-demande'), inconnu: true });
  else {
    const p = e.personnes;
    lignes.unshift(p.transportees !== null
      ? { champ: t('sim.personnes-troncon'), valeur: t('sim.personnes-valeur', { d: n(p.demande), e: n(p.transportees) }), inconnu: false, source: t('sim.methode-personnes') }
      : { champ: t('sim.personnes-troncon'), valeur: t('sim.raison.personnes-incompletes'), inconnu: true });
  }
  return [{ titre: t('inspecteur.section.flux'), lignes }];
}

/**
 * L'exposition aux conflits d'un carrefour (v0.5) : js/simulation.js (conflits). Jamais une prédiction
 * d'accidents (pilier 3) ; la régulation n'est pas prise en compte (phases inconnues).
 */
export function lignesConflits(c, { t, regulation }) {
  const lignes = Object.keys(c.paires).length
    ? Object.entries(c.paires).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ champ: k.split('×').map(x => t(`sim.famille.${x}`)).join(' × '), valeur: String(v), inconnu: false }))
    : [{ champ: t('sim.conflits'), valeur: t('sim.aucun-conflit'), inconnu: false }];
  lignes.unshift({ champ: t('sim.conflits'), valeur: t('sim.n-conflits', { n: c.total }), inconnu: false, source: t(regulation === 'feux' ? 'sim.methode-conflits-feux' : 'sim.methode-conflits') });
  return [{ titre: t('inspecteur.section.conflits'), lignes }];
}

/**
 * Le trafic simulé sur un tronçon (v0.6) : ce qui y passe en ce moment.
 * m : js/circulation.js (mesures) ; ctx : { t, lang, entree : [{ sens, hierarchie, modes: { mode → { debit, origine } } }] si la rue entre
 * dans le corridor, comptage : comptages.parTroncon[id] ou null }. Les débits d'entrée sont des hypothèses de jeu, affichées comme telles.
 */
export function lignesTrafic(m, { t, lang, entree = [], comptage = null }) {
  const loc = lang === 'en' ? 'en-GB' : 'fr-BE';
  const n = v => v.toLocaleString(loc, { maximumFractionDigits: 0 });
  const lignes = [];
  const debits = Object.entries(m.debits).filter(([, v]) => v > 0).map(([mode, v]) => t(`trafic.unite.${mode}`, { v: n(v) }));
  lignes.push(debits.length
    ? { champ: t('trafic.debit'), valeur: debits.join(' · '), inconnu: false, source: t('trafic.methode-debit', { min: Math.round(m.fenetreS / 60) }) }
    : { champ: t('trafic.debit'), valeur: t('trafic.aucun'), inconnu: true });
  if (comptage) lignes.push({ champ: t('trafic.compte'), valeur: t('trafic.unite.velo', { v: n(comptage.parHeure) }), inconnu: false, source: t('sim.source-comptage', { compteurs: comptage.compteurs.join(', ') }) });
  lignes.push({ champ: t('trafic.presents'), valeur: t('trafic.presents-valeur', { n: m.presents, a: m.arretes }), inconnu: false });
  lignes.push(m.vitesseKmh === null ? { champ: t('trafic.vitesse-moyenne'), valeur: t('trafic.aucun'), inconnu: true } : { champ: t('trafic.vitesse-moyenne'), valeur: t('valeur.kmh', { n: m.vitesseKmh }), inconnu: false });
  for (const e of entree) {
    const parts = Object.entries(e.modes).filter(([, d]) => d.debit > 0).map(([mode, d]) => t(`trafic.unite.${mode}`, { v: n(d.debit) }));
    const joueur = Object.values(e.modes).some(d => d.origine === 'joueur');
    lignes.push({ champ: t(`trafic.entree.${e.sens}`), valeur: parts.length ? parts.join(' · ') : t('trafic.aucun'), inconnu: !parts.length, source: t(joueur ? 'trafic.origine-joueur' : 'trafic.origine-jeu', { h: e.hierarchie }) });
  }
  return [{ titre: t('inspecteur.section.trafic'), lignes }];
}
