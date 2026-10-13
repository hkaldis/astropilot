# Writing brief: the "About" story for each object in AstroPilot

AstroPilot is an observing companion for amateur astronomers. Each object (galaxy, nebula, cluster, double star,
planet, moon) has a page. Its **About** section should make a curious reader go "wow, I didn't know that" — the human
story of the object, not a data sheet. You write that story, working from the research in your batch file.

## Output

Write ONE JSON file: `scripts/data/stories/out/NN.json` (NN = your batch number), an object keyed by the exact id from
each `## <id> — <name>` heading in your batch. Every id in the batch must be present. For each:

```json
"M13": {
  "tagline": "The finest globular cluster in northern skies — and the target of our first message to the stars.",
  "story": [
    "Picture several hundred thousand suns packed into one ball of light. From a planet near its centre the night sky would be crowded with brilliant stars, many brighter than any we see. That is M 13, a [[globular-cluster]] whose stars are among the oldest in the Milky Way, born when the galaxy itself was young.",
    "Edmond Halley — of comet fame — came across it in 1714 and noted that it shows itself to the naked eye when the sky is clear and the Moon is down. Charles Messier logged it in 1764 as a round nebula with no stars; it took William Herschel's larger telescopes to reveal the swarm."
  ],
  "facts": [
    { "title": "A postcard to the stars", "text": "In 1974 the Arecibo radio telescope beamed a picture message at M 13: a stick figure, our DNA and the Solar System. It is still on its way, and will be for many thousands of years." },
    { "title": "Propeller", "text": "Three dark lanes meet near the cluster's edge in a shape observers call the Propeller. Larger telescopes under steady skies show it as a faint, three-bladed shadow." }
  ],
  "discovered": { "by": "Edmond Halley", "year": 1714, "note": null }
}
```

A smaller, less famous object gets a shorter entry, e.g.:

```json
"NGC7027": {
  "tagline": "A newborn planetary nebula, barely six centuries old — and where a molecule from the dawn of time was found.",
  "story": [
    "Most [[planetary-nebula|planetary nebulae]] have been expanding for thousands of years. NGC 7027 has only just begun: the dying star at its heart shed its outer layers roughly 600 years ago, making it one of the youngest and densest known. Hubble's pictures show a glowing core wrapped in dusty, onion-like shells."
  ],
  "facts": [
    { "title": "The universe's first molecule", "text": "In 2019 the airborne SOFIA observatory detected helium hydride here — the first molecule to form after the Big Bang, found in space for the first time." }
  ],
  "discovered": { "by": "Édouard Stephan", "year": 1878, "note": null }
}
```

### Fields

- **tagline**: one line, 20–130 characters, a hook. No glossary links.
- **story**: 1–3 short paragraphs.
  - Famous objects (batches 00–06): 2–3 paragraphs, 80–210 words in total.
  - Others (batches 07–12): 1–2 paragraphs, 35–130 words in total.
- **facts**: short "Did you know?"-style cards, each `{ "title": ≤45 chars, "text": 30–300 chars }`.
  Famous objects: 2–4. Others: 0–3 — only facts that are really interesting and solidly supported. Never pad.
- **discovered**: `{ "by": name or null, "year": integer or null, "note": short text or null }`, or `null` when unknown.
  Use `note` for things like "Known since antiquity", "Recorded by Ptolemy around AD 130", "Predicted by Le Verrier;
  found by Galle". Take it from the research; the Wikidata hint line can be wrong (it sometimes lists every
  observer) — prefer what the article says about who first found it.

## What makes a good story

Write for a curious beginner, in a warm, vivid, conversational voice — like a great planetarium presenter or a
friend at the eyepiece who knows the history. Accurate first; then interesting.

Look in the research for, and lead with, what is genuinely remarkable:
- what the object really *is*, made tangible with a human-scale picture or comparison (what it would be like to
  live there, what the light means, how many suns, how old, how it will end);
