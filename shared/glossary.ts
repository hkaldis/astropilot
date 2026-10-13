/**
 * The glossary: every term AstroPilot uses, in plain words. Shared by the app (the /glossary pages, the
 * pop-up definitions next to labels) and the server-rendered pages for search engines and AI assistants.
 *
 * Text may link to other terms as [[slug]] or [[slug|shown words]]. `examples` are object ids (catalog,
 * planets, moons) shown with their photographs; `widget` names an interactive demo on the term's page.
 */

export type GlossaryCategory = "deep-sky" | "stars" | "solar-system" | "events" | "sky" | "brightness" | "conditions" | "optics" | "names" | "astropilot";

export type GlossaryWidget = "magnitude" | "angular" | "eyepiece" | "bortle" | "seeing" | "transparency" | "altaz" | "phase" | "resolution" | "twilight" | "coma" | "pa";

export interface GlossaryTerm {
  slug: string;
  term: string;
  /** How to say it, for words people are unsure of: "MESS-ee-ay" (stressed syllable in capitals). */
  say?: string;
  /** Other names people search for ("DSO", "binary star"). */
  aliases?: string[];
  category: GlossaryCategory;
  /** One sentence: tooltips, search results and the page description. */
  short: string;
  /** A few short paragraphs. */
  body: string[];
  /** A practical tip for the eyepiece. */
  tip?: string;
  /** Where the term shows up in AstroPilot. */
  inApp?: string;
  examples?: string[];
  related?: string[];
  widget?: GlossaryWidget;
}

export const GLOSSARY_CATEGORIES: { id: GlossaryCategory; label: string; blurb: string }[] = [
  { id: "deep-sky", label: "Deep sky", blurb: "Galaxies, nebulae and star clusters far beyond the Solar System." },
  { id: "stars", label: "Stars", blurb: "Double, multiple and variable stars, colours and our own Milky Way." },
  { id: "solar-system", label: "Moon & planets", blurb: "The Moon, the planets, their moons and the things to look for on them." },
  { id: "events", label: "Sky events", blurb: "Eclipses, meteor showers, conjunctions, comets, aurorae and passes." },
  { id: "sky", label: "Finding your way", blurb: "Directions, coordinates and measuring the sky." },
  { id: "brightness", label: "Brightness & dark skies", blurb: "Magnitudes, light pollution and how the eye sees faint light." },
  { id: "conditions", label: "Weather & conditions", blurb: "What makes a night good: clouds, seeing, transparency, darkness." },
  { id: "optics", label: "Telescopes & optics", blurb: "Instruments, eyepieces, magnification and accessories." },
  { id: "names", label: "Catalogs & names", blurb: "Where object names like M 31, NGC 7000 and α Lyrae come from." },
  { id: "astropilot", label: "In AstroPilot", blurb: "The scores, ratings and views AstroPilot gives you." },
];

