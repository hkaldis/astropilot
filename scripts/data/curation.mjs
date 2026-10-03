// Hand-curated, documented adjustments applied on top of the downloaded sources.
// Every entry states its source/justification; nothing here is invented data.
//
// Ids are the FINAL catalog ids (e.g. "M42", "NGC7000", "C14").

/** Wikipedia revisions used (pinned for reproducible builds). */
export const WIKI_REVISIONS = {
  caldwell: { title: 'Caldwell catalogue', revid: 1375235933 },
  messier: { title: 'Messier object', revid: 1372398875 },
  iauConstellations: { title: 'IAU designated constellations', revid: 1375575250 },
  coalsack: { title: 'Coalsack Nebula', revid: 1374611889 },
  hyades: { title: 'Hyades (star cluster)', revid: 1375081451 },
  cave: { title: 'Sh 2-155', revid: 1358591383 },
};

/** OpenNGC row name -> catalog id, where the conventional designation differs from OpenNGC's master row. */
export const ID_OVERRIDES = {
  // Caldwell 37 is conventionally NGC 6885; OpenNGC files it under NGC6882 (NGC6885 = Dup), but the
  // row's position (20h11m56s +26°29′) is that of NGC 6885 in SIMBAD.
  NGC6882: 'NGC6885',
  // Caldwell 49 (Rosette Nebula) is conventionally NGC 2237 (Wikipedia Caldwell table); OpenNGC tags NGC2238 as "C 049".
  NGC2238: 'NGC2237',
  // Caldwell 50 is conventionally NGC 2244; OpenNGC lists NGC2244 as a Dup of NGC2239.
  NGC2239: 'NGC2244',
  // NED-split galaxy: the component row carries the photometry; the parent row is an empty GPair.
  'NGC4656 NED01': 'NGC4656',
};

/** Rows folded into another entry (their designations/names are kept as aliases). */
export const MERGES = [
  // Parts of the Rosette Nebula (C49). OpenNGC: NGC2237 "Rosette A", NGC2246 "Rosette B", NGC2238 "Rosette Nebula" (C 049).
  { into: 'NGC2238', parts: ['NGC2237', 'NGC2246'] },
  // IC 4703 is the nebula of M16 (OpenNGC gives it the same names "Eagle Nebula, Star Queen" and the same photometry).
  { into: 'NGC6611', parts: ['IC4703'] },
  // NGC 6995 is part of the Eastern Veil (same OpenNGC common names "Eastern Veil, Network Nebula").
  { into: 'NGC6992', parts: ['NGC6995'] },
  // NGC 4656's parent GPair row (no photometry) is represented by the NED01 component row.
  { into: 'NGC4656 NED01', parts: ['NGC4656'] },
];

/** OpenNGC Dup rows that must NOT be folded into their target. */
export const IGNORE_DUPS = new Set([
  // OpenNGC treats M102 as a duplicate observation of M101. We follow the common identification
  // M102 = NGC 5866 instead (Wikipedia Messier table; see M102 description).
  'M102',
]);

/** Messier numbers assigned to OpenNGC rows that OpenNGC itself does not tag. */
export const EXTRA_MESSIER = { NGC5866: 102 };

/**
 * Type overrides. OpenNGC type -> our type is mechanical (see build script); these fix
 * cases where the OpenNGC class is generic ("Neb", "Other", "*Ass") or contradicts the
 * well-established nature of the object.
 */
export const TYPE_OVERRIDES = {
  M24: ['star_cloud', 'OpenNGC *Ass; M24 is the Small Sagittarius Star Cloud'],
  M40: ['double_star', 'OpenNGC **; Winnecke 4'],
  M73: ['asterism', 'OpenNGC Other; four-star asterism (Wikipedia M73)'],
  C14: ['open_cluster', 'OpenNGC *Ass; the Double Cluster = open clusters NGC 869 + NGC 884 (Caldwell table: open cluster)'],
  NGC1432: ['reflection_nebula', 'OpenNGC HII; the Maia Nebula is Pleiades reflection nebulosity'],
  NGC1435: ['reflection_nebula', 'OpenNGC Neb; the Merope Nebula is a reflection nebula'],
  NGC7023: ['reflection_nebula', 'OpenNGC Neb; NGC 7023 (Iris Nebula) is a reflection nebula'],
  NGC6729: ['reflection_nebula', 'OpenNGC Neb; NGC 6729 (R CrA Nebula) is a variable reflection nebula'],
  IC4604: ['reflection_nebula', 'OpenNGC Neb; IC 4604 (Rho Ophiuchi Nebula) is a reflection nebula'],
  NGC1973: ['reflection_nebula', 'OpenNGC Neb; part of the Running Man reflection nebulae (NGC 1973/1975/1977)'],
  NGC1975: ['reflection_nebula', 'OpenNGC Neb; part of the Running Man reflection nebulae (NGC 1973/1975/1977)'],
  NGC6334: ['emission_nebula', 'OpenNGC SNR; the Cat\'s Paw Nebula is an emission nebula (Wikipedia NGC 6334)'],
};