- discovery stories and the people behind them (Messier hunting comets, the Herschels, Lord Rosse's Leviathan,
  Harvard's women "computers", Hubble…), name origins and mythology;
- records and firsts (nearest, oldest, youngest, brightest, first X ever seen), surprises and mysteries;
- famous images and missions (Hubble's Pillars of Creation, JWST), science that happened there (a supernova, a
  black hole picture, a pulsar), and pop culture (films, books, spacecraft, songs) when solid;
- for double stars: colours, orbits, how many stars are really there, what you'd see from a planet there;
- for planets and moons: weather, size comparisons, missions, oddities — as vivid as for the deep sky.

Vary the openings: not "X is a…", not "Located in the constellation…", not "This…". Start with an image, a
question, a person, a surprising fact.

### Rules (the checker enforces most of them: `python3 scripts/data/stories/check.py NN`)

1. **Only facts the research supports**, or that are very well established. If unsure, leave it out. Never invent
   quotes, dates, numbers or people. A short, true entry beats a padded one. If an object has no article, keep it
   brief and stay with what its type and catalog line support.
2. **No distance or physical-size numbers** ("2.5 million light-years", "150 light-years across", "60 parsecs"):
   the app shows its own measured distance and size next to your story, so yours must not contradict them. You may
   say "one of the nearest", "farther than…", "light that left before the pyramids" — but the light-travel time
   and distance are already shown by the app, so don't lean on them. Other numbers from the research (ages, star
   counts, dates, temperatures, masses) are fine.
3. **Don't repeat the observing note** shown in the app (the "observing note" line in the research) — what it
   looks like in a telescope, magnitude, size, how to find it. The story is about the object itself; a line about
   seeing it with the naked eye or a famous historical observation is fine.
4. **Glossary links**: you may link up to 3 terms per object as `[[slug]]` or `[[slug|shown words]]`, choosing
   slugs only from `scripts/data/stories/glossary-slugs.txt`. Link the key concept (the object's type, a term a
   beginner needs). Not in the tagline.
5. Style: British spelling (colour, centre, grey). Name objects the way the app does ("M 13", "NGC 7027", with a
   space). No exclamation marks, no "Did you know", no hype words (stunning, breathtaking, truly, incredibly…), no
   emoji, no Markdown inside strings. Use typographic quotes and dashes (’ “ ” —). Short sentences; one idea each.
6. Several objects may share one Wikipedia article (e.g. two NGC numbers of the same nebula, a cluster and its
   nebula): write each entry about its own object and don't copy text between them.

## How to work

1. Read this brief and `scripts/data/stories/glossary-slugs.txt`.
2. Read your batch file `scripts/data/stories/batches/NN.md` in parts (it is long), writing as you go.
3. Write the JSON file (you may build it up in several writes), then run `python3 scripts/data/stories/check.py NN`
   and fix every problem it reports until it prints `OK`.
4. Re-read a sample of your entries against the research for accuracy before finishing.
5. Reply with just: the number of entries written, and any objects where you were unsure of a fact (and left it out).

## Stars (batches s0–s3)

These batches are single named stars (Vega, Betelgeuse, Mira…). Same rules, same lengths as famous objects, plus:

- **desc** (required): the observing note shown in the app's sky chart and at the eyepiece, 60–320 characters, 1–2
  sentences, no glossary links. What you actually see and how to find it: its colour and brightness, a famous
  pattern it belongs to or pointer stars that lead to it, and one practical tip (e.g. "defocus slightly to see its
  orange", "compare it with Rigel", "check it every few weeks: it fades to invisibility"). Don't mention seasons or
  times — the app shows when it's up.
- **story**: make the star real — how big, how hot, how old, how it will end ("if it replaced the Sun, its surface
  would reach past Mars"), what it's made of or doing (spinning so fast it's flattened, pulsing, shedding gas,
  planets around it), and its human story: the meaning of its name, mythology, navigation, famous observations.
  Size comparisons with the Sun or the Solar System are welcome; distance figures are still out (the app shows them).
- **discovered**: usually `{ "by": null, "year": null, "note": "Known since antiquity" }` for naked-eye stars; for
  faint ones the discoverer (Barnard's Star: E. E. Barnard, 1916), for variability the discoverer of that if it's the
  story (Mira: David Fabricius, 1596) — say so in the note.
- Glossary slugs you'll likely want: star, spectral-type, star-colour, variable-star, double-star, magnitude.