export const GLOSSARY: GlossaryTerm[] = [
  // ---------------------------------------------------------------------------------------- deep sky
  {
    slug: "deep-sky-object",
    term: "Deep-sky object",
    aliases: ["DSO", "deep sky"],
    category: "deep-sky",
    short: "Anything in the night sky beyond the Solar System that isn't a single star: star clusters, nebulae and galaxies.",
    body: [
      "Deep-sky objects are the faint, fuzzy treasures of the sky: [[open-cluster|open]] and [[globular-cluster|globular clusters]], [[nebula|nebulae]] and [[galaxy|galaxies]]. Most are far too faint to see without optical help, and many look like soft grey glows rather than the colourful pictures in books.",
      "Observers usually count [[double-star|double stars]] among them too, and catalogs such as the [[messier-catalog]] and the [[ngc-ic|NGC]] are made almost entirely of them.",
    ],
    tip: "Deep-sky objects reward a dark sky, a dark-adapted eye and patience more than magnification: see [[dark-adaptation]] and [[averted-vision]].",
    inApp: "Explore lists every deep-sky object in AstroPilot's catalog, ranked for your sky, your instrument and tonight's Moon.",
    examples: ["M31", "M13", "M42", "M57"],
    related: ["galaxy", "nebula", "open-cluster", "globular-cluster", "messier-catalog"],
  },
  {
    slug: "galaxy",
    term: "Galaxy",
    category: "deep-sky",
    short: "A vast system of billions of stars, gas and dust, held together by gravity — our own is the Milky Way.",
    body: [
      "Every star you see with the naked eye belongs to our own galaxy, the [[milky-way]]. Beyond it lie billions of others, from tiny dwarfs to giants of a trillion stars. The nearest large one, the Andromeda Galaxy (M 31), is about 2.5 million [[light-year|light-years]] away — the most distant thing you can see without optics.",
      "Through a telescope most galaxies are soft oval glows with a brighter core. Spiral arms and [[edge-on-galaxy|dust lanes]] need a dark sky, a bigger [[aperture]] and some practice. Astronomers sort them by shape: [[spiral-galaxy|spirals]], [[elliptical-galaxy|ellipticals]], lenticulars and irregulars (see [[hubble-type]]).",
    ],
    tip: "Galaxies are hurt most by [[light-pollution]] and moonlight. Use medium power (a 2–3 mm [[exit-pupil]]) and no nebula filter — galaxies shine in starlight, which those filters block.",
    examples: ["M31", "M51", "M81", "M104"],
    related: ["spiral-galaxy", "elliptical-galaxy", "edge-on-galaxy", "galaxy-group", "surface-brightness", "milky-way"],
  },
  {
    slug: "spiral-galaxy",
    term: "Spiral galaxy",
    aliases: ["barred spiral"],
    category: "deep-sky",
    short: "A galaxy with a bright central bulge and a flat disk of stars, gas and dust wound into spiral arms.",
    body: [
      "Spirals are the classic galaxy shape: an old, yellowish central bulge surrounded by a thin, rotating disk where new stars are born along the arms. In about two thirds of them a bar of stars crosses the centre — a barred spiral, like our own [[milky-way]].",
      "Seen face-on (M 51, M 101) their arms can show as mottled brightenings in medium and large telescopes under dark skies; seen side-on they become [[edge-on-galaxy|edge-on]] streaks.",
    ],
    tip: "The Whirlpool Galaxy (M 51) is the classic first spiral to try: its arms show in an 8-inch telescope on a dark, moonless night.",
    examples: ["M51", "M101", "M33", "M74"],
    related: ["galaxy", "hubble-type", "edge-on-galaxy"],
  },
  {
    slug: "elliptical-galaxy",
    term: "Elliptical galaxy",
    category: "deep-sky",
    short: "A smooth, featureless galaxy of mostly old stars, shaped like a ball or a squashed oval.",
    body: [
      "Ellipticals have little gas or dust left to make new stars, so they're full of old, yellowish stars and show no arms. They range from dwarfs like M 32 (a companion of Andromeda) to giants like M 87 in the Virgo [[galaxy-group|cluster]], which holds trillions of stars and a famous black hole.",
      "In a telescope they look like evenly glowing ovals that brighten smoothly towards the centre.",
    ],
    examples: ["M87", "M32", "M49", "M110"],
    related: ["galaxy", "hubble-type", "spiral-galaxy"],
  },
  {
    slug: "edge-on-galaxy",
    term: "Edge-on galaxy",
    aliases: ["dust lane"],
    category: "deep-sky",
    short: "A spiral galaxy seen exactly side-on: a thin streak of light, often split by a dark lane of dust.",
    body: [
      "When we see a spiral's disk side-on, its light piles up into a thin spindle, which makes edge-on galaxies easier to spot than face-on ones of the same brightness. The disk's dust shows as a dark lane along the middle.",
      "NGC 4565 (the Needle Galaxy), NGC 891 and M 104 (the Sombrero) are the showpieces.",
    ],
    tip: "Look for the dust lane with averted vision at medium-high power; it's one of the most satisfying details in deep-sky observing.",
    examples: ["NGC4565", "NGC891", "M104", "M82"],
    related: ["spiral-galaxy", "averted-vision", "galaxy"],
  },
  {
    slug: "galaxy-group",
    term: "Galaxy group & cluster",
    aliases: ["galaxy cluster", "compact group"],
    category: "deep-sky",
    short: "Galaxies bound together by gravity: a few in a group, hundreds to thousands in a cluster.",
    body: [
      "Galaxies rarely live alone. Our [[milky-way]] and Andromeda belong to the Local Group of about 80 galaxies. Larger clusters, like the Virgo Cluster 55 million light-years away, hold more than a thousand.",
      "Compact groups — Stephan's Quintet, Seyfert's Sextet — pack several galaxies into a field smaller than the Moon, and some are colliding.",
    ],
    tip: "Compact groups are tiny and faint: high power and a large aperture help. The Virgo Cluster's brightest members (M 84, M 86, M 87) fit in one low-power field.",
    examples: ["HCG92", "HCG79", "NGC4676", "M86"],
    related: ["galaxy", "elliptical-galaxy"],
  },
  {
    slug: "hubble-type",
    term: "Hubble type",
    aliases: ["galaxy classification", "Hubble sequence", "morphological type"],
    category: "deep-sky",
    short: "A short code for a galaxy's shape: E for elliptical, S0 for lenticular, Sa–Sd for spirals (SB if barred), Irr for irregular.",
    body: [
      "Edwin Hubble sorted galaxies by appearance in 1926, and his scheme is still in use. Ellipticals run from E0 (round) to E7 (elongated). Spirals run from Sa (big bulge, tightly wound arms) to Sd (small bulge, loose, ragged arms), with a B added for barred spirals — SBb, say. S0 galaxies have a disk but no arms; irregulars (Irr) have no clear shape.",
    ],
    inApp: "Object pages list the Hubble type under the size of each galaxy.",
    examples: ["M51", "M87", "M82", "M33"],
    related: ["galaxy", "spiral-galaxy", "elliptical-galaxy"],
  },
  {
    slug: "nebula",
    term: "Nebula",
    say: "NEB-yuh-luh; plural nebulae, NEB-yuh-lee",
    aliases: ["nebulae"],
    category: "deep-sky",
    short: "A cloud of gas and dust in space — glowing on its own, reflecting starlight, or blocking the light behind it.",
    body: [
      "“Nebula” is Latin for mist, and once meant any fuzzy patch in a telescope (galaxies included). Today it means interstellar clouds of gas and dust. They come in several kinds: [[emission-nebula|emission nebulae]] that glow like neon signs, [[reflection-nebula|reflection nebulae]] lit by nearby stars, [[dark-nebula|dark nebulae]] seen in silhouette, and the shells cast off by dying stars — [[planetary-nebula|planetary nebulae]] and [[supernova-remnant|supernova remnants]].",
    ],
    tip: "Most nebulae look grey to the eye, which can't see colour in faint light. A [[nebula-filter]] can transform the emission kinds.",
    examples: ["M42", "M8", "NGC7000", "M57"],
    related: ["emission-nebula", "reflection-nebula", "dark-nebula", "planetary-nebula", "supernova-remnant", "nebula-filter"],
  },
  {
    slug: "emission-nebula",
    term: "Emission nebula",
    aliases: ["HII region", "H II region", "star-forming region"],
    category: "deep-sky",
    short: "A cloud of gas made to glow by the ultraviolet light of hot young stars inside it — a stellar nursery.",
    body: [
      "Young, very hot stars flood their surroundings with ultraviolet light, which strips the electrons from hydrogen and oxygen atoms; when they recombine, the gas glows at particular colours — deep red hydrogen-alpha, blue-green hydrogen-beta and doubly ionised oxygen (OIII). Photographs show red; the eye, insensitive to deep red in the dark, sees grey or a faint green.",
      "The Orion Nebula (M 42), the Lagoon (M 8) and the North America Nebula (NGC 7000) are the great examples. Many contain the young [[open-cluster|clusters]] that light them (see [[cluster-nebula]]).",
    ],
    tip: "A UHC or OIII [[nebula-filter]] makes emission nebulae stand out dramatically, even from the suburbs. Use low power and a large [[exit-pupil]].",
    inApp: "Object pages say which filter suits each nebula.",
    examples: ["M42", "M8", "NGC7000", "M17"],
    related: ["nebula", "nebula-filter", "cluster-nebula", "reflection-nebula"],
  },
  {
    slug: "reflection-nebula",
    term: "Reflection nebula",
    category: "deep-sky",
    short: "A cloud of dust that shines by reflecting the light of nearby stars, usually bluish.",
    body: [
      "Dust grains scatter blue light more than red — the same reason the daytime sky is blue — so reflection nebulae look blue in photographs. They don't produce light of their own, so nebula filters don't help; they only dim them.",
      "The Pleiades are wrapped in faint reflection nebulosity (the Merope Nebula is the brightest part); M 78 in Orion is the brightest reflection nebula in the Messier catalog.",
    ],
    tip: "Clean optics and a dark, transparent sky matter: dew or dust on a lens scatters light and can mimic nebulosity around bright stars.",
    examples: ["M78", "NGC1435", "NGC1909", "NGC2261"],
    related: ["nebula", "emission-nebula", "transparency"],
  },
  {
    slug: "dark-nebula",
    term: "Dark nebula",
    aliases: ["Barnard object", "absorption nebula"],
    category: "deep-sky",
    short: "A dense cloud of dust seen in silhouette against the stars or glowing gas behind it.",
    body: [
      "Dark nebulae are holes that aren't holes: thick dust blocks the light of everything behind them. The Coalsack, next to the Southern Cross, is visible to the naked eye; the Horsehead Nebula (Barnard 33) is a dark pillar against the faint glow of IC 434.",
      "E. E. Barnard catalogued hundreds of them in the early 1900s — hence names like B 33.",
    ],
    tip: "The Horsehead is a famous challenge: it needs a dark sky, at least 8 inches of aperture and an H-beta [[nebula-filter]] to darken the sky around IC 434.",
    examples: ["B33", "C99"],
    related: ["nebula", "emission-nebula", "milky-way"],
  },
  {
    slug: "planetary-nebula",
    term: "Planetary nebula",
    aliases: ["PN"],
    category: "deep-sky",
    short: "A glowing shell of gas thrown off by a dying Sun-like star — nothing to do with planets.",
    body: [
      "When a star like the Sun runs out of fuel, it swells into a red giant and puffs its outer layers into space. The hot, exposed core (a future white dwarf) makes the shell glow, mostly in the green-blue light of oxygen. The glow lasts only some tens of thousands of years — a blink in a star's life.",
      "William Herschel named them in the 1780s because small ones looked like the disk of a planet in his telescope. They range from tiny bright disks a few arcseconds across to huge faint ones like the Helix.",
    ],
    tip: "Small planetaries need high power to look like more than a star; an OIII [[nebula-filter]] makes them pop. Try “blinking”: flick the filter in and out — the nebula stays, the stars dim.",
    inApp: "AstroPilot suggests high power for small planetaries and low power for large, faint ones like the Helix.",
    examples: ["M57", "M27", "NGC7293", "NGC6543"],
    related: ["nebula", "nebula-filter", "supernova-remnant", "angular-size"],
  },
  {
    slug: "supernova-remnant",
    term: "Supernova remnant",
    aliases: ["SNR"],
    category: "deep-sky",
    short: "The expanding debris of a star that exploded as a supernova.",
    body: [
      "A massive star ends its life in a supernova, an explosion briefly brighter than a whole galaxy. The blast wave sweeps up and heats the surrounding gas, which glows for tens of thousands of years.",
      "The Crab Nebula (M 1) is the remnant of a supernova seen in 1054; the Veil Nebula in Cygnus is the delicate, lacy edge of one that exploded some 10,000–20,000 years ago.",
    ],
    tip: "The Veil is transformed by an OIII [[nebula-filter]]: without it you may see nothing, with it the filaments look like twisted smoke.",
    examples: ["M1", "NGC6960", "NGC6992", "IC443"],
    related: ["nebula", "nebula-filter", "planetary-nebula"],
  },
  {
    slug: "cluster-nebula",
    term: "Cluster + nebula",
    category: "deep-sky",
    short: "A young star cluster still embedded in the cloud of gas it formed from, which its stars make glow.",
    body: [
      "Stars are born in clusters inside clouds of gas. For a few million years the youngest, hottest stars light up the leftover gas as an [[emission-nebula]], so we see the [[open-cluster|cluster]] and its nebula together. The Eagle Nebula (M 16) and the Orion Nebula with its [[multiple-star|Trapezium]] are the best known.",
    ],
    examples: ["M16", "M42", "NGC1977", "NGC2264"],
    related: ["emission-nebula", "open-cluster", "nebula-filter"],
  },
  {
    slug: "open-cluster",
    term: "Open cluster",
    aliases: ["galactic cluster", "star cluster"],
    category: "deep-sky",
    short: "A loose group of tens to thousands of young stars born together from the same cloud.",
    body: [
      "Open clusters are the stellar families of the [[milky-way]]'s disk: stars that formed together a few million to a few hundred million years ago, slowly drifting apart. Many are bright enough for binoculars — the Pleiades and the Beehive are naked-eye clusters.",
      "They look best at low to medium power, framed with dark sky around them so the cluster stands out from the background stars.",
    ],
    tip: "Don't overmagnify: a cluster that fills the whole field just looks like a rich star field. Aim for the cluster to fill about half the view.",
    examples: ["M45", "M44", "NGC869", "M11"],
    related: ["globular-cluster", "asterism", "true-field", "cluster-nebula"],
  },
  {
    slug: "globular-cluster",
    term: "Globular cluster",
    aliases: ["globular", "GC"],
    category: "deep-sky",
    short: "A dense ball of hundreds of thousands of very old stars orbiting in a galaxy's halo.",
    body: [
      "Globulars are among the oldest things in the universe — about 12 billion years old. Each packs up to millions of stars into a sphere a hundred light-years across. The Milky Way has about 150 of them, swarming around its centre like bees around a hive.",
      "In small telescopes they're fuzzy balls; with more [[aperture]] and higher power the edges break up into countless pinpoint stars, and the core blazes. Omega Centauri and 47 Tucanae in the southern sky are the greatest; M 13 in Hercules is the northern showpiece.",
    ],
    tip: "Use high power on a steady night: resolving a globular into stars is all about [[seeing]] and a small [[exit-pupil]] (about 1–1.5 mm).",
    examples: ["M13", "NGC5139", "M22", "NGC104"],
    related: ["open-cluster", "milky-way", "resolution", "seeing"],
  },
  {
    slug: "asterism",
    term: "Asterism",
    say: "ASS-tuh-riz-um",
    category: "deep-sky",
    short: "A recognisable pattern of stars that isn't an official constellation, like the Big Dipper or the Coathanger.",
    body: [
      "The Big Dipper (the Plough) is part of the constellation Ursa Major; the Summer Triangle spans three constellations; the Coathanger is a little hook of stars in Vulpecula. Asterisms are chance alignments — the stars are usually at very different distances — but they're great signposts for [[star-hopping]].",
    ],
    examples: ["Cr399", "M73"],
    related: ["constellation", "star-hopping", "open-cluster"],
  },
  {
    slug: "star-cloud",
    term: "Star cloud",
    category: "deep-sky",
    short: "A dense patch of the Milky Way where we look through a gap in the dust into thousands of distant stars.",
    body: [
      "Star clouds aren't clusters: they're windows. In Sagittarius and Scutum, gaps in the Milky Way's dust let us see deep into the galaxy's crowded inner regions. The Small Sagittarius Star Cloud (M 24) is a glittering field over a degree long — glorious in binoculars and at the lowest power.",
    ],
    examples: ["M24"],
    related: ["milky-way", "open-cluster", "dark-nebula"],
  },
  {
    slug: "magellanic-clouds",
    term: "Magellanic Clouds",
    say: "maj-uh-LAN-ik",
    aliases: ["LMC", "SMC", "Large Magellanic Cloud", "Small Magellanic Cloud"],
    category: "deep-sky",
    short: "Two small galaxies orbiting the Milky Way, visible to the naked eye from the southern hemisphere.",
    body: [
      "The Large and Small Magellanic Clouds look like detached pieces of the Milky Way in the far southern sky, 160,000 and 200,000 light-years away. A telescope sweeping across them finds clusters and nebulae galore — the Tarantula Nebula in the Large Cloud is the biggest star-forming region in our neighbourhood.",
    ],
    examples: ["ESO56-115", "NGC292", "NGC2070"],
    related: ["galaxy", "milky-way"],
  },

  // ------------------------------------------------------------------------------------------- stars
  {
    slug: "double-star",
    term: "Double star",
    aliases: ["binary star", "optical double", "visual double", "pair"],
    category: "stars",
    short: "Two stars that appear close together in the sky — either a true orbiting pair (binary) or a chance alignment.",
    body: [
      "Many “single” stars split into two in a telescope. In a true binary the two stars orbit each other, some in a few years, some over millennia. An optical double is a chance line-up of stars at very different distances.",
      "Doubles are perfect targets from light-polluted towns and on moonlit nights: they're bright, they show colour (Albireo's gold and blue is the classic), and they test your optics and the [[seeing]]. What matters is their [[separation]], the brightness difference between the stars and their [[position-angle]].",
    ],
    tip: "Close pairs need steady air and enough power — roughly 240 divided by the separation in arcseconds. Unequal pairs need even more, to lift the faint star out of the bright one's glare.",
    inApp: "Object pages give each pair's separation, magnitudes and position angle, the power that splits it, and whether your telescope can.",
    examples: ["albireo", "mizar", "epsilon-lyrae", "castor"],
    related: ["separation", "position-angle", "resolution", "multiple-star", "star-colour"],
    widget: "pa",
  },
  {
    slug: "multiple-star",
    term: "Multiple star",
    aliases: ["triple star", "double-double", "Trapezium"],
    category: "stars",
    short: "Three or more stars bound together or appearing together — like Epsilon Lyrae, the “Double Double”.",
    body: [
      "Many stars come in families. Epsilon Lyrae is two pairs: binoculars split the wide pair, and a telescope at about 150× splits each of those again. The Trapezium at the heart of the Orion Nebula is four young stars (six, with steady air and a larger telescope) lighting the gas around them. Castor in Gemini is six stars, three pairs, though a telescope shows three.",
    ],
    examples: ["epsilon-lyrae", "trapezium", "castor", "mizar"],
    related: ["double-star", "separation", "resolution"],
  },
  {
    slug: "variable-star",
    term: "Variable star",
    aliases: ["Cepheid", "Mira", "eclipsing binary"],
    category: "stars",
    short: "A star whose brightness changes — because it pulsates, erupts, or is eclipsed by a companion.",
    body: [
      "Delta Cephei swells and shrinks every 5.4 days, and its brightness rises and falls with it. Stars like it — Cepheids — pulse at a rate set by their true brightness, which let astronomers measure the distances of galaxies. Mira, in Cetus, fades from naked-eye brightness to invisibility over almost a year; Algol dims for a few hours every 2.9 days when a companion passes in front of it.",
    ],
    examples: ["delta-cephei"],
    related: ["magnitude", "double-star"],
  },
  {
    slug: "star-colour",
    term: "Star colour",
    aliases: ["star color", "spectral type", "colour index"],
    category: "stars",
    short: "Stars are coloured by their temperature: blue-white stars are the hottest, orange and red the coolest.",
    body: [
      "A star glows like a hot coal. The hottest stars, above 10,000 °C, shine blue-white (Rigel, Vega); the Sun, at about 5,500 °C, is yellow-white; cooler stars are orange (Arcturus) or red (Antares, Betelgeuse). Astronomers label them O, B, A, F, G, K and M from hottest to coolest.",
      "Colours are subtle to the eye but easiest to see in contrasting [[double-star|doubles]] — Albireo's gold and blue — and in slightly defocused bright stars.",
    ],
    examples: ["albireo", "antares", "rigel", "iota-cancri"],
    related: ["double-star", "magnitude"],
  },
  {
    slug: "milky-way",
    term: "Milky Way",
    aliases: ["our galaxy", "galactic plane"],
    category: "stars",
    short: "Our home galaxy — and the faint band of light across a dark sky, which is its disk seen from inside.",
    body: [
      "The Milky Way is a barred [[spiral-galaxy]] about 100,000 light-years across with a few hundred billion stars. The Sun sits in its disk, about 26,000 light-years from the centre, so we see the disk as a glowing band all around the sky, cut by [[dark-nebula|dark lanes]] of dust.",
      "The brightest part, towards the centre in Sagittarius and Scorpius, is highest on summer evenings from the northern hemisphere and on winter evenings from the southern. It needs a dark sky — it's invisible from most towns.",
    ],
    tip: "A dark site and fully [[dark-adaptation|dark-adapted]] eyes turn the Milky Way from a faint mist into a sky full of structure. Sweep it with binoculars.",
    examples: ["M24", "C99", "NGC7000"],
    related: ["galaxy", "light-pollution", "bortle-scale", "star-cloud"],
  },

  // ------------------------------------------------------------------------------------ solar system
  {
    slug: "the-moon",
    term: "The Moon",
    aliases: ["Moon", "lunar"],
    category: "solar-system",
    short: "Earth's only natural satellite, 3,474 km across and about 384,000 km away — the easiest telescope target of all.",
    body: [
      "The Moon goes round the Earth once a month, showing us the same face. Its [[phase]] changes as we see more or less of its sunlit side; the best detail is along the [[terminator]], where shadows are long.",
      "Its light is the biggest enemy of deep-sky observing: from about first quarter to last quarter, moonlight brightens the sky and hides faint [[galaxy|galaxies]] and [[nebula|nebulae]]. Planets, double stars and the Moon itself don't mind.",
    ],
    tip: "Never look at the full Moon at high power without a [[moon-filter]] if it dazzles you — and enjoy the crescent and quarter phases most.",
    inApp: "Tonight shows the Moon's phase, rise and set, and how much it brightens the sky; every rating accounts for moonlight.",
    examples: ["moon"],
    related: ["phase", "terminator", "mare", "crater", "libration", "earthshine", "moonlight"],
    widget: "phase",
  },
  {
    slug: "phase",
    term: "Phase",
    aliases: ["lunar phase", "waxing", "waning", "crescent", "gibbous", "first quarter", "last quarter"],
    category: "solar-system",
    short: "How much of the Moon's (or a planet's) sunlit side we can see: crescent, quarter, gibbous or full.",
    body: [
      "The Moon is always half-lit by the Sun; its phase is how much of that half faces us. From new Moon it waxes through crescent and first quarter (half-lit) to gibbous and full, then wanes back. A full cycle takes 29.5 days.",
      "Venus and Mercury show phases too, because they orbit inside Earth's orbit — Galileo's observation of Venus's phases helped prove that the planets go round the Sun.",
    ],
    tip: "The best lunar views are not at full Moon, when shadows vanish, but a few days either side of the quarters.",
    inApp: "AstroPilot draws the Moon's phase on Tonight, the sky chart and the Moon's page; the planets' pages show Mercury's, Venus's and Mars's.",
    examples: ["moon", "venus", "mercury"],
    related: ["the-moon", "terminator", "elongation"],
    widget: "phase",
  },
  {
    slug: "terminator",
    term: "Terminator",
    say: "TUR-mih-nay-ter",
    aliases: ["shadow line"],
    category: "solar-system",
    short: "The line between day and night on the Moon or a planet — where shadows are longest and detail is sharpest.",
    body: [
      "Along the terminator the Sun is rising or setting for that part of the Moon, so mountains and crater walls cast long shadows that make the relief leap out. A crater that's obvious near the terminator can almost disappear a few days later under a high Sun.",
    ],
    tip: "Follow the terminator night after night: it moves about 12° across the Moon each day, revealing new craters.",
    examples: ["moon"],
    related: ["phase", "crater", "the-moon"],
    widget: "phase",
  },
  {
    slug: "mare",
    term: "Mare",
    say: "MAH-ray; plural maria, MAH-ree-uh",
    aliases: ["maria", "lunar seas"],
    category: "solar-system",
    short: "One of the Moon's dark, smooth plains — ancient lava flows, once mistaken for seas.",
    body: [
      "The dark patches that make the “man in the Moon” are maria (singular mare, Latin for sea): vast basins flooded by dark basalt lava more than three billion years ago. The bright regions between them are older, cratered highlands.",
      "Binoculars show them easily; a telescope reveals wrinkle ridges, rilles (collapsed lava channels) and the smaller craters that pepper them.",
    ],
    examples: ["moon"],
    related: ["crater", "the-moon", "terminator"],
  },
  {
    slug: "crater",
    term: "Crater",
    category: "solar-system",
    short: "A bowl-shaped pit blasted out by an asteroid or comet impact, many with central peaks and terraced walls.",
    body: [
      "The Moon has hundreds of thousands of craters, from tiny pits to basins hundreds of kilometres across. Big young ones like Tycho and Copernicus are surrounded by bright rays of splashed debris that shine at full Moon.",
    ],
    examples: ["moon", "mercury", "callisto"],
    related: ["mare", "terminator", "the-moon"],
  },
  {
    slug: "libration",
    term: "Libration",
    say: "ly-BRAY-shun",
    category: "solar-system",
    short: "A slow rocking of the Moon as seen from Earth, which over time lets us see 59% of its surface.",
    body: [
      "The Moon keeps one face towards us, but its tilted, slightly elliptical orbit makes it seem to nod and turn a little each month. Features near the edge — the limb — come into view and slip away again, which keeps lunar observing fresh.",
    ],
    examples: ["moon"],
    related: ["the-moon", "phase"],
  },
  {
    slug: "earthshine",
    term: "Earthshine",
    aliases: ["ashen light"],
    category: "solar-system",
    short: "The faint glow on the dark part of a crescent Moon — sunlight reflected off the Earth.",
    body: [
      "From the Moon, a nearly full Earth hangs in the sky and lights up the lunar night. We see that light reflected back as a ghostly grey glow on the unlit part of a thin crescent, often called “the old Moon in the new Moon's arms”.",
    ],
    examples: ["moon"],
    related: ["phase", "the-moon"],
  },
  {
    slug: "planet",
    term: "Planet",
    aliases: ["planets"],
    category: "solar-system",
    short: "A world orbiting the Sun — Mercury, Venus, Mars, Jupiter, Saturn, Uranus and Neptune in our sky.",
    body: [
      "The planets shine by reflected sunlight and move against the stars from night to night (the word means “wanderer”). They stay close to the [[ecliptic]]. Unlike stars, which [[seeing|twinkle]], bright planets shine steadily, and a telescope shows each as a small disk.",
      "Jupiter's cloud belts and moons, Saturn's rings, Venus's [[phase|phases]] and Mars's polar cap are within reach of any telescope; Uranus and Neptune show tiny blue-green disks.",
    ],
    tip: "Planets need steady air more than dark skies. Observe them when they're high, and give your telescope time to [[cooldown|cool down]].",
    inApp: "Tonight and the sky chart show where each planet is; its page shows the size of its disk and its moons tonight.",
    examples: ["jupiter", "saturn", "mars", "venus"],
    related: ["opposition", "planetary-moon", "seeing", "ecliptic", "elongation"],
  },
  {
    slug: "planetary-moon",
    term: "Planetary moon",
    aliases: ["natural satellite", "moon of a planet"],
    category: "solar-system",
    short: "A natural satellite orbiting a planet — like Jupiter's Io or Saturn's Titan — seen as a star-like point next to it.",
    body: [
      "Jupiter's four big moons are visible in binoculars; Saturn's Titan in any telescope, and a few more of its moons with 6 inches or more. Mars's tiny Phobos and Deimos, Uranus's and Neptune's moons are hard tests that need big apertures and the planet's glare kept out of the field.",
      "Moons change position from night to night — and around Jupiter from hour to hour — passing in front of the planet ([[transit]]), behind it ([[occultation]]) or into its shadow ([[eclipse]]).",
    ],
    inApp: "AstroPilot shows where each moon is next to its planet tonight, with a slider through the night.",
    examples: ["io", "titan", "europa", "triton"],
    related: ["galilean-moons", "planet", "transit", "occultation"],
  },
  {
    slug: "galilean-moons",
    term: "Galilean moons",
    say: "gal-ih-LEE-un",
    aliases: ["Io", "Europa", "Ganymede", "Callisto"],
    category: "solar-system",
    short: "Jupiter's four large moons — Io, Europa, Ganymede and Callisto — discovered by Galileo in 1610.",
    body: [
      "Galileo's first telescope showed four “stars” lined up beside Jupiter that moved night by night: the first moons found orbiting another world. Io circles Jupiter in under two days, Callisto in about 17, so their dance changes visibly within an evening.",
      "With steady air you can watch a moon's black shadow crawl across Jupiter's clouds, or see a moon vanish into Jupiter's shadow.",
    ],
    examples: ["io", "europa", "ganymede", "callisto"],
    related: ["planetary-moon", "transit", "occultation", "great-red-spot"],
  },
  {
    slug: "great-red-spot",
    term: "Great Red Spot",
    aliases: ["GRS", "Jupiter's belts"],
    category: "solar-system",
    short: "A giant storm on Jupiter, larger than Earth, that has raged for at least 190 years.",
    body: [
      "The Great Red Spot is an enormous high-pressure storm in Jupiter's southern hemisphere. It has been shrinking — once three Earths wide, it's now about 1.3 — and its colour ranges from brick red to a pale salmon. It's only visible when it's on the side of Jupiter facing us, about every other evening for a few hours.",
      "Jupiter's dark belts and bright zones are cloud bands driven by its fast spin (under 10 hours); a light blue filter can lift their contrast.",
    ],
    tip: "Jupiter rotates so fast that features drift visibly in half an hour. Sketching helps your eye pick out detail.",
    examples: ["jupiter"],
    related: ["planet", "galilean-moons", "color-filter", "seeing"],
  },
  {
    slug: "saturns-rings",
    term: "Saturn's rings",
    aliases: ["Cassini Division", "ring tilt"],
    category: "solar-system",
    short: "Saturn's vast, thin rings of ice — with the Cassini Division, a dark gap between the two brightest.",
    body: [
      "The rings span 270,000 km but are often less than a kilometre thick. Over Saturn's 29-year orbit we see them from changing angles: wide open, or edge-on, when they almost vanish (as in 2025). The Cassini Division, a 4,800 km gap between the A and B rings, shows in small telescopes when the rings are open.",
    ],
    inApp: "Saturn's page draws the rings at tonight's tilt.",
    examples: ["saturn", "titan"],
    related: ["planet", "planetary-moon"],
  },
  {
    slug: "opposition",
    term: "Opposition",
    category: "solar-system",
    short: "When a planet is opposite the Sun in our sky — at its closest and brightest, and up all night.",
    body: [
      "Mars, Jupiter, Saturn, Uranus and Neptune come to opposition when the Earth passes between them and the Sun. The planet rises at sunset, is highest around midnight and shows its biggest disk. Mars's oppositions come every 26 months, and some bring it much closer than others.",
    ],
    tip: "The weeks around opposition are the best time to observe a planet — but it's worth looking for months either side.",
    examples: ["mars", "jupiter", "saturn"],
    related: ["planet", "conjunction", "elongation"],
  },
  {
    slug: "elongation",
    term: "Elongation",
    say: "ee-long-GAY-shun",
    aliases: ["greatest elongation"],
    category: "solar-system",
    short: "How far a planet appears from the Sun; Mercury and Venus are easiest to see at their greatest elongation.",
    body: [
      "Mercury and Venus orbit inside Earth's orbit, so they never stray far from the Sun: Mercury at most about 28°, Venus about 47°. Their greatest elongations — east in the evening sky, west in the morning — are the best times to see them, when they're highest in a dark sky.",
    ],
    examples: ["mercury", "venus"],
    related: ["planet", "phase", "opposition", "twilight"],
  },
  {
    slug: "ecliptic",
    term: "Ecliptic",
    say: "ih-KLIP-tik",
    aliases: ["zodiac"],
    category: "sky",
    short: "The Sun's yearly path across the sky — the planets and the Moon always stay close to it.",
    body: [
      "Because the planets orbit in nearly the same plane as the Earth, they and the Moon wander along a narrow band around the ecliptic, through the zodiac constellations. Its angle to your horizon changes through the year, which is why planets are sometimes high and sometimes skim the horizon.",
    ],
    related: ["planet", "constellation", "celestial-sphere"],
  },

  // ------------------------------------------------------------------------------------------ events
  {
    slug: "conjunction",
    term: "Conjunction",
    aliases: ["close approach", "appulse"],
    category: "events",
    short: "When two sky objects — planets, the Moon, bright stars — appear close together.",
    body: [
      "A conjunction is a line-of-sight effect: the objects are millions of kilometres apart, but from Earth they appear side by side. The Moon passing a bright planet, or two planets within a degree, make beautiful sights for the naked eye, binoculars and low-power telescopes.",
    ],
    inApp: "Tonight's “Coming up” lists conjunctions visible from your location.",
    related: ["occultation", "planet", "angular-size"],
  },
  {
    slug: "occultation",
    term: "Occultation",
    say: "ok-ul-TAY-shun",
    category: "events",
    short: "When one object passes in front of another and hides it — the Moon covering a star or planet, say.",
    body: [
      "As the Moon moves eastward against the stars, it covers (occults) stars and sometimes planets. A star blinks out instantly at the Moon's edge — proof that the Moon has no atmosphere. Jupiter occults its own moons, too, as they pass behind it.",
    ],
    examples: ["moon", "jupiter", "io"],
    related: ["conjunction", "transit", "eclipse", "galilean-moons"],
  },
  {
    slug: "transit",
    term: "Transit",
    aliases: ["shadow transit", "meridian transit"],
    category: "events",
    short: "When a small body crosses the face of a larger one — a moon over Jupiter, or Mercury over the Sun.",
    body: [
      "Jupiter's moons and their shadows regularly cross the planet's disk: the shadow is a sharp black dot, the moon itself is hard to spot against the clouds. Mercury and Venus occasionally transit the Sun (only ever observe the Sun with a proper solar filter).",
      "Astronomers also say an object transits when it crosses the [[meridian]] — that's when it's highest.",
    ],
    examples: ["jupiter", "io", "ganymede"],
    related: ["occultation", "galilean-moons", "meridian"],
  },
  {
    slug: "eclipse",
    term: "Eclipse",
    aliases: ["lunar eclipse", "solar eclipse", "totality"],
    category: "events",
    short: "When one body moves into another's shadow: the Moon into Earth's (lunar eclipse) or the Moon's shadow onto Earth (solar).",
    body: [
      "A lunar eclipse happens at full Moon, when it passes through Earth's shadow and turns coppery red; it's visible from the whole night side of the Earth. A solar eclipse happens at new Moon, when the Moon blocks the Sun — total only along a narrow path.",
      "Jupiter's moons are eclipsed too, when they pass into Jupiter's shadow and fade out in a few minutes.",
    ],
    tip: "A lunar eclipse is safe to watch with any optics. A solar eclipse needs certified eclipse glasses or a solar filter except during totality.",
    inApp: "Tonight's “Coming up” lists eclipses visible from your location, with the contact times.",
    related: ["occultation", "the-moon", "galilean-moons"],
  },
  {
    slug: "meteor-shower",
    term: "Meteor shower",
    aliases: ["meteor", "shooting star", "radiant", "ZHR", "zenithal hourly rate"],
    category: "events",
    short: "A night with many shooting stars, when Earth passes through the dusty trail of a comet.",
    body: [
      "Meteors are grains of comet dust burning up 100 km overhead. In a shower they all seem to fly out from one point, the radiant (the Perseids from Perseus, the Geminids from Gemini). The ZHR — zenithal hourly rate — is how many you'd see per hour in a perfectly dark sky with the radiant overhead; real counts are lower, especially with moonlight or a low radiant.",
    ],
    tip: "No telescope needed: lie back somewhere dark, look about halfway up the sky (not at the radiant), and give it an hour. After midnight is usually best.",
    inApp: "Tonight's “Coming up” lists meteor-shower peaks with the radiant's height for your location and how much the Moon interferes.",
    related: ["comet", "dark-adaptation", "moonlight"],
  },
  {
    slug: "comet",
    term: "Comet",
    aliases: ["coma", "tail", "nucleus"],
    category: "events",
    short: "A small icy body that grows a glowing head (coma) and tails when it nears the Sun.",
    body: [
      "A comet's nucleus is a few kilometres of ice and dust. As it nears the Sun the ice turns to gas, making a fuzzy coma and tails pushed away from the Sun: a curved dust tail and a straight, bluish ion tail. Most comets are telescopic smudges; a bright naked-eye comet comes along every few years.",
    ],
    tip: "Comets look like fuzzy stars that move slowly against the background over a night. Low power and a dark sky show the tail best.",
    inApp: "Tonight lists comets within reach, with positions from NASA/JPL.",
    related: ["meteor-shower", "magnitude"],
  },
  {
    slug: "aurora",
    term: "Aurora",
    aliases: ["northern lights", "southern lights", "aurora borealis"],
    category: "events",
    short: "Curtains of light in the sky near the poles, caused by solar particles hitting the upper atmosphere.",
    body: [
      "When gusts of charged particles from the Sun reach the Earth, its magnetic field funnels them towards the poles, where they make oxygen glow green and red and nitrogen pink and violet. Big geomagnetic storms push aurorae far from the poles — they have been seen from Greece and the Mediterranean in strong storms.",
    ],
    tip: "Cameras pick up aurorae better than the eye: a phone's night mode often shows colour that looks grey by eye.",
    inApp: "Tonight shows the chance of an aurora for your latitude from NOAA's Kp forecast.",
    related: ["kp-index"],
  },
  {
    slug: "kp-index",
    term: "Kp index",
    aliases: ["Kp", "geomagnetic storm"],
    category: "events",
    short: "A 0–9 scale of how disturbed Earth's magnetic field is — the higher, the farther from the poles aurorae reach.",
    body: [
      "Kp 0–2 is quiet; Kp 5 is a minor geomagnetic storm, when aurorae can reach about 55–60° latitude; Kp 7–9 storms bring them to 45° or lower. NOAA's Space Weather Prediction Center forecasts it a few days ahead.",
    ],
    related: ["aurora"],
  },
  {
    slug: "iss-pass",
    term: "Space station pass",
    aliases: ["ISS", "satellite pass", "Tiangong"],
    category: "events",
    short: "A few minutes when the International Space Station (or China's Tiangong) crosses your sky, lit by the Sun.",
    body: [
      "Space stations orbit 400 km up and circle the Earth every 90 minutes. You can see them for a few minutes after dusk or before dawn, when you're in darkness but they're still in sunlight: a bright, steady point gliding across the sky, often brighter than any star. They fade suddenly when they enter Earth's shadow.",
    ],
    inApp: "Tonight lists visible passes for your location, with times, direction and brightness.",
    related: ["twilight", "magnitude", "azimuth"],
  },

  // ------------------------------------------------------------------------------------------- the sky
  {
    slug: "celestial-sphere",
    term: "Celestial sphere",
    category: "sky",
    short: "The imaginary dome of the sky around the Earth, on which the stars appear fixed and turn as the Earth rotates.",
    body: [
      "Everything in the sky is so far away that it looks painted on a giant sphere. As the Earth turns, that sphere seems to rotate around the celestial poles (near Polaris in the north), carrying the stars from east to west. [[right-ascension|Right ascension]] and [[declination]] are latitude and longitude on this sphere.",
    ],
    related: ["right-ascension", "declination", "circumpolar", "meridian"],
  },
  {
    slug: "altitude",
    term: "Altitude",
    aliases: ["elevation", "height above the horizon"],
    category: "sky",
    short: "How high an object is above the horizon, from 0° on the horizon to 90° straight overhead.",
    body: [
      "Altitude, with [[azimuth]], tells you where to look. Low objects shine through much more air: they're dimmer (see [[extinction]]), redder and blurred by [[seeing]]. Most objects are best near their highest point, when they cross the [[meridian]].",
    ],
    tip: "Measure altitude with your hand at arm's length: a fist is about 10°, so the horizon to overhead is about nine fists.",
    inApp: "AstroPilot gives every object's altitude and direction, the hours when it's above your minimum altitude, and when it's highest.",
    related: ["azimuth", "zenith", "meridian", "extinction", "angular-size"],
    widget: "altaz",
  },
  {
    slug: "azimuth",
    term: "Azimuth",
    say: "AZ-ih-muth",
    aliases: ["compass direction", "bearing"],
    category: "sky",
    short: "The compass direction of an object along the horizon: 0° north, 90° east, 180° south, 270° west.",
    body: [
      "Together with [[altitude]], azimuth pins down any point in your sky. AstroPilot also gives it as a compass point — “towards the SSE (158°)”.",
    ],
    inApp: "The sky chart and object pages say where to face, and the sky chart can turn to match your view.",
    related: ["altitude", "zenith"],
    widget: "altaz",
  },
  {
    slug: "zenith",
    term: "Zenith",
    say: "ZEE-nith (or ZEN-ith)",
    category: "sky",
    short: "The point directly overhead — altitude 90°.",
    body: [
      "Objects near the zenith shine through the least air, so they're as bright and sharp as they get. (Its opposite, straight down through the Earth, is the nadir.)",
    ],
    tip: "Dobsonian telescopes can be awkward right at the zenith; objects a little lower are easier to track.",
    related: ["altitude", "meridian", "extinction"],
    widget: "altaz",
  },
  {
    slug: "meridian",
    term: "Meridian",
    aliases: ["culmination", "highest point", "transit time"],
    category: "sky",
    short: "The north–south line across the sky through the zenith; objects are highest when they cross it.",
    body: [
      "Every star and planet rises in the east, climbs to its highest point as it crosses the meridian — it culminates, or transits — and sinks towards the west. Crossing the meridian is usually the best time to observe it.",
    ],
    inApp: "“Highest” times on AstroPilot are meridian crossings; the Through the year chart shows the months when an object is highest in the evening.",
    related: ["altitude", "zenith", "celestial-sphere"],
  },
  {
    slug: "right-ascension",
    term: "Right ascension",
    aliases: ["RA"],
    category: "sky",
    short: "The sky's “longitude”, measured eastward in hours, minutes and seconds (0h to 24h).",
    body: [
      "Right ascension is measured from the point where the Sun crosses the celestial equator in March. It's counted in hours because the sky turns once a day: an object 1h further east in right ascension crosses the [[meridian]] an hour later.",
    ],
    inApp: "Object pages give the right ascension and [[declination]] for the [[epoch|J2000]] epoch.",
    related: ["declination", "celestial-sphere", "epoch"],
  },
  {
    slug: "declination",
    term: "Declination",
    say: "dek-lih-NAY-shun",
    aliases: ["Dec"],
    category: "sky",
    short: "The sky's “latitude”: degrees north (+) or south (−) of the celestial equator.",
    body: [
      "Declination runs from +90° at the north celestial pole to −90° at the south. With your latitude it decides whether an object ever rises and how high it gets: an object's highest altitude is 90° minus the difference between your latitude and its declination.",
    ],
    related: ["right-ascension", "circumpolar", "altitude"],
  },
  {
    slug: "epoch",
    term: "Epoch (J2000)",
    aliases: ["J2000", "precession"],
    category: "sky",
    short: "The date that coordinates refer to — usually J2000, the start of the year 2000 — because the sky's grid slowly shifts.",
    body: [
      "The Earth's axis wobbles like a spinning top over 26,000 years (precession), so the grid of right ascension and declination slides slowly against the stars. Catalogs give coordinates for a standard epoch, J2000; for the next few decades the difference is a small fraction of a degree.",
    ],
    related: ["right-ascension", "declination"],
  },
  {
    slug: "constellation",
    term: "Constellation",
    category: "sky",
    short: "One of 88 official regions of the sky, most named after ancient star patterns.",
    body: [
      "Constellations began as star pictures — Orion the hunter, Scorpius the scorpion — but in 1930 astronomers fixed 88 precise regions covering the whole sky, so every object lies in exactly one. A pattern that isn't a constellation is an [[asterism]].",
    ],
    inApp: "AstroPilot names the constellation for every object, and the sky chart draws their figures and boundaries.",
    related: ["asterism", "star-hopping", "bayer-designation"],
  },
  {
    slug: "circumpolar",
    term: "Circumpolar",
    say: "sur-kum-POH-ler",
    category: "sky",
    short: "Never setting: close enough to the celestial pole that, from your latitude, it circles the pole all night.",
    body: [
      "From latitude 40° north, every object with a declination above +50° is circumpolar — Ursa Major, Cassiopeia, the Double Cluster. The farther from the equator you live, the more of the sky never sets (and the more never rises).",
    ],
    inApp: "Object pages say when something is circumpolar from your site.",
    related: ["declination", "celestial-sphere", "altitude"],
  },
  {
    slug: "angular-size",
    term: "Angular size",
    aliases: ["arcminute", "arcsecond", "degree", "apparent size"],
    category: "sky",
    short: "How big something looks, as an angle: degrees (°), arcminutes (′, 1/60°) and arcseconds (″, 1/60′).",
    body: [
      "We can't measure sky objects in kilometres by eye, so we measure the angle they span. The full Moon is about 31′ (half a degree); Jupiter about 45″; the Andromeda Galaxy over 3°; the components of a close [[double-star]] can be 1″ apart.",
      "Your hand is a ready ruler at arm's length: a little finger covers about 1°, three middle fingers about 5°, a fist about 10°.",
    ],
    inApp: "Every object page gives its size and compares fields of view with the full Moon.",
    examples: ["M31", "jupiter", "moon", "M57"],
    related: ["separation", "true-field", "resolution"],
    widget: "angular",
  },
  {
    slug: "separation",
    term: "Separation",
    aliases: ["sep"],
    category: "sky",
    short: "The angle between two objects — for a double star, the distance between its stars in arcseconds.",
    body: [
      "Separation decides how easy a double star is: Albireo's 34″ splits at 20×; Epsilon Lyrae's pairs, about 2.3″ apart, need 100–150× and steady air. Your telescope's [[resolution]] sets the limit.",
    ],
    examples: ["albireo", "epsilon-lyrae", "mizar"],
    related: ["double-star", "position-angle", "resolution", "angular-size"],
    widget: "resolution",
  },
  {
    slug: "position-angle",
    term: "Position angle",
    aliases: ["PA"],
    category: "sky",
    short: "The direction of one object from another, measured from north (0°) through east (90°).",
    body: [
      "For a double star, the position angle says where to look for the companion: 0° is due north of the bright star, 90° east, 180° south, 270° west. For a galaxy it's the direction of its long axis. Remember that telescopes flip and rotate the view (see [[orientation]]).",
    ],
    inApp: "Double-star pages draw the pair at its position angle; the eyepiece view draws galaxies at theirs.",
    examples: ["rigel", "albireo", "polaris"],
    related: ["double-star", "separation", "orientation"],
    widget: "pa",
  },
  {
    slug: "orientation",
    term: "Orientation",
    aliases: ["north up", "east left", "mirror image", "star diagonal"],
    category: "sky",
    short: "Sky charts show north up and east left; telescopes rotate or mirror the view, so it may not match.",
    body: [
      "Facing south, east is on your left — so sky charts show east on the left, the reverse of a map of the ground. In the eyepiece it changes: a Newtonian or Dobsonian turns the view upside down (rotated 180°); a refractor, SCT or Maksutov with a star diagonal shows a mirror image. Binoculars and finders with prisms show it the right way up.",
    ],
    tip: "To work out where north is in the eyepiece, nudge the telescope towards Polaris: new stars enter the field from the north side.",
    inApp: "AstroPilot's photos and eyepiece views are north up, east left.",
    related: ["position-angle", "star-hopping", "dobsonian"],
  },
  {
    slug: "star-hopping",
    term: "Star hopping",
    category: "sky",
    short: "Finding a faint object by hopping from a bright star through recognisable patterns of fainter ones.",
    body: [
      "Without a computerised mount, observers find objects the way sailors used landmarks: start at a bright star you can see, then follow chains and shapes of stars in the [[finder]] and eyepiece until the target appears. It's a skill that turns the sky into familiar territory.",
    ],
    inApp: "Object pages name the nearest bright star and its direction, and the sky chart shows the route.",
    related: ["finder", "constellation", "asterism", "true-field"],
  },
  {
    slug: "light-year",
    term: "Light-year",
    aliases: ["ly", "parsec", "pc"],
    category: "sky",
    short: "The distance light travels in a year: about 9.5 trillion kilometres. A parsec is 3.26 light-years.",
    body: [
      "Distances in space are so vast that astronomers measure them by light's travel time. Light takes 1.3 seconds from the Moon, 8 minutes from the Sun, 4.2 years from the nearest star, 1,300 years from the Orion Nebula and 2.5 million years from the Andromeda Galaxy — so you see each as it was when that light set off.",
    ],
    examples: ["alpha-centauri", "M42", "M31"],
    related: ["galaxy", "milky-way"],
  },

  // ------------------------------------------------------------------------------------- brightness
  {
    slug: "magnitude",
    term: "Magnitude",
    aliases: ["apparent magnitude", "mag", "brightness"],
    category: "brightness",
    short: "The brightness of a sky object on a reversed scale: smaller numbers are brighter, and each step is 2.5× fainter.",
    body: [
      "The scale goes back to ancient Greece, where the brightest stars were “first magnitude” and the faintest “sixth”. Today it's exact: 5 magnitudes are a factor of 100, so each magnitude is 2.512× fainter. Very bright objects go negative — Sirius is −1.5, Venus up to −4.7, the full Moon −12.7.",
      "Under a dark sky the eye reaches about magnitude 6.5; binoculars about 9.5; an 8-inch telescope about 14. For extended objects, the total magnitude can mislead — see [[surface-brightness]].",
    ],
    inApp: "Magnitudes appear on every object page and in the sky chart, whose star sizes follow them.",
    related: ["limiting-magnitude", "surface-brightness", "light-grasp", "extinction"],
    widget: "magnitude",
  },
  {
    slug: "limiting-magnitude",
    term: "Limiting magnitude",
    aliases: ["NELM", "naked-eye limiting magnitude"],
    category: "brightness",
    short: "The faintest magnitude you can see — with the naked eye (NELM) or through a given telescope.",
    body: [
      "Your naked-eye limiting magnitude measures the sky: about 4 or less in a city, 5–6 in the suburbs, 7 or more at a truly dark site. A telescope's limit adds roughly 5 × log₁₀(aperture ÷ 7 mm) magnitudes to that — so the darker your sky, the deeper every telescope goes.",
    ],
    tip: "Estimate your NELM by counting stars inside a known triangle of stars, or simply note the faintest star you can hold in the Little Dipper.",
    inApp: "Gear pages give each telescope's limiting magnitude under a dark sky.",
    related: ["magnitude", "bortle-scale", "sqm", "light-grasp"],
    widget: "bortle",
  },
  {
    slug: "surface-brightness",
    term: "Surface brightness",
    aliases: ["SB", "mag/arcmin²"],
    category: "brightness",
    short: "How bright an object is per patch of sky — what really decides whether a galaxy or nebula is easy to see.",
    body: [
      "Two galaxies of the same total [[magnitude]] can be easy or nearly invisible: if one packs its light into a small disk and the other spreads it over a big area, the big one has a low surface brightness and barely stands out from the sky. That's why M 33 and M 101, bright on paper, are notoriously hard from light-polluted places.",
      "It's given in magnitudes per square arcminute (or arcsecond); smaller numbers are brighter. Magnification doesn't change it — but it darkens the sky background, which helps small objects.",
    ],
    inApp: "AstroPilot's visibility ratings use surface brightness, not just total magnitude.",
    examples: ["M33", "M101", "M57"],
    related: ["magnitude", "light-pollution", "exit-pupil", "contrast"],
  },
  {
    slug: "light-pollution",
    term: "Light pollution",
    aliases: ["skyglow", "sky glow"],
    category: "brightness",
    short: "Artificial light scattered into the sky, which brightens it and hides faint stars, galaxies and nebulae.",
    body: [
      "Streetlights and buildings send light upward, where the air scatters it into a glow over towns that can stretch 100 km. Most people in Europe and North America can no longer see the Milky Way from home. It hurts [[galaxy|galaxies]] and faint nebulae most; planets, the Moon and double stars barely notice.",
    ],
    tip: "Even a short drive away from town lights helps enormously; so does shielding your eyes from nearby lights. A [[nebula-filter]] helps emission nebulae, but nothing restores galaxies except a darker sky.",
    inApp: "Each location's sky darkness comes from the 2025 World Atlas of Artificial Night Sky Brightness.",
    related: ["bortle-scale", "sqm", "limiting-magnitude", "nebula-filter"],
    widget: "bortle",
  },
  {
    slug: "bortle-scale",
    term: "Bortle scale",
    say: "BOR-tul",
    aliases: ["Bortle class"],
    category: "brightness",
    short: "A 1–9 scale of night-sky darkness, from 1 (pristine, the Milky Way casts shadows) to 9 (inner city).",
    body: [
      "John Bortle published the scale in 2001 to help observers describe their skies. Class 1–2 skies show the zodiacal light, airglow and the Milky Way in rich detail; class 4 is rural-to-suburban, where the Milky Way still shows but is washed out near the horizon; class 6–7 suburbs show only its brightest parts, if any; class 8–9 city skies show a few dozen stars.",
    ],
    inApp: "Your location's Bortle class (B1–B9) appears next to its name; every visibility rating depends on it.",
    related: ["light-pollution", "sqm", "limiting-magnitude", "milky-way"],
    widget: "bortle",
  },
  {
    slug: "sqm",
    term: "SQM",
    aliases: ["sky quality meter", "mag/arcsec²", "sky brightness"],
    category: "brightness",
    short: "Sky brightness in magnitudes per square arcsecond — higher numbers are darker (22 is pristine, 18 is a city).",
    body: [
      "A Sky Quality Meter measures how bright the zenith sky is. The number works like a magnitude: a reading of 21.5 means each square arcsecond of sky glows like a star of magnitude 21.5. Pristine sites read about 21.9–22; suburbs 19–20; city centres 18 or below.",
    ],
    inApp: "AstroPilot shows the SQM value behind each Bortle class, estimated from the light-pollution atlas or entered by you.",
    related: ["bortle-scale", "light-pollution", "surface-brightness"],
    widget: "bortle",
  },
  {
    slug: "dark-adaptation",
    term: "Dark adaptation",
    aliases: ["night vision", "red light"],
    category: "brightness",
    short: "Your eyes becoming far more sensitive in the dark — it takes 20–30 minutes and one white light ruins it.",
    body: [
      "In darkness your pupils open to 5–7 mm within seconds, but the real gain is chemical: the rods in your retina rebuild a light-sensitive pigment over 20–30 minutes, making you thousands of times more sensitive to faint light. A glance at a bright phone or torch resets much of it.",
      "Red light disturbs the rods least, which is why observers use dim red torches.",
    ],
    tip: "Turn your phone to its night/red mode, cover bright screens, and give yourself half an hour before hunting faint objects.",
    inApp: "The eye button at the top switches AstroPilot to red night-vision mode.",
    related: ["averted-vision", "exit-pupil", "limiting-magnitude"],
  },
  {
    slug: "averted-vision",
    term: "Averted vision",
    category: "brightness",
    short: "Looking slightly to one side of a faint object, so its light falls on the most sensitive part of your eye.",
    body: [
      "The centre of your vision is packed with colour-sensing cones, which are poor in the dark. The rods, which see faint light, are spread around it. So glance about 10–15° to the side — towards your nose — and a faint galaxy or nebula can brighten or appear from nothing. Experienced observers gain about a magnitude this way.",
    ],
    tip: "Combine averted vision with gently tapping the telescope tube: the eye notices moving faint things better than still ones.",
    related: ["dark-adaptation", "surface-brightness", "deep-sky-object"],
  },
  {
    slug: "extinction",
    term: "Extinction",
    aliases: ["airmass", "atmospheric extinction"],
    category: "brightness",
    short: "The dimming of starlight by the atmosphere, which grows quickly towards the horizon.",
    body: [
      "Light from overhead passes through one “airmass” of atmosphere; at 30° altitude it passes through two, and near the horizon through ten or more. Each airmass dims stars by roughly 0.2–0.3 [[magnitude|magnitudes]] on a clear night, more in hazy air — so a faint galaxy low in the sky can lose a whole magnitude or more.",
    ],
    inApp: "AstroPilot's ratings include extinction for each object's altitude and the forecast haze.",
    related: ["altitude", "transparency", "aerosols"],
  },
  {
    slug: "moonlight",
    term: "Moonlight",
    aliases: ["moon interference", "moon-free"],
    category: "brightness",
    short: "Sunlight reflected by the Moon, which brightens the whole sky and hides faint deep-sky objects.",
    body: [
      "A bright Moon raises the sky background like light pollution does, wherever it is in the sky — strongest near it. Around full Moon, only bright clusters, doubles, planets and the Moon itself are worth chasing. Deep-sky observers plan around the Moon: the days around new Moon, or the hours before moonrise or after moonset.",
    ],
    inApp: "Tonight shows the moon-free dark hours; every object's rating accounts for the Moon's brightness and distance from it.",
    related: ["the-moon", "light-pollution", "best-window"],
  },
  {
    slug: "contrast",
    term: "Contrast",
    category: "brightness",
    short: "How much brighter an object is than the sky around it — the key to seeing faint things.",
    body: [
      "Faint nebulae and galaxies are only a little brighter than the sky behind them. Anything that darkens the background — a darker site, the Moon down, a filter that blocks skyglow, the right magnification — raises their contrast and makes them easier to see.",
    ],
    related: ["surface-brightness", "light-pollution", "nebula-filter", "exit-pupil"],
  },

  // ------------------------------------------------------------------------------------- conditions
  {
    slug: "seeing",
    term: "Seeing",
    aliases: ["atmospheric seeing", "twinkling", "steadiness"],
    category: "conditions",
    short: "How steady the air is. Good seeing gives sharp, still views at high power; bad seeing makes stars boil and twinkle.",
    body: [
      "Pockets of warmer and cooler air bend starlight slightly differently, so stars twinkle and planets shimmer. In good seeing a star at high power is a tight point with a steady ring around it; in poor seeing it's a boiling blob. Seeing matters most for planets, the Moon and close double stars — and much less for faint, low-power deep-sky views.",
      "It's caused by turbulence at all heights: the jet stream high up, wind over hills, and heat rising from roofs, roads and the telescope itself. Seeing and [[transparency]] are different things — crystal-clear nights are often turbulent.",
    ],
    tip: "Watch a bright star at high power: if it's steady, go for planets and close doubles; if it boils, switch to low-power deep-sky targets.",
    inApp: "Hour by hour on Tonight rates seeing from 1 (poor) to 5 (excellent), estimated from jet-stream winds and wind shear.",
    related: ["transparency", "jet-stream", "max-magnification", "cooldown"],
    widget: "seeing",
  },
  {
    slug: "transparency",
    term: "Transparency",
    aliases: ["clarity", "haze"],
    category: "conditions",
    short: "How clear the air is: on a transparent night faint stars and galaxies show; haze, humidity and dust hide them.",
    body: [
      "Transparency is about how much light gets through: thin high cloud, humidity, haze, dust and smoke all dim faint objects and scatter town lights into a brighter sky. It matters most for faint galaxies and nebulae; planets barely notice.",
      "A sky can be transparent but turbulent, or murky but steady — so a bad deep-sky night can be a good planetary night, and vice versa.",
    ],
    inApp: "Hour by hour on Tonight rates transparency from 1 to 5 from humidity, high cloud and aerosols.",
    related: ["seeing", "aerosols", "cloud-cover", "extinction"],
    widget: "transparency",
  },
  {
    slug: "cloud-cover",
    term: "Cloud cover",
    aliases: ["low cloud", "mid cloud", "high cloud", "cirrus"],
    category: "conditions",
    short: "How much of the sky is covered by cloud, split into low, middle and high layers.",
    body: [
      "Low cloud (below about 2 km) and middle cloud are thick and block everything. High cloud — thin cirrus — is often barely visible at night but dims faint objects and brightens the sky, so it's worse than it looks for deep-sky observing.",
    ],
    inApp: "AstroPilot forecasts cloud at all three heights, hour by hour, and shows a cloud map with satellite images and the week's forecast.",
    related: ["transparency", "cloud-map", "observing-score"],
  },
  {
    slug: "jet-stream",
    term: "Jet stream",
    category: "conditions",
    short: "A river of fast wind about 10 km up; when it's overhead, the seeing is usually poor.",
    body: [
      "Jet streams blow at 150–300 km/h near the tropopause. The turbulence along their edges is a main cause of bad [[seeing]], so planetary observers watch the jet stream forecast as closely as the clouds.",
    ],
    inApp: "AstroPilot's seeing estimate uses the forecast wind at 250 hPa (the jet stream's height).",
    related: ["seeing"],
  },
  {
    slug: "dew",
    term: "Dew",
    aliases: ["dew point", "dew heater", "dew shield"],
    category: "conditions",
    short: "Moisture condensing on optics when they cool below the dew point — it fogs eyepieces, finders and lenses.",
    body: [
      "On clear nights everything radiates its heat to the sky and cools below the air temperature. When a surface reaches the dew point, water condenses on it. Refractor and SCT front lenses, finders and eyepieces are most at risk; a Newtonian's mirror at the bottom of its tube is better protected.",
    ],
    tip: "A dew shield (a tube extending past the lens) delays it; a gentle heater strip prevents it. Never wipe a dewed lens — let it dry or warm it.",
    inApp: "Tonight's hour-by-hour forecast warns when dew is likely.",
    related: ["transparency", "cooldown"],
  },
  {
    slug: "aerosols",
    term: "Aerosols",
    aliases: ["AOD", "aerosol optical depth", "dust", "smoke", "Saharan dust"],
    category: "conditions",
    short: "Tiny particles in the air — dust, smoke, sea salt, pollution — that dim stars and brighten the sky.",
    body: [
      "Aerosol optical depth (AOD) measures how much they block: under 0.1 is very clean air, 0.3 is hazy, and Saharan dust or wildfire smoke can push it to 1 or more, when even bright stars dim and the sky turns milky. It's a major part of [[transparency]].",
    ],
    inApp: "AstroPilot uses Copernicus aerosol forecasts in its transparency estimate.",
    related: ["transparency", "extinction"],
  },
  {
    slug: "twilight",
    term: "Twilight",
    aliases: ["civil twilight", "nautical twilight", "astronomical twilight", "astronomical night", "darkness"],
    category: "conditions",
    short: "The glow after sunset and before sunrise, in three stages: civil, nautical and astronomical.",
    body: [
      "Civil twilight lasts until the Sun is 6° below the horizon: bright planets appear. Nautical twilight lasts to −12°: the horizon fades and the brighter stars are out. Astronomical twilight lasts to −18°: the sky is nearly dark, but faint galaxies still suffer. Below −18° it's astronomical night — as dark as it gets.",
      "Far from the equator in summer, the Sun never gets 18° below the horizon, and the whole night is twilight.",
    ],
    inApp: "Tonight shows when real darkness starts and ends; the night strip shades the twilight stages.",
    related: ["moonlight", "best-window", "observing-score"],
    widget: "twilight",
  },
  {
    slug: "cooldown",
    term: "Cooldown",
    aliases: ["thermal equilibrium", "tube currents", "cool-down"],
    category: "conditions",
    short: "Letting a telescope reach the outdoor temperature, so warm air inside it doesn't blur the view.",
    body: [
      "A telescope brought out of a warm house carries heat in its mirror or lenses. As it cools, warm air rises off the optics in shimmering currents that blur high-power views. Small refractors are ready in minutes; a big Dobsonian's thick mirror can take an hour or two — a fan behind the mirror speeds it up.",
    ],
    tip: "Put the telescope out at sunset and observe low-power objects first; save the planets for later in the night.",
    related: ["seeing", "dew", "dobsonian"],
  },

  // ------------------------------------------------------------------------------------------ optics
  {
    slug: "aperture",
    term: "Aperture",
    category: "optics",
    short: "The diameter of a telescope's main lens or mirror — the single most important number.",
    body: [
      "Aperture decides how much light a telescope collects ([[light-grasp]]) and how fine a detail it can resolve ([[resolution]]). Doubling it collects four times the light and resolves details half the size. An 8-inch (203 mm) telescope shows hundreds of galaxies; a 16-inch shows spiral arms in dozens of them.",
    ],
    inApp: "Every visibility rating in AstroPilot depends on your instrument's aperture.",
    related: ["light-grasp", "resolution", "focal-ratio", "limiting-magnitude"],
  },
  {
    slug: "focal-length",
    term: "Focal length",
    category: "optics",
    short: "The distance at which a telescope's lens or mirror brings light to a focus; with the eyepiece it sets the magnification.",
    body: [
      "A telescope's focal length divided by an eyepiece's gives the [[magnification]]: 1,200 mm with a 25 mm eyepiece makes 48×. Long-focus telescopes (SCTs, Maksutovs) give high power easily; short-focus ones (fast Newtonians, small refractors) give wide, low-power views.",
      "[[barlow|Barlow lenses]] and [[coma-corrector|coma correctors]] lengthen the effective focal length; [[focal-reducer|focal reducers]] shorten it.",
    ],
    related: ["magnification", "focal-ratio", "barlow", "focal-reducer"],
    widget: "eyepiece",
  },
  {
    slug: "focal-ratio",
    term: "Focal ratio",
    aliases: ["f-number", "f-ratio", "f/", "fast", "slow"],
    category: "optics",
    short: "Focal length divided by aperture (f/5, f/10…). “Fast” (low) ratios give wide fields; “slow” (high) ones give easy high power.",
    body: [
      "An f/5 telescope has a focal length five times its aperture. For visual use, the focal ratio sets how wide a field your eyepieces can give and how short an eyepiece you need for high power — exit pupil in mm is the eyepiece's focal length divided by the focal ratio.",
      "Fast Newtonians (below about f/5.5) suffer from [[coma]] at the edge of the field and need precise [[collimation]]; slow ones are forgiving.",
    ],
    related: ["focal-length", "aperture", "coma", "exit-pupil"],
    widget: "eyepiece",
  },
  {
    slug: "magnification",
    term: "Magnification",
    aliases: ["power", "×"],
    category: "optics",
    short: "How much bigger a telescope makes things look: its focal length divided by the eyepiece's focal length.",
    body: [
      "Magnification is the least important number on a telescope box. Too little and small objects stay tiny; too much and the image turns dim, soft and shaky. Each target has a sweet spot — set by the [[exit-pupil]] it needs, how big it is, and the [[seeing]].",
      "Rough guide: low power (4–6 mm exit pupil) for big clusters and nebulae, medium (2–3 mm) for galaxies and most deep-sky objects, high (0.7–1.2 mm) for planets, the Moon and close doubles.",
    ],
    inApp: "Object pages pick the eyepiece from your kit that gives the best power for each target, and why.",
    related: ["exit-pupil", "max-magnification", "true-field", "eyepiece", "sweet-spot"],
    widget: "eyepiece",
  },
  {
    slug: "eyepiece",
    term: "Eyepiece",
    aliases: ["ocular", "Plössl", "wide-angle eyepiece"],
    category: "optics",
    short: "The small lens you look through, which magnifies the telescope's image; its focal length sets the power.",
    body: [
      "Eyepieces are interchangeable: shorter focal lengths give higher [[magnification]]. Besides focal length, two things matter: the [[apparent-field]] (how wide the view looks — 50° in a Plössl, 82–100° in ultra-wides) and [[eye-relief]] (how far your eye sits from the lens).",
      "They come in 1.25″ and 2″ barrels; the widest low-power fields need 2″ eyepieces.",
    ],
    tip: "A good kit covers low, medium and high power with a step of about 1.5× between eyepieces.",
    inApp: "Add your eyepieces under My gear: AstroPilot shows their magnification, exit pupil and field on each telescope, and which to use for each object.",
    related: ["magnification", "apparent-field", "true-field", "eye-relief", "barlow"],
    widget: "eyepiece",
  },
  {
    slug: "apparent-field",
    term: "Apparent field of view",
    aliases: ["AFOV", "apparent field"],
    category: "optics",
    short: "How wide an eyepiece's view looks to your eye, in degrees: about 50° for a Plössl, 82° or more for ultra-wides.",
    body: [
      "Look through an eyepiece at a bright wall: the circle you see spans its apparent field. A wider apparent field gives a bigger [[true-field|piece of sky]] at the same magnification — more “spacewalk”, and more time before a Dobsonian's target drifts out of view.",
    ],
    related: ["true-field", "eyepiece", "magnification"],
    widget: "eyepiece",
  },
  {
    slug: "true-field",
    term: "True field of view",
    aliases: ["TFOV", "true field", "field of view", "FOV"],
    category: "optics",
    short: "How much sky you see through the eyepiece — roughly its apparent field divided by the magnification.",
    body: [
      "A 52° eyepiece at 50× shows about 1° of sky: two full Moons across. At 200× the same eyepiece shows a quarter of a degree. Big targets — the Pleiades, the Andromeda Galaxy, the Veil — need a wide true field; tiny ones don't.",
    ],
    inApp: "Object pages draw your eyepiece's field with the object to scale, using a real photograph.",
    related: ["apparent-field", "magnification", "angular-size"],
    widget: "eyepiece",
  },
  {
    slug: "exit-pupil",
    term: "Exit pupil",
    category: "optics",
    short: "The width of the beam of light leaving the eyepiece: aperture ÷ magnification. It sets how bright and sharp the view looks.",
    body: [
      "Hold a telescope up to the daylight and you'll see a small bright disk floating behind the eyepiece: that's the exit pupil. A big one (5–7 mm) gives the brightest, widest views for faint nebulae — but never more than your eye's pupil (about 7 mm when young, 5–6 mm later in life). A small one (0.5–1 mm) gives high power for planets.",
      "Exit pupil is the observer's secret weapon: the same exit pupil gives the same surface brightness in any telescope, so experienced observers choose eyepieces by it.",
    ],
    inApp: "AstroPilot picks eyepieces by the exit pupil each kind of object needs, and the gear page shows which sweet spots your kit covers.",
    related: ["magnification", "aperture", "sweet-spot", "dark-adaptation", "surface-brightness"],
    widget: "eyepiece",
  },
  {
    slug: "max-magnification",
    term: "Maximum useful magnification",
    aliases: ["highest useful power", "empty magnification"],
    category: "optics",
    short: "About twice the aperture in millimetres (50× per inch) — but the air rarely allows more than 250–350×.",
    body: [
      "Beyond about 2× the aperture in mm, a telescope shows no new detail: the image only gets bigger and dimmer (“empty magnification”). In practice the [[seeing]] sets the ceiling — most nights allow 150–250×, exceptional nights 300× or more, whatever the telescope.",
    ],
    tip: "Start at medium power and step up only while the view keeps improving.",
    inApp: "AstroPilot avoids suggesting powers above what your telescope and typical seeing support.",
    related: ["magnification", "seeing", "resolution", "exit-pupil"],
  },
  {
    slug: "resolution",
    term: "Resolution",
    aliases: ["Dawes limit", "resolving power", "Rayleigh limit"],
    category: "optics",
    short: "The finest detail a telescope can show; the Dawes limit, 116 ÷ aperture in mm, is the closest equal double star it can split.",
    body: [
      "Light's wave nature blurs every star into a tiny [[airy-disk]]. Bigger apertures make smaller disks: an 80 mm splits equal stars about 1.5″ apart, a 200 mm 0.6″, a 400 mm 0.3″ — when the [[seeing]] allows, which it often doesn't below about 1″.",
    ],
    inApp: "Double-star pages compare each pair with your telescope's Dawes limit.",
    related: ["aperture", "airy-disk", "double-star", "separation", "seeing"],
    widget: "resolution",
  },
  {
    slug: "airy-disk",
    term: "Airy disk",
    say: "AIR-ee",
    aliases: ["diffraction", "diffraction rings"],
    category: "optics",
    short: "The tiny disk, surrounded by faint rings, that a perfect telescope makes of a star — set by its aperture.",
    body: [
      "No telescope makes a star a true point: diffraction spreads its light into a small disk with faint rings, which you can see at high power on a steady night. The bigger the aperture, the smaller the disk. Defocusing a star slightly and comparing both sides of focus is a classic test of optics and [[collimation]].",
    ],
    related: ["resolution", "collimation", "seeing"],
    widget: "resolution",
  },
  {
    slug: "light-grasp",
    term: "Light grasp",
    aliases: ["light-gathering power", "light gathering"],
    category: "optics",
    short: "How much more light a telescope collects than your eye: (aperture ÷ 7 mm)². An 8-inch gathers about 840×.",
    body: [
      "Light collected grows with the area of the aperture, so it goes with the square of the diameter. A 200 mm telescope collects about 840 times as much light as a 7 mm dark-adapted pupil — reaching about 7 magnitudes fainter.",
    ],
    inApp: "Gear pages show each telescope's light grasp and limiting magnitude.",
    related: ["aperture", "limiting-magnitude", "magnitude"],
  },
  {
    slug: "refractor",
    term: "Refractor",
    aliases: ["achromat", "apochromat", "apo", "ED"],
    category: "optics",
    short: "A telescope that uses lenses: sharp, contrasty, low-maintenance — with no central obstruction.",
    body: [
      "Refractors are the classic spyglass shape. Simple two-lens achromats show some [[chromatic-aberration|false colour]] around bright objects; apochromats (“apos”, often with ED glass) correct it. Small apos are superb for wide fields, the Moon and travel; large refractors become very expensive per inch of aperture.",
    ],
    related: ["reflector", "chromatic-aberration", "orientation", "dew"],
  },
  {
    slug: "reflector",
    term: "Reflector",
    aliases: ["Newtonian", "Newtonian reflector"],
    category: "optics",
    short: "A telescope that uses mirrors; the Newtonian, with the eyepiece near the top, gives the most aperture for the money.",
    body: [
      "Isaac Newton's design uses a curved primary mirror at the bottom of the tube and a small flat secondary mirror that sends the light out of the side. Mirrors have no false colour and are cheap to make large, which is why most big amateur telescopes are Newtonians. They need occasional [[collimation]] and some time to [[cooldown|cool down]].",
    ],
    related: ["dobsonian", "collimation", "coma", "central-obstruction"],
  },
  {
    slug: "dobsonian",
    term: "Dobsonian",
    say: "dob-SOH-nee-un",
    aliases: ["Dob", "truss Dobsonian"],
    category: "optics",
    short: "A Newtonian reflector on a simple rocking-box mount — the easiest way to get a big aperture.",
    body: [
      "John Dobson popularised the design in the 1960s and 70s on San Francisco's sidewalks: a [[reflector|Newtonian]] tube in a plywood box that swivels and tilts on Teflon pads. You point it by hand. It's simple, stable and cheap, so a Dobsonian puts 8, 12 or 16 inches of aperture within reach. Big ones break down into a truss of poles for transport.",
      "Most are fast (f/4–f/6), so they show [[coma]] at the field edge and benefit from a [[coma-corrector]]; they don't [[tracking|track]] the sky on their own.",
    ],
    related: ["reflector", "coma-corrector", "mount", "tracking", "star-hopping"],
  },
  {
    slug: "schmidt-cassegrain",
    term: "Schmidt–Cassegrain",
    say: "SHMIT KASS-ih-grain",
    aliases: ["SCT", "catadioptric"],
    category: "optics",
    short: "A compact telescope with a mirror and a front corrector plate; long focal length (f/10) in a short tube.",
    body: [
      "SCTs fold a long light path into a short tube, so an 8-inch is portable and a 14-inch fits on a mount. Their long focal length gives high power easily — great for planets and small objects — but narrow fields; an f/6.3 [[focal-reducer]] widens them. They often come on computerised GoTo mounts.",
    ],
    related: ["maksutov", "focal-reducer", "central-obstruction", "dew"],
  },
  {
    slug: "maksutov",
    term: "Maksutov–Cassegrain",
    say: "mak-SOO-tov",
    aliases: ["Mak", "Maksutov"],
    category: "optics",
    short: "A compact catadioptric telescope with a thick curved front lens: sharp, slow (f/12–f/15), great for planets and the Moon.",
    body: [
      "Maksutovs are small, rugged and hold their [[collimation]], making them excellent grab-and-go telescopes for the Moon, planets and double stars. Their slow focal ratio limits how wide a field they can show, so the largest deep-sky objects don't fit.",
    ],
    related: ["schmidt-cassegrain", "focal-ratio", "true-field"],
  },
  {
    slug: "binoculars",
    term: "Binoculars",
    aliases: ["10×50", "7×50", "binocular astronomy"],
    category: "optics",
    short: "Two small telescopes side by side; “10×50” means 10× magnification and 50 mm lenses.",
    body: [
      "Binoculars are the best first instrument: wide fields, both eyes, upright views and instant use. 10×50s show the Moon's craters, Jupiter's moons, dozens of clusters, the brightest galaxies and nebulae. Their [[exit-pupil]] is the lens size divided by the power — 5 mm for 10×50s.",
    ],
    tip: "Brace your elbows or use a tripod adapter: steady binoculars show noticeably fainter stars.",
    inApp: "Choose binoculars as your instrument to see what they show tonight.",
    related: ["exit-pupil", "true-field", "magnification"],
  },
  {
    slug: "central-obstruction",
    term: "Central obstruction",
    aliases: ["secondary mirror", "obstruction"],
    category: "optics",
    short: "The secondary mirror blocking the middle of a reflector's or SCT's aperture, which slightly lowers contrast.",
    body: [
      "Newtonians, SCTs and Maksutovs have a small mirror in front of the main one. It blocks some light (typically 15–35% of the diameter) and spreads a little more of a star's light into the diffraction rings, slightly softening fine planetary contrast compared with a refractor of the same aperture. At low power with a big [[exit-pupil]] its shadow can appear as a dark spot in daylight.",
    ],
    related: ["reflector", "schmidt-cassegrain", "airy-disk"],
  },
  {
    slug: "collimation",
    term: "Collimation",
    category: "optics",
    short: "Aligning a telescope's mirrors so they share one axis — essential for sharp views in reflectors.",
    body: [
      "Bumps and temperature changes nudge a reflector's mirrors out of line, making stars flare into comet shapes at high power. Adjusting the secondary and primary mirror screws, with a collimation cap, Cheshire eyepiece or laser, brings them back. Fast mirrors (f/4–f/5) need it most precisely.",
    ],
    tip: "Check collimation every session on a Dobsonian; it takes a minute once you've learned it.",
    related: ["reflector", "airy-disk", "coma", "focal-ratio"],
  },
  {
    slug: "coma",
    term: "Coma",
    say: "KOH-muh",
    aliases: ["coma aberration"],
    category: "optics",
    short: "A flaw of Newtonian mirrors that turns stars near the edge of the field into little comets; worse in fast telescopes.",
    body: [
      "A parabolic mirror is perfect at the centre of the field, but away from it stars smear into fan shapes pointing outward. The smear grows with distance from the centre and with the inverse square of the [[focal-ratio]]: at f/4.5 a star 10′ from the centre is smeared by about 6″; at f/8, less than 2″.",
      "It's an optical property of the mirror (not a fault, and not to do with comets): a [[coma-corrector]] removes it. Bad [[collimation]] makes it worse and puts it off-centre.",
    ],
    inApp: "With a coma corrector on a fast Dobsonian, object pages show how much coma it removes at the edge of your eyepiece's field.",
    related: ["coma-corrector", "focal-ratio", "dobsonian", "collimation"],
    widget: "coma",
  },
  {
    slug: "coma-corrector",
    term: "Coma corrector",
    aliases: ["Paracorr", "MPCC"],
    category: "optics",
    short: "A lens group that slips in the focuser of a fast Newtonian and makes stars sharp right to the edge of the field.",
    body: [
      "A coma corrector (Tele Vue's Paracorr, Baader's MPCC and others) cancels a parabolic mirror's [[coma]]. On a fast Newtonian or Dobsonian (below about f/5.5) it belongs in the focuser for every eyepiece — the Moon and planets too, since on an untracked Dob the planet drifts towards the edge between nudges. The Paracorr also lengthens the focal length by 15%, raising every eyepiece's power.",
      "Each eyepiece focuses at a slightly different height, so the Paracorr's tunable top has a setting per eyepiece.",
    ],
    tip: "Stacking an ordinary Barlow on a coma corrector changes the spacing it was designed for; if you need more power, use a shorter eyepiece (Tele Vue documents only its Powermates for this).",
    inApp: "AstroPilot keeps your coma corrector in with every eyepiece on a fast Newtonian and includes its factor in every magnification.",
    related: ["coma", "dobsonian", "barlow", "focal-ratio"],
    widget: "coma",
  },
  {
    slug: "barlow",
    term: "Barlow lens",
    aliases: ["Barlow", "Powermate", "focal extender"],
    category: "optics",
    short: "A lens that goes before the eyepiece and multiplies its magnification, usually 2× or 3×.",
    body: [
      "A 2× Barlow turns a 10 mm eyepiece into the equivalent of a 5 mm, effectively doubling your kit. Good Barlows add little light loss, and they keep the comfortable [[eye-relief]] of longer eyepieces. Tele Vue's Powermates are a refined (telecentric) kind.",
      "A Barlow is most useful when it fills a gap — a power none of your eyepieces gives. If it only duplicates one you have, the eyepiece alone is simpler and has less glass.",
    ],
    inApp: "AstroPilot suggests a Barlow only when it gives a power your eyepieces can't on their own.",
    related: ["magnification", "eyepiece", "coma-corrector", "focal-reducer"],
  },
  {
    slug: "focal-reducer",
    term: "Focal reducer",
    aliases: ["reducer", "f/6.3 reducer"],
    category: "optics",
    short: "A lens that shortens a telescope's focal length — an f/6.3 reducer turns an f/10 SCT into a wider-field instrument.",
    body: [
      "Reducers are the opposite of Barlows: they lower the magnification of every eyepiece and widen the field. They're mainly used on long-focus SCTs, whose narrow fields can't otherwise frame big objects.",
    ],
    related: ["schmidt-cassegrain", "barlow", "true-field"],
  },
  {
    slug: "eye-relief",
    term: "Eye relief",
    category: "optics",
    short: "How far your eye must be from an eyepiece to see the whole field; 15–20 mm is comfortable, and needed with glasses.",
    body: [
      "Short-focus Plössls have very short eye relief, so you press your eye close. Modern designs keep 15–20 mm at any focal length — important if you observe with glasses (needed for astigmatism; short- or long-sightedness can simply be focused out).",
    ],
    related: ["eyepiece", "barlow"],
  },
  {
    slug: "mount",
    term: "Mount",
    aliases: ["alt-azimuth", "alt-az", "equatorial mount", "GoTo"],
    category: "optics",
    short: "What holds and points the telescope: alt-azimuth (up-down, left-right) or equatorial (aligned with the sky's rotation).",
    body: [
      "An alt-azimuth mount moves like a camera tripod head — simple and intuitive; Dobsonians use one. An equatorial mount tilts one axis parallel to the Earth's, so a single motion follows the stars — the standard for photography. GoTo mounts of either kind find objects for you.",
    ],
    related: ["tracking", "dobsonian"],
  },
  {
    slug: "tracking",
    term: "Tracking",
    aliases: ["equatorial platform", "sidereal tracking"],
    category: "optics",
    short: "Moving a telescope to follow the sky's rotation, so objects stay in view.",
    body: [
      "The sky turns 15° an hour, so at 200× a planet crosses the field in a minute or two. Motorised mounts track automatically; Dobsonians can sit on an equatorial platform that tracks for about an hour. Without tracking, you nudge the telescope every so often.",
    ],
    related: ["mount", "dobsonian", "true-field"],
  },
  {
    slug: "finder",
    term: "Finder",
    aliases: ["finderscope", "red-dot finder", "Telrad", "RACI"],
    category: "optics",
    short: "A small sighting device on the telescope for aiming: a red-dot or Telrad reflex sight, or a small magnifying finderscope.",
    body: [
      "Reflex finders project a red dot or rings onto the sky with no magnification — perfect for pointing at naked-eye stars. A magnifying finderscope (6×30, 8×50) shows fainter stars for [[star-hopping]]; right-angle versions are comfortable on a Dobsonian. Most observers use one of each.",
    ],
    related: ["star-hopping", "orientation"],
  },
  {
    slug: "nebula-filter",
    term: "Nebula filter",
    aliases: ["UHC", "OIII", "O-III", "H-beta", "Hβ", "narrowband filter", "LPR filter", "light pollution filter"],
    category: "optics",
    short: "A filter that passes the light emitted by nebulae and blocks most skyglow, making them stand out.",
    body: [
      "[[emission-nebula|Emission nebulae]], [[planetary-nebula|planetaries]] and [[supernova-remnant|supernova remnants]] shine in a few narrow colours. A UHC (narrowband) filter passes hydrogen-beta and oxygen-III light; an OIII filter passes only oxygen — superb on planetaries and the Veil; an H-beta filter is the key to a few objects like the Horsehead and California Nebula.",
      "Galaxies, star clusters and reflection nebulae shine with ordinary starlight: nebula filters only dim them.",
    ],
    tip: "Filters work best with a fairly large [[exit-pupil]] (3–6 mm).",
    inApp: "Object pages say which filter suits each object, and whether you own one.",
    examples: ["NGC6960", "M27", "B33", "M42"],
    related: ["emission-nebula", "planetary-nebula", "contrast", "light-pollution"],
  },
  {
    slug: "color-filter",
    term: "Colour filter",
    aliases: ["color filter", "planetary filter", "Wratten"],
    category: "optics",
    short: "A tinted filter (light blue, orange, red…) that raises the contrast of particular features on planets.",
    body: [
      "Planet details have colour: Jupiter's red-brown belts stand out through a light blue (#80A) filter; Mars's dark markings through orange or red (#21, #23A); Venus's glare drops with a violet or dark blue one. The effect is subtle but real, especially in larger telescopes.",
    ],
    related: ["planet", "great-red-spot", "moon-filter"],
  },
  {
    slug: "moon-filter",
    term: "Moon filter",
    aliases: ["neutral density filter", "ND filter"],
    category: "optics",
    short: "A neutral grey filter that dims the dazzling Moon for comfortable viewing.",
    body: [
      "Near full Moon a big telescope's view can be uncomfortably bright. A neutral-density or variable polarising filter cuts the glare without changing colours. High magnification does the same job by dimming the image.",
    ],
    related: ["the-moon", "color-filter"],
  },
  {
    slug: "chromatic-aberration",
    term: "Chromatic aberration",
    aliases: ["false colour", "false color"],
    category: "optics",
    short: "A purple or yellow fringe around bright objects in simple lens telescopes, because lenses bend colours differently.",
    body: [
      "A lens focuses blue and red light at slightly different points, so an achromatic [[refractor]] shows a violet halo around bright stars, the Moon's edge and planets. Apochromats with special glass all but remove it; mirrors never show it.",
    ],
    related: ["refractor", "reflector"],
  },

  // ------------------------------------------------------------------------------------------- names
  {
    slug: "messier-catalog",
    term: "Messier catalog",
    say: "MESS-ee-ay",
    aliases: ["Messier", "M"],
    category: "names",
    short: "Charles Messier's list of 110 bright nebulae and clusters, made in the 1700s — the classic first targets.",
    body: [
      "Charles Messier was a French comet hunter who listed fuzzy objects that could be mistaken for comets, so he could ignore them. His list became the greatest hits of the northern sky: the Andromeda Galaxy is M 31, the Orion Nebula M 42, the Pleiades M 45. Seeing all 110 is a classic goal — some do it in one night in March, the Messier marathon.",
    ],
    inApp: "The Messier Catalog is one of the observing programs under Achievements.",
    examples: ["M1", "M31", "M42", "M45"],
    related: ["caldwell-catalog", "ngc-ic", "deep-sky-object"],
  },
  {
    slug: "caldwell-catalog",
    term: "Caldwell catalog",
    aliases: ["Caldwell", "C"],
    category: "names",
    short: "Patrick Moore's 1995 list of 109 bright objects Messier missed, including the best of the southern sky.",
    body: [
      "The British astronomer Patrick Moore (whose full surname was Caldwell-Moore) compiled it as a companion to the Messier list: the Double Cluster (C 14), the Veil, Omega Centauri, the Sculptor Galaxy. It runs from C 1 near the north celestial pole to C 109 in the far south.",
    ],
    examples: ["C14", "NGC5139", "NGC253", "NGC4565"],
    related: ["messier-catalog", "ngc-ic"],
  },
  {
    slug: "ngc-ic",
    term: "NGC & IC",
    aliases: ["New General Catalogue", "Index Catalogue", "NGC", "IC", "OpenNGC"],
    category: "names",
    short: "The New General Catalogue (1888) and its Index Catalogues: the standard numbers for about 13,000 galaxies, clusters and nebulae.",
    body: [
      "John Dreyer compiled the NGC in 1888 from the Herschels' and others' discoveries — 7,840 objects — and added 5,386 more in two Index Catalogues. Most deep-sky objects are still known by these numbers: NGC 7000 is the North America Nebula, IC 434 the glow behind the Horsehead.",
    ],
    inApp: "AstroPilot's catalog data comes from OpenNGC, a modern, openly licensed version of the NGC and IC.",
    examples: ["NGC7000", "NGC891", "IC434"],
    related: ["messier-catalog", "caldwell-catalog"],
  },
  {
    slug: "bayer-designation",
    term: "Star names & designations",
    aliases: ["Bayer designation", "Flamsteed number", "Greek letter", "proper name"],
    category: "names",
    short: "How stars are named: proper names (Vega), Greek letters by brightness (α Lyrae), or numbers (61 Cygni).",
    body: [
      "Bright stars have traditional names, mostly Arabic in origin: Vega, Altair, Betelgeuse. In 1603 Johann Bayer gave the stars of each constellation Greek letters, roughly by brightness: α Lyrae is Vega, β Cygni is Albireo. John Flamsteed numbered them from west to east: 61 Cygni. Catalogs like the [[wds]] add their own codes for double stars.",
    ],
    examples: ["albireo", "61-cygni", "epsilon-lyrae"],
    related: ["constellation", "wds", "double-star"],
  },
  {
    slug: "wds",
    term: "Washington Double Star Catalog",
    aliases: ["WDS", "STF", "Struve"],
    category: "names",
    short: "The US Naval Observatory's master catalog of double stars, with more than 150,000 pairs.",
    body: [
      "The WDS collects measurements of double stars going back two centuries. Its discoverer codes appear in names: STF is Friedrich Struve, whose 1827 catalog listed 3,000 pairs (Struve 747, say); H is William Herschel.",
    ],
    inApp: "AstroPilot's double-star separations and position angles come from the WDS.",
    examples: ["struve-747", "albireo"],
    related: ["double-star", "bayer-designation"],
  },

  // ------------------------------------------------------------------------------------------ in app
  {
    slug: "observing-score",
    term: "Observing score",
    aliases: ["score", "verdict", "tonight's score"],
    category: "astropilot",
    short: "AstroPilot's 0–100 rating of the night for deep-sky observing, from cloud, seeing, transparency, darkness and moonlight.",
    body: [
      "Each hour gets a score from the forecast [[cloud-cover]] at three heights, [[seeing]], [[transparency]], [[dew]] risk, how dark the sky is ([[twilight]]) and how much the Moon brightens it ([[moonlight]]). The night's verdict comes from its best stretch of dark hours.",
    ],
    inApp: "Tonight's headline score and the hour-by-hour strip.",
    related: ["best-window", "seeing", "transparency", "cloud-cover", "moonlight"],
  },
  {
    slug: "best-window",
    term: "Best window",
    aliases: ["moon-free window", "dark window"],
    category: "astropilot",
    short: "The hours of the night best for observing: dark, clear and — for faint objects — without the Moon.",
    body: [
      "For each night AstroPilot finds the stretch with the best [[observing-score]]. For a single object, its best time is when it's high in a dark sky, away from moonlight and twilight.",
    ],
    inApp: "Tonight's headline window, and each object's best time and altitude curve.",
    related: ["observing-score", "moonlight", "twilight", "altitude"],
  },
  {
    slug: "difficulty",
    term: "Difficulty rating",
    aliases: ["easy", "moderate", "challenging", "very hard", "out of reach", "visibility"],
    category: "astropilot",
    short: "How hard an object is tonight — easy, moderate, challenging, very hard or out of reach — for your sky, instrument and Moon.",
    body: [
      "AstroPilot works out how much an object stands out from the sky background at its best moment tonight, using its [[surface-brightness]] and size, your sky's darkness ([[bortle-scale]]), your instrument's [[aperture]], the [[moonlight]] and [[extinction]] at its altitude — following how the eye detects faint light. Easy objects show at a glance; challenging ones need [[averted-vision]] and patience.",
    ],
    inApp: "Every object card and page; Explore ranks objects by it.",
    related: ["surface-brightness", "bortle-scale", "averted-vision", "moonlight"],
  },
  {
    slug: "showpiece",
    term: "Showpiece",
    category: "astropilot",
    short: "A highlight of the sky that impresses in almost any telescope — the objects to show friends first.",
    body: [
      "Showpieces are the bright, beautiful classics: the Orion Nebula, the Pleiades, M 13, Albireo, the Ring Nebula, Saturn. AstroPilot marks them with a gold star.",
    ],
    examples: ["M42", "M13", "albireo", "M57"],
    related: ["deep-sky-object", "messier-catalog"],
  },
  {
    slug: "sweet-spot",
    term: "Sweet spots",
    aliases: ["low power", "medium power", "high power", "magnification range"],
    category: "astropilot",
    short: "The three exit-pupil bands a good eyepiece kit covers: low (4–6 mm), medium (2–3 mm) and high power (0.7–1.2 mm).",
    body: [
      "Low power, with a 4–6 mm [[exit-pupil]], gives the widest, brightest views for large nebulae and clusters. Medium, 2–3 mm, suits galaxies, globulars and most deep-sky objects. High, 0.7–1.2 mm, is for the Moon, planets and close doubles.",
    ],
    inApp: "My gear charts your eyepieces against the sweet spots and suggests what to add to fill a gap.",
    related: ["exit-pupil", "magnification", "eyepiece"],
    widget: "eyepiece",
  },
  {
    slug: "sky-survey-photo",
    term: "Sky-survey photograph",
    aliases: ["DSS", "Digitized Sky Survey", "object photo"],
    category: "astropilot",
    short: "The photo on each deep-sky object's page: a long-exposure sky survey image, north up, to scale.",
    body: [
      "AstroPilot shows each deep-sky object as the Digitized Sky Survey photographed it — the great photographic surveys made with large Schmidt telescopes at Palomar and Siding Spring. Long exposures record far more than the eye sees: expect a fainter, greyer view, with the brightest parts first.",
    ],
    inApp: "Object pages, the eyepiece framing view and the sky chart's details.",
    related: ["orientation", "true-field", "angular-size"],
  },
  {
    slug: "cloud-map",
    term: "Cloud map",
    aliases: ["satellite image", "cloud forecast"],
    category: "astropilot",
    short: "Tonight's map of clouds around you: Meteosat satellite images for the last hours, then a week of forecast.",
    body: [
      "The satellite part shows where clouds really are (EUMETSAT's Meteosat cloud mask, every 15 minutes); the forecast part shows where they're expected, hour by hour, from Open-Meteo's weather models. Drag the slider or press play to watch them move.",
    ],
    inApp: "On Tonight, below the hour-by-hour forecast.",
    related: ["cloud-cover", "observing-score"],
  },
];

