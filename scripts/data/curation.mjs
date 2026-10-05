// Hand-curated, documented adjustments applied on top of the downloaded sources.
// Every entry states its source/justification; nothing here is invented data.
//
// Ids are the FINAL catalog ids (e.g. "M42", "NGC7000", "C14").
import { DESCRIPTIONS } from './descriptions.mjs';

export { DESCRIPTIONS };

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
  M16: ['cluster_nebula', 'OpenNGC Neb; M16 is the open cluster NGC 6611 inside the Eagle Nebula (IC 4703) — SEDS M16: "Open Star Cluster" with "an emission nebula"'],
  NGC2244: ['open_cluster', 'OpenNGC Cl+N; C50 is the cluster itself (Wikipedia Caldwell table: open cluster); the Rosette Nebula around it is C49'],
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
  NGC6885: [6, 'OpenNGC V=14.1 for C37 is not an integrated magnitude; Wikipedia Caldwell table gives 6'],
};

/**
 * SEDS Messier catalogue (messier.seds.org, Hartmut Frommert; accessed 2026-10-05), per Messier number:
 * [visual magnitude — "Visual Brightness" on the object's page, dimensions in arcmin — the SEDS data table
 * messier.seds.org/data.html]. The per-object pages quote globular-cluster extents "seen on deep photographs" (M4
 * page: 36′ photographic vs 26.3′ in the table), so the table's dimensions are used; for every other type the page
 * and the table agree. These are the values amateurs see quoted (the Wikipedia Messier articles cite them).
 *
 * The build uses the magnitude for every Messier object except globular clusters (Harris 2010 V_t, which matches
 * SEDS to ≤ 0.05 mag) and M40 (WDS component magnitudes), and the dimensions for every Messier object except
 * galaxies (OpenNGC/LEDA isophotal diameters, which also give the minor axis and position angle) and SIZE_OVERRIDES.
 */
export const SEDS_MESSIER = {
  1: [8.4, [6, 4]], 2: [6.5, [12.9]], 3: [6.2, [16.2]], 4: [5.6, [26.3]], 5: [5.6, [17.4]],
  6: [4.2, [25]], 7: [3.3, [80]], 8: [4.6, [90, 40]], 9: [7.7, [9.3]], 10: [6.6, [15.1]],
  11: [5.8, [14]], 12: [6.7, [14.5]], 13: [5.8, [16.6]], 14: [7.6, [11.7]], 15: [6.2, [12.3]],
  16: [6.4, [7]], 17: [6.0, [11]], 18: [7.5, [9]], 19: [6.8, [13.5]], 20: [6.3, [28]],
  21: [6.5, [13]], 22: [5.1, [24]], 23: [5.5, [27]], 24: [2.5, [90]], 25: [4.6, [32]],
  26: [8.0, [15]], 27: [7.4, [8, 5.7]], 28: [6.8, [11.2]], 29: [7.1, [7]], 30: [7.2, [11]],
  31: [3.4, [178, 63]], 32: [8.1, [8, 6]], 33: [5.7, [73, 45]], 34: [5.5, [35]], 35: [5.3, [28]],
  36: [6.3, [12]], 37: [6.2, [24]], 38: [7.4, [21]], 39: [4.6, [32]], 40: [8.4, [0.8]],
  41: [4.5, [38]], 42: [4.0, [85, 60]], 43: [9.0, [20, 15]], 44: [3.7, [95]], 45: [1.6, [110]],
  46: [6.0, [27]], 47: [4.4, [30]], 48: [5.5, [54]], 49: [8.4, [9, 7.5]], 50: [5.9, [16]],
  51: [8.4, [11, 7]], 52: [7.3, [13]], 53: [7.6, [12.6]], 54: [7.6, [9.1]], 55: [6.3, [19]],
  56: [8.3, [7.1]], 57: [8.8, [1.4, 1]], 58: [9.7, [5.5, 4.5]], 59: [9.6, [5, 3.5]], 60: [8.8, [7, 6]],
  61: [9.7, [6, 5.5]], 62: [6.5, [14.1]], 63: [8.6, [10, 6]], 64: [8.5, [9.3, 5.4]], 65: [9.3, [8, 1.5]],
  66: [8.9, [8, 2.5]], 67: [6.1, [30]], 68: [7.8, [12]], 69: [7.6, [7.1]], 70: [7.9, [7.8]],
  71: [8.2, [7.2]], 72: [9.3, [5.9]], 73: [9.0, [2.8]], 74: [9.4, [10.2, 9.5]], 75: [8.5, [6]],
  76: [10.1, [2.7, 1.8]], 77: [8.9, [7, 6]], 78: [8.3, [8, 6]], 79: [7.7, [8.7]], 80: [7.3, [8.9]],
  81: [6.9, [21, 10]], 82: [8.4, [9, 4]], 83: [7.6, [11, 10]], 84: [9.1, [5]], 85: [9.1, [7.1, 5.2]],
  86: [8.9, [7.5, 5.5]], 87: [8.6, [7]], 88: [9.6, [7, 4]], 89: [9.8, [4]], 90: [9.5, [9.5, 4.5]],
  91: [10.2, [5.4, 4.4]], 92: [6.4, [11.2]], 93: [6.0, [22]], 94: [8.2, [7, 3]], 95: [9.7, [4.4, 3.3]],
  96: [9.2, [6, 4]], 97: [9.9, [3.4, 3.3]], 98: [10.1, [9.5, 3.2]], 99: [9.9, [5.4, 4.8]], 100: [9.3, [7, 6]],
  101: [7.9, [22]], 102: [9.9, [5.2, 2.3]], 103: [7.4, [6]], 104: [8.0, [9, 4]], 105: [9.3, [4.8, 5.4]],
  106: [8.4, [19, 8]], 107: [7.9, [10]], 108: [10.0, [8, 1]], 109: [9.8, [7, 4]], 110: [8.5, [17, 10]],
};

