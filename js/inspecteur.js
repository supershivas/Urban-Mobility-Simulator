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