// ------------------------------------------------------------------------------------------------
// Lookups and search
// ------------------------------------------------------------------------------------------------

export const GLOSSARY_BY_SLUG: Record<string, GlossaryTerm> = Object.fromEntries(GLOSSARY.map((t) => [t.slug, t]));

/** Terms in A–Z order (ignoring "The"). */
export const GLOSSARY_SORTED = [...GLOSSARY].sort((a, b) => sortKey(a.term).localeCompare(sortKey(b.term)));

export function sortKey(term: string): string {
  return term.replace(/^the\s+/i, "").toLowerCase();
}

export { TYPE_TERM } from "./glossaryTerms";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Text with the [[slug|words]] links reduced to their words. */
export function plainText(s: string): string {
  return s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, slug: string, label?: string) => label ?? GLOSSARY_BY_SLUG[slug]?.term.toLowerCase() ?? slug);
}

/** Split rich text into plain runs and term links. */
export function richParts(s: string): ({ text: string } | { slug: string; label: string })[] {
  const out: ({ text: string } | { slug: string; label: string })[] = [];
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    const slug = m[1];
    out.push({ slug, label: m[2] ?? GLOSSARY_BY_SLUG[slug]?.term.toLowerCase() ?? slug });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/**
 * Terms matching a search, best first: the term itself, then its other names, then words in its
 * definition. Every word of the query has to match somewhere.
 */
export function searchGlossary(query: string): GlossaryTerm[] {
  const words = fold(query).split(/[^a-z0-9α-ω×]+/).filter(Boolean);
  if (!words.length) return GLOSSARY_SORTED;
  const scored: { t: GlossaryTerm; score: number }[] = [];
  for (const t of GLOSSARY) {
    const name = fold(t.term);
    const aliases = (t.aliases ?? []).map(fold);
    const short = fold(plainText(t.short));
    const body = fold(plainText(t.body.join(" ")));
    let score = 0;
    let all = true;
    for (const w of words) {
      let s = 0;
      if (name === w) s = 100;
      else if (name.startsWith(w)) s = 80;
      else if (aliases.some((a) => a === w)) s = 75;
      else if (new RegExp(`\\b${w}`).test(name)) s = 60;
      else if (aliases.some((a) => a.startsWith(w) || new RegExp(`\\b${w}`).test(a))) s = 50;
      else if (new RegExp(`\\b${w}`).test(short)) s = 20;
      else if (new RegExp(`\\b${w}`).test(body)) s = 8;
      if (!s) {
        all = false;
        break;
      }
      score += s;
    }
    if (all) scored.push({ t, score });
  }
  return scored.sort((a, b) => b.score - a.score || sortKey(a.t.term).localeCompare(sortKey(b.t.term))).map((x) => x.t);
}

/**
 * Close spellings for a query that matched nothing ("nebulla", "azimut"): terms and other names within a
 * couple of typing slips, best first.
 */
export function suggestGlossary(query: string, limit = 4): GlossaryTerm[] {
  const q = fold(query).trim();
  if (q.length < 3) return [];
  const slips = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
  const best: { t: GlossaryTerm; d: number }[] = [];
  for (const t of GLOSSARY) {
    let d = Infinity;
    for (const name of [t.term, ...(t.aliases ?? [])].map(fold)) {
      // The whole name, or one of its words ("azimut" ~ "azimuth", "globlar" ~ "globular cluster").
      // A match on the whole name beats one on a single word of it.
      d = Math.min(d, editDistance(q, name.slice(0, q.length + slips)));
      for (const part of name.split(/[^a-z0-9]+/)) if (part.length >= 3 && part !== name) d = Math.min(d, editDistance(q, part.slice(0, q.length + slips)) + 0.5);
    }
    if (d <= slips + 0.5) best.push({ t, d });
  }
  return best.sort((a, b) => a.d - b.d || sortKey(a.t.term).localeCompare(sortKey(b.t.term))).slice(0, limit).map((x) => x.t);
}

/** Optimal string alignment distance: insertions, deletions, substitutions and swapped neighbours. */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** Short guided tours through the glossary, each building on the last term. */
export interface GlossaryPath {
  id: string;
  title: string;
  blurb: string;
  slugs: string[];
}

export const GLOSSARY_PATHS: GlossaryPath[] = [
  {
    id: "first-night",
    title: "Your first night out",
    blurb: "The handful of ideas that make the night sky make sense.",
    slugs: ["constellation", "asterism", "magnitude", "light-year", "dark-adaptation", "averted-vision", "light-pollution", "bortle-scale", "deep-sky-object"],
  },
  {
    id: "telescope",
    title: "Getting the most from a telescope",
    blurb: "Why one eyepiece shows more than another — and when more power shows less.",
    slugs: ["aperture", "focal-length", "focal-ratio", "eyepiece", "magnification", "exit-pupil", "true-field", "max-magnification", "barlow", "coma-corrector"],
  },
  {
    id: "forecast",
    title: "Reading the night's forecast",
    blurb: "A clear sky isn't the whole story: what makes a night good, and for what.",
    slugs: ["cloud-cover", "transparency", "seeing", "jet-stream", "dew", "twilight", "moonlight", "observing-score"],
  },
  {
    id: "faint-fuzzies",
    title: "Hunting faint fuzzies",
    blurb: "Galaxies, nebulae and clusters — and how to coax them out of the dark.",
    slugs: ["deep-sky-object", "open-cluster", "globular-cluster", "planetary-nebula", "emission-nebula", "galaxy", "surface-brightness", "nebula-filter", "star-hopping"],
  },
  {
    id: "moon-planets",
    title: "The Moon and planets",
    blurb: "What to look for on our neighbours, and when they look their best.",
    slugs: ["the-moon", "phase", "terminator", "planet", "opposition", "elongation", "galilean-moons", "great-red-spot", "saturns-rings"],
  },
];

export const GLOSSARY_PATH_BY_ID: Record<string, GlossaryPath> = Object.fromEntries(GLOSSARY_PATHS.map((p) => [p.id, p]));

/** One term per night, the same for everyone, cycling through the whole glossary in a shuffled order. */
export function wordOfTheNight(date: Date = new Date()): GlossaryTerm {
  const day = Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000 - 12 * 3_600_000) / 86_400_000); // changes at local noon
  const order = [...GLOSSARY].filter((t) => t.category !== "astropilot").sort((a, b) => hash(a.slug) - hash(b.slug));
  return order[((day % order.length) + order.length) % order.length];
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