const wiki = (title, revid) => `Wikipedia "${title}" infobox (rev ${revid})`;
const NGC2000 = 'NGC 2000.0 (Sinnott 1988) via the SEDS NGC/IC database, spider.seds.org/ngc (accessed 2026-10-05)';

/**
 * Sizes (arcmin) replacing OpenNGC/SEDS values that are not the commonly quoted visual dimensions. OpenNGC star-cluster
 * diameters are often core sizes from cluster catalogues, well below the visual extents in NGC 2000.0 / Wikipedia;
 * those are replaced where the reference is > 20% larger. [size, source].
 */
export const SIZE_OVERRIDES = {
  // Messier
  M16: [[33, 27], 'SEDS M16: its 7′ is the cluster; "the nebula extends much farther out, to a diameter of over 30′, corresponding to a linear size of about 55x45 light years" at 5,700 ly = 33′ × 27′ (OpenNGC 120′ × 25′)'],
  M24: [[120, 60], `${wiki('Small Sagittarius Star Cloud', 1373100846)}: 2° × 1° (SEDS gives a single 90′)`],
  M108: [[8.7, 2.2], `${wiki('Messier 108', 1377881649)}: 8′.7 × 2′.2 (SEDS 8′ × 1′); OpenNGC/LEDA 3.98′ × 1.66′ is under half the visual length`],
  // Caldwell star clusters (OpenNGC value in the comment)
  NGC663: [[15], wiki('NGC 663', 1370785828)], // C10; 6
  NGC457: [[20], wiki('NGC 457', 1373102082)], // C13; 7.8
  NGC7243: [[21], NGC2000], // C16; 15 (the Wikipedia infobox says 30.6″, a unit slip)
  NGC752: [[75], wiki('NGC 752', 1373206456)], // C28; 39
  NGC2244: [[24], wiki('NGC 2244', 1378064796)], // C50; 9.3
  NGC2360: [[14], wiki('NGC 2360', 1373101775)], // C58; 9
  NGC1851: [[11], wiki('NGC 1851', 1378537111)], // C73; 9
  NGC6124: [[29], wiki('NGC 6124', 1373100517)], // C75; 13.5
  NGC6541: [[15], wiki('NGC 6541', 1373118180)], // C78; 7.5
  NGC3201: [[20], wiki('NGC 3201', 1373294872)], // C79; 9.6
  NGC5139: [[36.3], wiki('Omega Centauri', 1375779961)], // C80; 27
  NGC6193: [[15], wiki('NGC 6193', 1378219013)], // C82; 8.1
  NGC5286: [[9.1], wiki('NGC 5286', 1373124594)], // C84; 6.6
  IC2391: [[50], wiki('IC 2391', 1370780151)], // C85; 29.1
  NGC6397: [[32], wiki('NGC 6397', 1373125068)], // C86; 15.3
  NGC1261: [[6.9], wiki('NGC 1261', 1373118125)], // C87; 5.1
  NGC5823: [[10], NGC2000], // C88; 3.9
  NGC3532: [[50], wiki('NGC 3532', 1375390482)], // C91; 12
  NGC6752: [[20.4], wiki('NGC 6752', 1373205568)], // C93; 13.2
  NGC4755: [[10], NGC2000], // C94; 7.8
  NGC6025: [[15], wiki('NGC 6025', 1373100486)], // C95; 11.4
  NGC3766: [[15], wiki('NGC 3766', 1377051344)], // C97; 6.9
  NGC4609: [[6.5], wiki('NGC 4609', 1373205444)], // C98; 5.4
  NGC362: [[14], wiki('NGC 362', 1373118242)], // C104; 8.7
  NGC4833: [[13.5], wiki('NGC 4833', 1347782360)], // C105; 8.4
  NGC104: [[43.8], wiki('47 Tucanae', 1376164626)], // C106; 31.8
  NGC6101: [[10.7], wiki('NGC 6101', 1241758718)], // C107; 4.5
  NGC4372: [[18], wiki('NGC 4372', 1328026127)], // C108; 12
  IC5146: [[12], wiki('IC 5146', 1368193183)], // C19; 10 × 10
  IC2944: [[75], wiki('IC 2944', 1322458341)], // C100; 7.2 (the cluster alone)
  NGC869: [[18], wiki('NGC 869', 1368523493)], // half of C14; 14.4
  NGC884: [[18], wiki('NGC 884', 1368524119)], // half of C14; 10.5
  // Caldwell nebulae
  NGC7000: [[120, 100], `${wiki('North America Nebula', 1370786467)}: 120 × 100 arcmin (NGC 2000.0: 120′); OpenNGC 120′ × 30′ is far too narrow`],
  NGC6960: [[70], `${NGC2000}: 70′; OpenNGC 210′ × 160′ is the whole Cygnus Loop, not the Western Veil`],
  NGC2070: [[40, 25], `${wiki('Tarantula Nebula', 1372343305)}: 40′ × 25′ (NGC 2000.0: 40′); OpenNGC 16′`],
  NGC6729: [[2.5, 2], `${wiki('NGC 6729', 1196860015)}: 2′.5 × 2′.0; OpenNGC 25′ × 20′ is ten times too large`],
  NGC7023: [[18], `${wiki('Iris Nebula', 1375893839)}: 18′ × 18′ (NGC 2000.0: 18′); OpenNGC 10′ × 8′`],
  NGC7662: [[0.53, 0.47], `${wiki('NGC 7662', 1375039733)}: 32″ × 28″; OpenNGC 17″ is only the bright inner shell`],
  NGC6543: [[0.33], `${wiki("Cat's Eye Nebula", 1369249613)}: core 20″; OpenNGC 0.9′`],
  // other popular objects
  NGC6334: [[35, 20], `${wiki('NGC 6334', 1370785670)}: 35 × 20 arcmin; OpenNGC 8.4′`],
  NGC2264: [[40], `${wiki('NGC 2264', 1370784441)}: 40′ for the cluster and its nebulosity; OpenNGC 11.4′`],
  IC1805: [[150], `${wiki('Heart Nebula', 1369573216)}: 150′ × 150′; OpenNGC 60′ is the brighter core`],
  NGC6357: [[50], `${NGC2000}: 50′ for the War and Peace Nebula; OpenNGC 3.9′ is only its central cluster`],
  NGC1977: [[20], `${NGC2000}: 20′ for the Running Man Nebula; OpenNGC 10.2′`],
  'ESO351-30': [[39.8, 30.9], `${wiki('Sculptor Dwarf Galaxy', 1373037672)}: 39′.8 × 30′.9 (NED); OpenNGC 15.26′`],
};