/**
 * Magnitude overrides where the OpenNGC value is clearly inconsistent with the standard
 * references. (Globular clusters are handled globally via Harris 2010.)
 */
export const MAG_OVERRIDES = {
  M17: [6.0, 'OpenNGC V=7.0 (HEASARC messier table) vs 6.0 in SEDS / Wikipedia Messier table'],
  M20: [6.3, 'OpenNGC V=8.5 (HEASARC messier table) vs 6.3 in SEDS / Wikipedia Messier table'],
  NGC6885: [6, 'OpenNGC V=14.1 for C37 is not an integrated magnitude; Wikipedia Caldwell table gives 6'],
};

/** Display-name choices where a source lists several names (all names stay in `designations`). */
export const NAME_PREFERENCES = {
  M11: 'Wild Duck Cluster',
  M17: 'Omega Nebula',
  M24: 'Small Sagittarius Star Cloud',
  M33: 'Triangulum Galaxy',
  M42: 'Orion Nebula',
  M43: "De Mairan's Nebula",
  M44: 'Beehive Cluster',
  M64: 'Black Eye Galaxy',
  M74: 'Phantom Galaxy',
  M76: 'Little Dumbbell Nebula',
  M87: 'Virgo A',
  M99: 'Coma Pinwheel',
  M101: 'Pinwheel Galaxy',
  IC2602: 'Southern Pleiades',
  IC443: 'Jellyfish Nebula', // OpenNGC only has the radio-source label "Gem A"
  NGC1555: "Hind's Variable Nebula",
  NGC2537: 'Bear Paw Galaxy',
  'ESO56-115': 'Large Magellanic Cloud',
  PGC143: 'Wolf-Lundmark-Melotte',
};

/**
 * Common names missing from OpenNGC, each verified against the pinned Wikipedia revision:
 * the article wikitext must contain both the name and the designation (checked at build time).
 */
export const CURATED_ALIASES = [
  { id: 'IC1805', name: 'Heart Nebula', designation: 'IC 1805', wiki: { title: 'Heart Nebula', revid: 1369573216 } },
  { id: 'IC1848', name: 'Soul Nebula', designation: 'IC 1848', wiki: { title: 'Westerhout 5', revid: 1378229683 } },
  { id: 'NGC2024', name: 'Flame Nebula', designation: 'NGC 2024', wiki: { title: 'Flame Nebula', revid: 1370775630 } },
  { id: 'IC443', name: 'Jellyfish Nebula', designation: 'IC 443', wiki: { title: 'IC 443', revid: 1375873729 } },
  { id: 'NGC281', name: 'Pacman Nebula', designation: 'NGC 281', wiki: { title: 'NGC 281', revid: 1368426881 } },
  { id: 'NGC7380', name: 'Wizard Nebula', designation: 'NGC 7380', wiki: { title: 'NGC 7380', revid: 1373102150 } },
  { id: 'NGC2359', name: "Thor's Helmet", designation: 'NGC 2359', wiki: { title: 'NGC 2359', revid: 1371215201 } },
  { id: 'M101', name: 'Pinwheel Galaxy', designation: 'NGC 5457', wiki: { title: 'Pinwheel Galaxy', revid: 1373230489 } },
  { id: 'M74', name: 'Phantom Galaxy', designation: 'NGC 628', wiki: { title: 'Messier 74', revid: 1377866469 } },
  { id: 'M87', name: 'Virgo A', designation: 'NGC 4486', wiki: { title: 'Messier 87', revid: 1373230499 } },
  { id: 'M44', name: 'Beehive Cluster', designation: 'Praesepe', wiki: { title: 'Beehive Cluster', revid: 1370773477 } },
  { id: 'M43', name: "De Mairan's Nebula", designation: 'NGC 1982', wiki: { title: 'Messier 43', revid: 1347546707 } },
  { id: 'NGC3628', name: 'Hamburger Galaxy', designation: 'NGC 3628', wiki: { title: 'NGC 3628', revid: 1378214233 } },
  { id: 'NGC7789', name: "Caroline's Rose", designation: 'NGC 7789', wiki: { title: 'NGC 7789', revid: 1373101764 } },
  { id: 'IC2602', name: 'Southern Pleiades', designation: 'IC 2602', wiki: { title: 'IC 2602', revid: 1373100469 } },
  { id: 'NGC2683', name: 'UFO Galaxy', designation: 'NGC 2683', wiki: { title: 'NGC 2683', revid: 1373064020 } },
  { id: 'NGC4656', name: 'Hockey Stick Galaxy', designation: 'NGC 4656', wiki: { title: 'NGC 4656 and NGC 4657', revid: 1378218932 } },
  { id: 'NGC2264', name: 'Cone Nebula', designation: 'NGC 2264', wiki: { title: 'NGC 2264', revid: 1370784441 }, aliasOnly: true },
  { id: 'NGC6334', name: "Cat's Paw Nebula", designation: 'NGC 6334', wiki: { title: 'NGC 6334', revid: 1370785670 } },
];

/** OpenNGC common names that are mis-attributed and are removed. */
export const REMOVED_NAMES = {
  // OpenNGC gives IC 434 the names "Flame Nebula" and "Orion B" via its LBN 953 cross-match.
  // The Flame Nebula is NGC 2024 and Orion B is the molecular cloud containing it (Wikipedia "Flame Nebula").
  IC434: ['Flame Nebula', 'Orion B'],
  // Wikipedia's Messier table lists M33 as "Triangulum/Pinwheel Galaxy"; "Pinwheel Galaxy" normally means M101
  // ("Triangulum Pinwheel" is kept).
  M33: ['Pinwheel Galaxy'],
};

/**
 * Caldwell objects that are not in NGC/IC: values OpenNGC's addendum lacks, from the pinned
 * Wikipedia infobox / Caldwell table revision.
 */
export const CALDWELL_EXTRA = {
  C9: { mag: 7.7, source: 'Wikipedia Sh 2-155 infobox (appmag_v 7.7) / Caldwell table' },
  C14: { mag: 4, source: 'Wikipedia Caldwell table (apparent magnitude 4)' },
  C41: { mag: 0.5, source: 'Wikipedia Hyades infobox (appmag_v 0.5) / Caldwell table' },
  // OpenNGC/SIMBAD place the Coalsack at 12h31m19s −63°44′36″, near its western edge; the
  // Wikipedia infobox gives the conventional centre and the overall size.
  C99: { ra: 12 + 50 / 60, dec: -62.5, size: [420, 300], source: 'Wikipedia Coalsack Nebula infobox (ra 12h50m, dec −62°30′, size 7° × 5°)' },
};

/** Well-established relationships appended to generated descriptions. */
export const DESC_APPEND = {
  IC434: 'The dark Horsehead Nebula (Barnard 33) is silhouetted against its glow.',
  NGC2244: 'It is the young open cluster at the heart of the Rosette Nebula (C 49).',
  NGC6530: 'It is the open cluster embedded in the Lagoon Nebula (M8).',
};

/** Showpieces (~45 classic "wow" objects). */
export const SHOWPIECES = [
  'M31', 'M42', 'M13', 'M45', 'M57', 'M27', 'M51', 'M81', 'M82', 'M8', 'M17', 'M20', 'M11', 'M22', 'M44',
  'C14', 'NGC6960', 'NGC6992', 'albireo', 'mizar', 'epsilon-lyrae',
  'NGC5139', 'NGC104', 'NGC3372', 'M104', 'M97', 'M3', 'M5', 'M92', 'M15', 'M35', 'M37', 'M33',
  'NGC7000', 'NGC457', 'NGC7662', 'NGC6543', 'NGC2392', 'M65', 'M66', 'M64',
  'NGC4755', 'NGC5128', 'NGC253', 'M7',
];

/**
 * Descriptions reused from server/seed.ts (hand-written for the original app), lightly edited for
 * clarity; factual slips in the originals were corrected (noted inline).
 */