/**
 * Galaxy surface brightnesses dropped because they contradict the object's magnitude and size (the app then
 * estimates SB from mag and size). For galaxies resized above, sb is recomputed from the OpenNGC B magnitude.
 */
export const SB_REMOVE = {
  'ESO351-30': 'OpenNGC SurfBr 19.51 mag/arcsec² cannot hold for V = 8.6 spread over 40′ × 31′ (≈ 25 mag/arcsec²)',
};

/**
 * `magOf: "star"` — nebulae whose catalogue magnitude is that of the illuminating star, not the nebulosity
 * (checked against SIMBAD, accessed 2026-10-05). Every cluster_nebula entry except M42 gets `magOf: "cluster"`:
 * OpenNGC Cl+N magnitudes (and SEDS's 6.4 for M16) come from cluster photometry.
 */
export const MAG_OF_STAR = {
  NGC7023: 'HD 200775 (SIMBAD V 7.43) at its centre; the 7.2 (B) is dominated by the star',
  IC4592: 'ν Scorpii (SIMBAD B 4.05) ↔ OpenNGC B 3.9',
  IC4604: 'ρ Ophiuchi (SIMBAD B 4.85) ↔ OpenNGC B 5.1',
  IC4605: '22 Scorpii (SIMBAD B 4.72) ↔ OpenNGC B 4.7',
  NGC6164: 'HD 148937 (SIMBAD V 6.71) ↔ OpenNGC V 6.71',
  NGC6165: 'HD 148937 (SIMBAD V 6.71) ↔ OpenNGC V 6.71',
};
export const MAG_OF_CLUSTER_EXCEPT = new Set(['M42']);