export const SEED_DESCRIPTIONS = {
  M1: 'The remnant of a supernova observed in 1054 AD, with a pulsar at its center.',
  M2: 'A rich, compact globular cluster with about 150,000 stars.',
  M3: 'One of the brightest and largest globular clusters, containing about 500,000 stars.',
  M4: 'One of the closest globular clusters to Earth, about 7,200 light-years away, with a distinctive central bar of stars.',
  M5: 'A large, bright globular cluster with more than 100,000 stars.',
  M6: 'A beautiful open cluster whose stars resemble a butterfly with open wings.',
  M7: 'A large, bright open cluster known since antiquity; best viewed with binoculars.',
  M8: 'A large emission nebula and H II region with the embedded open cluster NGC 6530.',
  M9: 'One of the globular clusters nearest the galactic center.',
  M10: 'A bright globular cluster with a moderately concentrated core.',
  M11: 'One of the richest and most compact open clusters known, with about 3,000 stars.',
  M12: 'A loosely concentrated globular cluster, similar in appearance to nearby M10.',
  M13: 'Often called the finest globular cluster in the northern sky, with several hundred thousand stars.',
  M14: 'A fairly large but loose globular cluster with many variable stars.',
  M15: 'One of the densest globular clusters known, possibly hosting a black hole at its core.',
  M16: 'Famous for the "Pillars of Creation" imaged by Hubble; an active star-forming region around a young open cluster.',
  M17: 'Also known as the Swan or Horseshoe Nebula; one of the brightest emission nebulae.',
  M18: 'A small, sparse open cluster located between M17 and M24.',
  // seed said "the most oblate known"; it is one of the most oblate
  M19: 'One of the most oblate (flattened) globular clusters known.',
  M20: 'An unusual mix of emission, reflection and dark nebulae divided into three lobes. Nebula filters help the emission part but dim the reflection part.',
  M21: 'A young open cluster just northeast of the Trifid Nebula.',
  M22: 'One of the brightest globular clusters, visible to the naked eye from dark sites.',
  M23: 'A fairly rich open cluster with about 150 stars.',
  M24: 'A dense Milky Way star cloud: not a true cluster but a window through the dust toward the inner galaxy.',
  M25: 'A prominent open cluster containing the Cepheid variable U Sagittarii.',
  M26: 'A small, moderately rich open cluster near the Wild Duck Cluster.',
  // seed said "the largest and brightest planetary nebula"; the Helix is larger
  M27: 'One of the brightest and largest planetary nebulae, shaped like an apple core or hourglass.',
  // seed said "near the Lagoon Nebula" (≈5° away); position checked against λ Sgr
  M28: 'A fairly dense globular cluster about 1° northwest of Lambda Sagittarii (Kaus Borealis).',
  M29: 'A small, sparse open cluster embedded in rich Milky Way star fields.',
  M30: 'A dense globular cluster that has undergone core collapse.',
  M31: 'The nearest large spiral galaxy, about 2.5 million light-years away and visible to the naked eye.',
  M32: 'A compact elliptical satellite galaxy of Andromeda, visible in the same field.',
  M33: 'The third-largest member of the Local Group: a face-on spiral with low surface brightness.',
  M34: 'A bright, scattered open cluster with about 100 stars, good for binoculars.',
  M35: 'A rich open cluster near the feet of Gemini with several hundred stars.',
  M36: 'One of three bright open clusters in Auriga, with about 60 stars.',
  M37: 'The richest of the Auriga clusters, with about 500 stars including many red giants.',
  M38: 'A scattered open cluster with an unusual cross or starfish pattern.',
  M39: 'A large, loose open cluster best viewed with binoculars or low power.',
  M40: 'A double star (Winnecke 4) rather than a deep-sky object; it remains in the catalogue by tradition.',
  M41: 'A bright open cluster about 4° south of Sirius, with about 100 stars.',
  // seed said "the brightest diffuse nebula" (the Carina Nebula is brighter)
  M42: 'The Great Orion Nebula, one of the brightest nebulae in the sky and the premier winter showpiece.',
  M43: 'Part of the Orion Nebula complex, separated from M42 by a dark dust lane.',
  M44: 'Praesepe, a large, bright open cluster visible to the naked eye and known since antiquity.',
  M45: 'The Seven Sisters, the most famous star cluster, surrounded by faint reflection nebulosity.',
  M46: 'A rich open cluster with a planetary nebula (NGC 2438) in the foreground.',
  M47: 'A bright, coarse open cluster visible to the naked eye under dark skies.',
  M48: 'A scattered open cluster with about 80 stars, good for binoculars.',
  M49: 'A giant elliptical galaxy, the first member of the Virgo Cluster to be discovered.',
  M50: 'A rich open cluster with a heart-like shape in a telescope.',
  M51: 'The classic face-on spiral galaxy, interacting with its companion NGC 5195.',
  M52: 'A rich, compressed open cluster near the Bubble Nebula.',
  // seed said 58,000 ly; Harris (2010) R_gc = 18.4 kpc
  M53: 'One of the more outlying globular clusters, about 60,000 light-years from the galactic center.',
  M54: 'A globular cluster that belongs to the Sagittarius Dwarf Elliptical Galaxy rather than the Milky Way.',
  M55: 'A large, loose globular cluster with an unusually low central concentration.',
  M56: 'A moderately concentrated globular cluster between Beta Cygni (Albireo) and Gamma Lyrae.',
  M57: 'The classic ring-shaped planetary nebula and one of the most observed nebulae.',
  M58: 'A barred spiral galaxy in the Virgo Cluster.',
  M59: 'An elliptical galaxy in the Virgo Cluster.',
  M60: 'A giant elliptical galaxy in the Virgo Cluster with a central supermassive black hole.',
  M61: 'A face-on barred spiral galaxy, one of the largest in the Virgo Cluster.',
  M62: 'A dense globular cluster close to the galactic center, noticeably asymmetrical.',
  M63: 'A flocculent spiral galaxy with patchy, fragmented spiral arms.',
  M64: 'Famous for the dark dust band in front of its nucleus that gives it a "black eye".',
  M65: 'Part of the Leo Triplet: a tilted spiral galaxy with a prominent dust lane.',
  M66: 'The brightest of the Leo Triplet, with asymmetric spiral arms from gravitational interaction.',
  M67: 'One of the oldest known open clusters, about 4 billion years old.',
  M68: 'A moderately concentrated globular cluster in the southern sky.',
  M69: 'A fairly rich globular cluster close to the galactic center.',
  M70: 'A dense globular cluster that has undergone core collapse.',
  M71: 'A very loose globular cluster, once thought to be an open cluster.',
  M72: 'One of the most remote Messier globular clusters, about 55,000 light-years away.',
  M73: 'A Y-shaped asterism of four stars, not a true cluster.',
  M74: 'A grand-design, face-on spiral galaxy with very low surface brightness.',
  M75: 'A highly concentrated globular cluster about 68,000 light-years away.',
  M76: 'One of the faintest Messier objects, resembling a smaller version of M27.',
  // seed called it "the largest in the Messier catalog" — dropped
  M77: 'A Seyfert galaxy with a bright active galactic nucleus.',
  M78: 'One of the brightest reflection nebulae in the sky. It shines by reflected starlight, so narrowband nebula filters do not help.',
  M79: 'An unusual globular cluster on the opposite side of the sky from the galactic center.',
  M80: 'One of the densest globular clusters known, with a very bright core.',
  M81: 'A grand-design spiral galaxy, one of the brightest galaxies in the night sky.',
  M82: 'A starburst galaxy with prominent dust lanes and outflows, companion to M81.',
  M83: 'A barred spiral galaxy known for its active star formation and many supernovae.',
  M84: 'A lenticular or elliptical galaxy in the core of the Virgo Cluster.',
  M85: 'A lenticular galaxy, the northernmost member of the Virgo Cluster.',
  M86: 'An elliptical or lenticular galaxy in the heart of the Virgo Cluster.',
  M87: 'A giant elliptical galaxy with a famous jet; its central black hole was the first ever imaged.',
  // seed said "nearly edge-on"
  M88: 'A multi-arm spiral galaxy in the Virgo Cluster.',
  M89: 'An almost perfectly circular elliptical galaxy in the Virgo Cluster.',
  M90: 'A spiral galaxy approaching us, showing a rare blueshift.',
  M91: 'A barred spiral galaxy with very low surface brightness.',
  M92: 'A bright globular cluster often overlooked in favor of nearby M13.',
  M93: 'A bright open cluster with about 80 stars in a wedge-shaped pattern.',
  M94: 'A spiral galaxy with a bright central starburst ring.',
  M95: 'A barred spiral galaxy forming a group with M96 and M105.',
  M96: 'A spiral galaxy and the brightest member of the Leo I Group.',
  M97: 'A planetary nebula with two dark patches resembling an owl\'s eyes.',
  M98: 'A nearly edge-on spiral galaxy approaching us (blueshifted).',
  M99: 'An asymmetric spiral galaxy with one arm stretched by gravitational interaction.',
  M100: 'A grand-design face-on spiral galaxy in the Virgo Cluster.',
  // seed said "nearly twice the diameter of the Milky Way" — dropped
  M101: 'A large, face-on grand-design spiral galaxy.',
  M102: 'An edge-on lenticular galaxy with a prominent dust lane. M102\'s identity is disputed: Méchain later called it a duplicate observation of M101, but historical evidence favors NGC 5866.',
  M103: 'A small but pretty open cluster with a fan-shaped pattern of stars.',
  M104: 'An iconic nearly edge-on galaxy with a prominent dust lane and a large central bulge.',
  M105: 'An elliptical galaxy in the Leo I Group with a supermassive black hole.',
  M106: 'A Seyfert galaxy with anomalous spiral arms linked to its active galactic nucleus.',
  M107: 'A loose globular cluster with a relatively sparse center.',
  M108: 'A nearly edge-on barred spiral galaxy close to the Owl Nebula.',
  M109: 'A barred spiral galaxy with a bright central bar.',
  M110: 'An elliptical satellite galaxy of Andromeda, the last object added to the Messier catalog.',
  NGC869: 'Half of the spectacular Double Cluster in Perseus.',
  NGC884: 'The other half of the Double Cluster, visible in the same low-power field.',
  NGC7000: 'A large emission nebula shaped like North America, best seen with a UHC filter.',
  NGC6826: 'A small planetary nebula that seems to "blink" as you switch between direct and averted vision.',
  NGC6960: 'The western part of the Cygnus Loop supernova remnant, best with a UHC or OIII filter.',
  NGC6992: 'The eastern part of the Cygnus Loop, showing beautiful filamentary structure with a filter.',
  // seed attached this to IC 434; it describes the Horsehead itself (Barnard 33)
  B33: 'An iconic dark nebula shaped like a horse\'s head, silhouetted against the glowing IC 434. A challenge needing dark skies; an H-beta filter helps (OIII filters do not).',
  IC443: 'A large, faint supernova remnant requiring dark skies and nebula filters.',
};