/** OpenNGC position angles that are placeholders rather than measurements (dropped; the app then shows no orientation). */
export const PA_REMOVE = {
  M24: 'OpenNGC PosAng 90 (E–W) for IC 4715; the star cloud is elongated along the Milky Way, roughly NE–SW',
  B33: 'OpenNGC addendum PosAng 90 with a rough 6′ × 4′ size; the Horsehead is taller (N–S) than wide',
};

/** OpenNGC rows outside the selection rules that are included anyway (asterisms people look for). */
export const INCLUDE_ROWS = [
  'Cl399', // Brocchi's Cluster / the Coathanger (Cr 399), a favourite binocular asterism
];

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
  NGC3372: 'Carina Nebula', // the Wikipedia article title; "Eta Carinae Nebula" (Caldwell table) stays an alias
  NGC3132: 'Southern Ring Nebula', // the name used since the JWST images; "Eight-Burst Nebula" stays an alias
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
  { id: 'NGC3132', name: 'Southern Ring Nebula', designation: 'NGC 3132', wiki: { title: 'NGC 3132', revid: 1372045901 } },
  { id: 'IC2944', name: 'Running Chicken Nebula', designation: 'IC 2944', wiki: { title: 'IC 2944', revid: 1322458341 }, aliasOnly: true },
  { id: 'NGC2070', name: '30 Doradus', designation: 'NGC 2070', wiki: { title: 'Tarantula Nebula', revid: 1372343305 }, aliasOnly: true },
  { id: 'NGC6960', name: "Witch's Broom Nebula", designation: 'NGC 6960', wiki: { title: 'Veil Nebula', revid: 1321875694 }, aliasOnly: true },
  { id: 'NGC3628', name: 'Leo Triplet', designation: 'NGC 3628', wiki: { title: 'NGC 3628', revid: 1378214233 }, aliasOnly: true },
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
  NGC6530: 'It is the open cluster embedded in the Lagoon Nebula (M8).',
};

/**
 * Showpieces: classic "wow" objects for beginners and outreach (bright, striking in binoculars or a small
 * telescope). Southern-sky highlights are included; visibility from the user's site is handled by the app.
 */
export const SHOWPIECES = [
  'M31', 'M42', 'M13', 'M45', 'M57', 'M27', 'M51', 'M81', 'M82', 'M8', 'M17', 'M20', 'M11', 'M22', 'M44',
  'C14', 'NGC6960', 'NGC6992', 'albireo', 'mizar', 'epsilon-lyrae',
  'NGC5139', 'NGC104', 'NGC3372', 'M104', 'M97', 'M3', 'M5', 'M92', 'M15', 'M35', 'M37', 'M33',
  'NGC7000', 'NGC457', 'NGC7662', 'NGC6543', 'NGC2392', 'M65', 'M66', 'M64',
  'NGC4755', 'NGC5128', 'NGC253', 'M7',
  // added in the 2026-10 review
  'M6', 'M41', 'NGC3532', 'IC2602', 'ESO56-115', 'NGC292', 'NGC2070', 'NGC7009', 'NGC3242',
  'almach', 'beta-monocerotis', 'alpha-centauri',
];

/**
 * Descriptions reused from server/seed.ts (hand-written for the original app), lightly edited for
 * clarity; factual slips in the originals were corrected (noted inline). Messier and Caldwell objects now
 * use the curated texts in descriptions.mjs (DESCRIPTIONS, which take precedence); these remain for history.
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
// `starMags` replaces a WDS component magnitude by SIMBAD's V (accessed 2026-10-05) where the WDS
// summary value is off by ≥ 0.3 mag from the star's measured V (component letter -> [V, identifier]).
/** Epoch for orbit-based separations (ORB6 ephemeris column). */
export const DOUBLE_EPOCH = 2027.0;