// ---------------------------------------------------------------------------
// Double stars. Numbers (magnitudes, separation, PA, positions, spectral types, periods) are NOT
// typed here: they are read from the WDS summary / ORB6 at build time. `pair` = [WDS discoverer
// code, components] of the pair reported in sep/pa/mag2. `note` is a short well-established fact.
/** Epoch for orbit-based separations (ORB6 ephemeris column). */
export const DOUBLE_EPOCH = 2027.0;

export const DOUBLE_STARS = [
  { id: 'albireo', name: 'Albireo', wds: '19307+2758', pair: ['STFA 43', 'AB'],
    note: 'A stunning gold-and-blue double marking the head of Cygnus, the Swan.' },
  { id: 'mizar', name: 'Mizar and Alcor', wds: '13239+5456', pair: ['STF1744', 'AB'], subject: 'Mizar A and B',
    note: 'The famous double in the handle of the Big Dipper; together with Alcor it forms a sextuple star system.',
    extras: [{ pairs: [['STF1744', 'AC']], text: (p) => `Alcor (magnitude ${p.m2}) lies ${p.sep}″ (${p.sepArcmin}′) from Mizar, an easy naked-eye pair.` }] },
  { id: 'epsilon-lyrae', name: 'Epsilon Lyrae (Double Double)', wds: '18443+3940', pair: ['STF2382', 'AB'], pairLabel: 'ε¹',
    aliases: ['Double Double', 'Epsilon Lyrae', 'ε Lyr'],
    note: 'The famous "Double Double" near Vega.',
    extras: [{ pairs: [['STFA 37', 'AB,CD'], ['STF2383', 'CD']],
      text: (w, cd) => `ε¹ and ε² are ${w.sep}″ apart (easy in binoculars), and ε² splits into stars of magnitude ${cd.m1} and ${cd.m2}, ${cd.sep}″ apart.` }] },
  { id: 'almach', name: 'Almach', wds: '02039+4220', pair: ['STF 205', 'A,BC'],
    note: 'A showcase color-contrast double: a golden-orange primary with a blue companion.' },
  { id: 'castor', name: 'Castor', wds: '07346+3153', pair: ['STF1110', 'AB'],
    note: 'A bright, close pair in Gemini; Castor is a sextuple system in which A and B are spectroscopic binaries and faint Castor C is an eclipsing pair.',
    extras: [{ pairs: [['STF1110', 'AC']], text: (p) => `Castor C (magnitude ${p.m2}) lies ${p.sep}″ away.` }] },
  { id: 'rigel', name: 'Rigel', wds: '05145-0812', pair: ['STF 668', 'A,BC'],
    note: 'The brilliant blue-white supergiant of Orion; its faint companion is a classic test of optics in the glare.' },
  { id: 'polaris', name: 'Polaris', wds: '02318+8916', pair: ['STF  93', 'AB'],
    note: 'The North Star has a faint companion visible in small telescopes.' },
  { id: 'cor-caroli', name: 'Cor Caroli', wds: '12560+3819', pair: ['STF1692', 'AB'],
    note: 'An easy, attractive pair in Canes Venatici for any small telescope.' },
  { id: 'gamma-delphini', name: 'Gamma Delphini', wds: '20467+1607', pair: ['STF2727', 'AB'],
    note: 'A lovely pair in Job\'s Coffin, the diamond of Delphinus.' },
  { id: 'mesarthim', name: 'Mesarthim', wds: '01535+1918', pair: ['STF 180', 'AB'],
    note: 'An easy pair of near-twin white stars, one of the first doubles discovered with a telescope (Robert Hooke, 1664).' },
  { id: 'eta-cassiopeiae', name: 'Eta Cassiopeiae', wds: '00491+5749', pair: ['STF  60', 'AB'],
    note: 'A Sun-like star with a fainter, reddish companion.' },
  { id: 'iota-cancri', name: 'Iota Cancri', wds: '08467+2846', pair: ['STF1268', ''],
    note: 'A wide, easy color-contrast pair in Cancer.' },
  { id: 'beta-monocerotis', name: 'Beta Monocerotis', wds: '06288-0702', pair: ['STF 919', 'AB'],
    note: 'A superb triple of blue-white stars, described by William Herschel as one of the most beautiful sights in the heavens.',
    extras: [{ pairs: [['STF 919', 'BC']], text: (p) => `B and C (magnitudes ${p.m1} and ${p.m2}) are themselves ${p.sep}″ apart.` }] },
  { id: 'izar', name: 'Izar', wds: '14450+2704', pair: ['STF1877', 'AB'], aliases: ['Pulcherrima'],
    note: 'A beautiful but tight orange-and-blue pair that Struve called Pulcherrima, "the most beautiful"; it needs steady seeing.' },
  { id: 'algieba', name: 'Algieba', wds: '10200+1950', pair: ['STF1424', 'AB'],
    note: 'A bright pair of golden giants in the Sickle of Leo.' },
  { id: '61-cygni', name: '61 Cygni', wds: '21069+3845', pair: ['STF2758', 'AB'],
    note: 'A pair of orange dwarfs about 11.4 light-years away; 61 Cygni was the first star to have its distance measured (Bessel, 1838).' },
  { id: 'xi-ursae-majoris', name: 'Xi Ursae Majoris', wds: '11182+3132', pair: ['STF1523', 'AB'],
    note: 'The first binary star to have its orbit calculated (Félix Savary, 1827).' },
  { id: 'porrima', name: 'Porrima', wds: '12417-0127', pair: ['STF1670', 'AB'],
    note: 'A pair of near-identical white stars whose separation changes quickly: it was unsplittable around its 2005 periastron and is now widening.' },
  { id: 'delta-cephei', name: 'Delta Cephei', wds: '22292+5825', pair: ['STFA 58', 'AC'],
    note: 'The prototype Cepheid variable (magnitude 3.5–4.4 every 5.4 days), with a wide bluish companion.' },
  { id: 'zeta-aquarii', name: 'Zeta Aquarii', wds: '22288-0001', pair: ['STF2909', 'AB'],
    note: 'A close, near-equal pair at the center of the Water Jar asterism.' },
  { id: 'rasalgethi', name: 'Rasalgethi', wds: '17146+1423', pair: ['STF2140', 'AB'],
    note: 'A variable red supergiant whose companion looks greenish by contrast.' },
  { id: 'antares', name: 'Antares', wds: '16294-2626', pair: ['GNT   1', ''],
    note: 'The red supergiant heart of Scorpius; its greenish companion is a challenge close to the glare.' },
  { id: 'sigma-orionis', name: 'Sigma Orionis', wds: '05387-0236', pair: ['STF 762', 'AB,D'], subject: 'The bright pair σ Ori AB and companion D',
    note: 'A multiple star just southwest of Alnitak whose brightest member lights up IC 434, the glow behind the Horsehead.',
    extras: [{ pairs: [['STF 762', 'AB,E'], ['STF 762', 'AB,C']],
      text: (e, c) => `E (magnitude ${e.m2}) lies ${e.sep}″ away and C (magnitude ${c.m2}) ${c.sep}″ away.` }] },
  { id: '32-eridani', name: '32 Eridani', wds: '03543-0257', pair: ['STF 470', 'AB'],
    note: 'An attractive, colorful pair in Eridanus.' },
  { id: 'nu-draconis', name: 'Nu Draconis', wds: '17322+5511', pair: ['STFA 35', ''],
    note: 'A matched pair of white stars, easily split in binoculars.' },
  // ψ² and ψ³ Psc are unrelated stars, so no bare "ψ Psc" designation
  { id: 'psi1-piscium', name: 'Psi¹ Piscium', noSystemBayer: true, wds: '01057+2128', pair: ['STF  88', 'AB'],
    note: 'A wide, near-equal pair of white stars.' },
  { id: '24-comae-berenices', name: '24 Comae Berenices', wds: '12351+1823', pair: ['STF1657', 'AB'],
    note: 'A colorful pair often likened to Albireo.' },
  // ο² Cyg (32 Cyg) is a separate star, so no bare "ο Cyg" designation
  { id: 'omicron1-cygni', name: 'Omicron¹ Cygni', noSystemBayer: true, wds: '20136+4644', pair: ['STFA 50', 'AC'],
    note: 'An orange giant with a bluish companion.',
    extras: [{ pairs: [['STFA 50', 'AD']], text: (p) => `30 Cygni (magnitude ${p.m2}) lies ${p.sep}″ away, completing a fine wide triple.` }] },
  { id: 'alnitak', name: 'Alnitak', wds: '05407-0157', pair: ['STF 774', 'AB'],
    note: 'The easternmost belt star of Orion, a tight double next to the Flame Nebula.' },
  { id: 'alya', name: 'Alya', wds: '18562+0412', pair: ['STF2417', 'AB'],
    note: 'A matched pair of white stars at the tip of the Serpent\'s tail.' },
  { id: 'xi-bootis', name: 'Xi Boötis', wds: '14514+1906', pair: ['STF1888', 'AB'],
    note: 'A nearby binary of a yellow and an orange dwarf star.' },
  { id: '70-ophiuchi', name: '70 Ophiuchi', wds: '18055+0230', pair: ['STF2272', 'AB'],
    note: 'A nearby binary of two orange dwarf stars.' },
  { id: 'gamma-ceti', name: 'Gamma Ceti', wds: '02433+0314', pair: ['STF 299', 'AB'],
    note: 'A close, unequal pair — a good test for small telescopes.' },
  { id: 'alpha-centauri', name: 'Alpha Centauri', wds: '14396-6050', pair: ['RHD   1', 'AB'],
    note: 'The nearest star system to the Sun: two Sun-like stars in a mutual orbit.' },
  { id: 'acrux', name: 'Acrux', wds: '12266-6306', pair: ['DUN 252', 'AB'],
    note: 'The brightest star of the Southern Cross, splitting into two blue-white stars.' },
  { id: 'alfirk', name: 'Alfirk', wds: '21287+7034', pair: ['STF2806', 'AB'],
    note: 'The prototype of the Beta Cephei variable stars, with a faint companion.' },
  { id: '95-herculis', name: '95 Herculis', wds: '18015+2136', pair: ['STF2264', ''],
    note: 'A near-equal pair whose stars appear in contrasting tints to many observers.' },
  { id: 'acrab', name: 'Acrab', wds: '16054-1948', pair: ['H 3   7', 'AC'],
    note: 'A bright, easy pair of blue-white stars in Scorpius.' },
  { id: 'eta-persei', name: 'Eta Persei', wds: '02507+5554', pair: ['STF 307', 'AB'],
    note: 'A cool supergiant with a faint bluish companion.' },
  { id: '145-canis-majoris', name: '145 Canis Majoris', wds: '07166-2319', pair: ['HJ 3945', 'AB'],
    note: 'A wide, colorful pair: an orange supergiant and a yellow-white companion.' },
];

/** Messier 40 (Winnecke 4) uses the same WDS machinery. */
export const M40_PAIR = { wds: '12222+5805', pair: ['WNC   4', ''] };
/** The Trapezium (θ¹ Orionis) at the heart of M42 — mentioned in M42's description, not a separate entry. */
export const TRAPEZIUM = { wds: '05353-0523', disc: 'STF 748', pairs: ['AB', 'AC', 'AD', 'BC', 'BD', 'CD'] };