export const DOUBLE_STARS = [
  { id: 'albireo', name: 'Albireo', wds: '19307+2758', pair: ['STFA 43', 'AB'], starMags: { B: [5.11, 'HD 183914 = β² Cyg'] },
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
  { id: 'iota-cancri', name: 'Iota Cancri', wds: '08467+2846', pair: ['STF1268', ''], dropNames: ['Zubanah'], starMags: { B: [6.57, 'HD 74738 = ι Cnc B'] },
    note: 'A wide, easy color-contrast pair in Cancer, often compared to Albireo.' },
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
  { id: 'acrab', name: 'Acrab', wds: '16054-1948', pair: ['H 3   7', 'AC'], starMags: { C: [4.89, 'HD 144218 = β² Sco'] },
    note: 'A bright, easy pair of blue-white stars in Scorpius.' },
  { id: 'eta-persei', name: 'Eta Persei', wds: '02507+5554', pair: ['STF 307', 'AB'],
    note: 'A cool supergiant with a faint bluish companion.' },
  { id: '145-canis-majoris', name: '145 Canis Majoris', wds: '07166-2319', pair: ['HJ 3945', 'AB'], aliases: ['Winter Albireo'],
    note: 'A wide, colorful pair: an orange supergiant and a yellow-white companion, nicknamed the Winter Albireo.' },
  // Added in the 2026-10 review.
  // θ¹ Ori: the entry reports C (the brightest) and D; WDS magnitudes of all four stars are 0.1–0.5 mag too bright.
  { id: 'trapezium', name: 'Trapezium', noSystemBayer: true, wds: '05353-0523', pair: ['STF 748', 'CD'], subject: 'θ¹ Ori C and D',
    aliases: ['Theta¹ Orionis', 'θ¹ Ori', 'Trapezium Cluster'], dropNames: ["Becklin's Star"], // the Becklin–Neugebauer infrared object, not θ¹ Ori
    starMags: { A: [6.73, 'HD 37020 = θ¹ Ori A'], B: [7.96, 'HD 37021 = θ¹ Ori B'], C: [5.13, 'HD 37022 = θ¹ Ori C'], D: [6.70, 'HD 37023 = θ¹ Ori D'] },
    note: 'The four bright young stars at the heart of the Orion Nebula (M42); the brightest, θ¹ Ori C, provides most of the ultraviolet light that makes the nebula glow.',
    extras: [{ pairs: [['STF 748', 'AB'], ['STF 748', 'AD']],
      text: (ab, ad) => `A (magnitude ${ab.m1}) and B (${ab.m2}), both eclipsing binaries, complete the trapezoid, whose widest pair (A–D) spans ${ad.sep}″; the fainter E and F, near magnitude 11, need more aperture and steady air.` }] },
  { id: 'struve-747', name: 'Struve 747', wds: '05350-0600', pair: ['STF 747', 'AB'], aliases: ['Σ747', 'Σ 747'],
    note: 'A wide, easy pair of blue-white stars in Orion’s sword, about half a degree south of the Orion Nebula and 8′ southwest of Iota Orionis.' },
  { id: 'iota-orionis', name: 'Iota Orionis', wds: '05354-0555', pair: ['STF 752', 'AB'], aliases: ['Hatysa', 'Nair al Saif'],
    note: 'The brightest star of Orion’s sword, at its southern tip below the Orion Nebula: a brilliant primary with a much fainter companion.',
    extras: [{ pairs: [['STF 752', 'AC']], text: (p) => `A third star, C (magnitude ${p.m2}), lies ${p.sep}″ away.` }] },
  { id: 'zeta-lyrae', name: 'Zeta Lyrae', wds: '18448+3736', pair: ['STFA 38', 'AD'], dropNames: ['Nasr Alwaki'],
    note: 'A wide, easy pair at the corner of Lyra’s parallelogram, a fine stop on the way from Vega to the Double Double (ε Lyr).' },
];

/** Messier 40 (Winnecke 4) uses the same WDS machinery. */
export const M40_PAIR = { wds: '12222+5805', pair: ['WNC   4', ''] };

/**
 * Star magnitudes (stars.json / starnames.json) where the Hipparcos catalogue V used by d3-celestial differs from the
 * standard Johnson V by ≥ 0.1 mag for a non-variable star among the ~75 brightest named stars (checked against
 * SIMBAD, accessed 2026-10-05): HIP -> [V, reason].
 */
export const STAR_MAG_OVERRIDES = {
  30438: [-0.74, 'Canopus: SIMBAD / Wikipedia V −0.74; Hipparcos lists −0.62'],
};
