/**
 * What each public URL says before any JavaScript runs: its title, description, link preview, structured
 * data and a readable version of the page. Search engines, AI assistants (most of which don't run
 * JavaScript) and security scanners read this; in the browser the app replaces it as it starts.
 */
import { FAQ } from "@shared/faq";
import { MOONS, type MoonMeta } from "@shared/astro/moons";
import { PLANET_BY_ID, SOLAR_SYSTEM, type PlanetMeta } from "@shared/astro/planets";
import type { CatalogEntry } from "../catalog";
import { allSubjects, catalog, conName, designations, displayName, planetNow, raDec, sizeText, skyFacts, subjectFor, typeLabel } from "./facts";

export const SITE = (process.env.SITE_URL ?? "https://astropilot.space").replace(/\/$/, "");
export const CONTACT = "hello@astropilot.space";
const OG_IMAGE = `${SITE}/og-image.jpg`;

export interface Page {
  status: number;
  title: string;
  description: string;
  /** Canonical path. */
  path: string;
  /** "noindex, follow" for personal app screens. */
  robots?: string;
  jsonLd?: object[];
  /** Readable page content (HTML). */
  body: string;
  /** A Markdown version of the page (for AI assistants). */
  markdown?: string;
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const a = (href: string, text: string) => `<a href="${esc(href)}">${esc(text)}</a>`;
const ul = (items: string[]) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

const TAGLINE = "Stargazing forecast, telescope targets and sky chart for your exact location";
const SUMMARY =
  "AstroPilot is a free web app for amateur astronomers and stargazers. For your exact location it tells you whether tonight is worth observing — cloud at three heights, seeing, transparency, dew and moonlight, hour by hour — which objects your telescope, binoculars or naked eyes can show tonight, and when and where to look. It also has an interactive sky chart, an observing planner and an observing journal.";

function layout(main: string): string {
  return `<header><p>${a("/", "AstroPilot")} — ${esc(TAGLINE)}</p><nav aria-label="Main">${[
    a("/", "Tonight"),
    a("/sky", "Sky chart"),
    a("/explore", "Explore"),
    a("/about", "About"),
  ].join(" · ")}</nav></header><main>${main}</main><footer><p>${[a("/about", "About"), a("/privacy", "Privacy policy"), a("/terms", "Terms of use"), a("/support", "Support AstroPilot")].join(" · ")}</p><p>AstroPilot is made by Starboard Studio. Contact: <a href="mailto:${CONTACT}">${CONTACT}</a></p></footer>`;
}

const ORGANIZATION = { "@type": "Organization", name: "AstroPilot", url: `${SITE}/`, logo: `${SITE}/icon-512.png`, email: CONTACT };

function breadcrumb(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${SITE}${it.path}` })),
  };
}

function showpieces(n: number): CatalogEntry[] {
  return catalog()
    .list.filter((o) => o.showpiece)
    .slice(0, n);
}

// ------------------------------------------------------------------------------------------------
// Pages
// ------------------------------------------------------------------------------------------------

function home(): Page {
  const features = [
    `${a("/", "Tonight")}: a 0–100 verdict for the night from an astronomy-specific forecast, a 7-night outlook, hour-by-hour cloud, seeing and transparency, a cloud map with live satellite images and the week's cloud forecast on one slider, the Moon, the planets and their moons, comets, meteor showers, eclipses, space-station passes and aurora chances.`,
    `${a("/sky", "Sky chart")}: a live all-sky chart for your place and time, with stars, constellations, the planets, their moons and deep-sky objects, a time slider and search.`,
    `${a("/explore", "Explore")}: ${catalog().list.length} deep-sky objects — every Messier and Caldwell object, bright NGC/IC galaxies, nebulae and clusters, and classic double stars — plus the planets and their moons, ranked for your sky darkness, your instrument and tonight's Moon.`,
    "Plan: an observing run ordered so objects that set first come first, and a dark-sky calendar.",
    "Journal and achievements: an observing log with photos, and observing programs such as the Messier and Caldwell lists.",
    "Gear and locations: your telescopes, eyepieces, Barlows and filters with magnification and exit pupil, and your observing sites with sky darkness estimated from the light-pollution atlas.",
  ];
  const body = layout(
    `<h1>AstroPilot — your night sky, planned</h1><p>${esc(SUMMARY)}</p><h2>What AstroPilot does</h2>${ul(features)}<h2>Popular objects</h2>${ul(
      showpieces(24).map((o) => a(`/object/${encodeURIComponent(o.id)}`, displayName(o))),
    )}<p>AstroPilot is free and works without an account; a free account saves your locations, gear and observing log. ${a("/about", "How AstroPilot works")}.</p>`,
  );
  return {
    status: 200,
    title: "AstroPilot — Stargazing forecast, telescope targets & sky chart",
    description:
      "Is tonight worth it? AstroPilot gives an astronomy forecast for your exact location — cloud, seeing, transparency, moonlight — plus what your telescope can see tonight, an interactive sky chart and an observing log. Free.",
    path: "/",
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "AstroPilot",
        url: `${SITE}/`,
        description: SUMMARY,
        potentialAction: { "@type": "SearchAction", target: `${SITE}/explore?q={search_term_string}`, "query-input": "required name=search_term_string" },
      },
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "AstroPilot",
        url: `${SITE}/`,
        description: SUMMARY,
        applicationCategory: "EducationalApplication",
        applicationSubCategory: "Astronomy",
        operatingSystem: "Any (web browser); installable as an app",
        browserRequirements: "Requires JavaScript",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        image: OG_IMAGE,
        featureList: features.map((f) => f.replace(/<[^>]+>/g, "")),
        publisher: ORGANIZATION,
      },
      { "@context": "https://schema.org", ...ORGANIZATION },
    ],
  };
}

function explore(): Page {
  const groups = new Map<string, string[]>();
  for (const s of allSubjects()) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group)!.push(a(s.path, s.name));
  }
  const n = catalog().list.length;
  const body = layout(
    `<h1>Explore the night sky</h1><p>${n} deep-sky objects — every Messier and Caldwell object, bright NGC and IC galaxies, nebulae and clusters, and classic double stars — plus the Moon, the planets and their moons. In the app each one is ranked for your location's sky darkness, your telescope or binoculars and tonight's Moon, with its best time tonight.</p>${[
      ...groups,
    ]
      .map(([g, links]) => `<h2>${esc(g)}</h2>${ul(links)}`)
      .join("")}`,
  );
  return {
    status: 200,
    title: `Explore ${n} deep-sky objects, the planets and their moons | AstroPilot`,
    description: `Every Messier and Caldwell object, bright NGC/IC galaxies, nebulae and clusters, double stars, the planets and their moons — ranked for your sky, your telescope and tonight's Moon.`,
    path: "/explore",
    body,
    jsonLd: [breadcrumb([{ name: "Explore", path: "/explore" }])],
  };
}

function sky(): Page {
  const body = layout(
    `<h1>Interactive sky chart</h1><p>A live all-sky chart for your exact location and time: stars, constellations, the Moon, the planets and their moons, and deep-sky objects. Slide through the night to see what rises and sets, search for any object and get where to look (altitude and compass direction) and when it is highest.</p><h2>The Solar System</h2>${ul(
      SOLAR_SYSTEM.map((p) => a(`/object/${p.id}`, p.name)),
    )}`,
  );
  return {
    status: 200,
    title: "Interactive sky chart for your location | AstroPilot",
    description: "A live sky chart for your exact place and time — stars, constellations, planets, their moons and deep-sky objects — with a time slider, search and where to look.",
    path: "/sky",
    body,
  };
}

function about(): Page {
  const faq = FAQ.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("");
  const body = layout(
    `<h1>About AstroPilot</h1><p>${esc(SUMMARY)}</p><h2>Questions</h2>${faq}<h2>Data and methods</h2>${ul([
      "Positions of the Sun, Moon and planets: astronomy-engine (VSOP87 and ELP), checked against NASA/JPL Horizons and the US Naval Observatory.",
      "Sky brightness: Bortle class or SQM reading, airmass extinction and moonlight from the Krisciunas &amp; Schaefer (1991) model; new places are estimated from the World Atlas of Artificial Night Sky Brightness (D. J. Lorenz, 2025).",
      "Visibility: contrast against the sky background (Blackwell's threshold data, as modelled by Crumey 2014), at the best magnification your instrument offers.",
      "Events: meteor-shower peaks from the International Meteor Organization, eclipses and conjunctions computed for your location, comets from NASA/JPL, the moons of the planets from IMCCE's L1 theory and JPL Horizons.",
      "Weather: Open-Meteo numerical weather models, Copernicus aerosol forecasts and 7Timer.",
      "Catalog: OpenNGC (CC BY-SA 4.0) and classic double stars; star chart data from d3-celestial (Hipparcos).",
    ])}`,
  );
  return {
    status: 200,
    title: "About AstroPilot — how the forecasts and ratings work",
    description: "How AstroPilot's stargazing forecast, visibility ratings and sky positions are worked out, where the data comes from, and answers to common questions.",
    path: "/about",
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
}

function legal(kind: "privacy" | "terms" | "support"): Page {
  const t = {
    privacy: {
      title: "Privacy policy | AstroPilot",
      h1: "Privacy",
      text: "What AstroPilot stores (your account, saved locations, gear and observing log, only if you create an account), the services it relies on (Open-Meteo for weather, OpenStreetMap for maps and place search, NASA/JPL, NOAA and others for sky data), cookies and analytics, and how to export or delete your data.",
    },
    terms: { title: "Terms of use | AstroPilot", h1: "Terms of use", text: "The terms for using AstroPilot, a free service for amateur astronomers." },
    support: { title: "Support AstroPilot", h1: "Support AstroPilot", text: "AstroPilot is free and has no ads. Donations help pay for hosting and data." },
  }[kind];
  return {
    status: 200,
    title: t.title,
    description: t.text,
    path: `/${kind}`,
    body: layout(`<h1>${esc(t.h1)}</h1><p>${esc(t.text)}</p><p>The full page needs JavaScript. Questions: <a href="mailto:${CONTACT}">${CONTACT}</a></p>`),
  };
}

// --- object pages ---------------------------------------------------------------------------------

interface ObjectContent {
  name: string;
  title: string;
  description: string;
  html: string;
  md: string;
  about: object;
}

function dsoContent(o: CatalogEntry): ObjectContent {
  const name = displayName(o);
  const type = typeLabel(o.type);
  const con = conName(o.con);
  const f = skyFacts(o);
  const size = sizeText(o.size as number[] | undefined);
  const mag = typeof o.mag === "number" ? `magnitude ${o.mag.toFixed(1)}${o.magB ? " (blue)" : ""}` : null;
  const lead = `${name} is ${/^[aeiou]/i.test(type) ? "an" : "a"} ${type.toLowerCase()} in the constellation ${con}${mag ? `, ${mag}` : ""}${size ? `, ${size} across` : ""}.`;
  const when = `It is best placed in the evening sky around ${f.eveningMonth}, when it crosses the meridian at about 10 pm local time (around midnight in ${f.midnightMonth}). ${f.latitudes}`;
  const heights = `At its highest it stands ${f.altitudes.map((x) => (x.alt === null ? `below the horizon from ${x.label}` : `${x.alt}° up from ${x.label}`)).join(", ")}.`;
  const desc = typeof o.desc === "string" ? o.desc : "";
  const facts: [string, string][] = [
    ["Type", type],
    ["Constellation", con],
    ["Designations", designations(o).join(", ") || o.name],
    ...(mag ? ([["Magnitude", mag.replace("magnitude ", "")]] as [string, string][]) : []),
    ...(size ? ([["Apparent size", size]] as [string, string][]) : []),
    ["Position", raDec(o.ra, o.dec)],
  ];
  const cta = `Open AstroPilot to see when ${name} is highest tonight from your location, how easy it is with your telescope or binoculars, and an eyepiece view.`;
  return {
    name,
    title: `${name} — when and how to see it | AstroPilot`,
    description: `${lead} Best in the evening around ${f.eveningMonth}. See when it's highest tonight from your location and how easy it is with your telescope.`,
    html: `<h1>${esc(name)}</h1><p>${esc(lead)}</p>${desc ? `<p>${esc(desc)}</p>` : ""}<h2>When and where to see it</h2><p>${esc(when)}</p><p>${esc(heights)}</p><h2>Facts</h2><dl>${facts
      .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
      .join("")}</dl><p>${esc(cta)}</p>`,
    md: `# ${name}\n\n${lead}\n\n${desc ? `${desc}\n\n` : ""}## When and where to see it\n\n${when}\n\n${heights}\n\n## Facts\n\n${facts.map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n\n${cta} ${SITE}/object/${encodeURIComponent(o.id)}\n`,
    about: { "@type": "Thing", name: o.name, alternateName: designations(o), description: desc || lead },
  };
}

function planetContent(p: PlanetMeta): ObjectContent {
  const now = planetNow(p);
  const lead = p.id === "moon" ? "The Moon is Earth's natural satellite and the easiest telescope target of all." : `${p.name} is a planet of the Solar System.`;
  const cta = `Its place changes from night to night: open AstroPilot for tonight's rise, set and best time from your location${p.id === "jupiter" ? ", and where its four Galilean moons are" : ""}.`;
  return {
    name: p.name,
    title: p.id === "moon" ? "The Moon tonight — phase, rise and set, what to observe | AstroPilot" : `${p.name} tonight — where to see it and when | AstroPilot`,
    description: `${lead} ${p.blurb}${now ? ` ${now}` : ""}`,
    html: `<h1>${esc(p.name)}</h1><p>${esc(lead)} ${esc(p.blurb)}</p>${now ? `<p>${esc(now)}</p>` : ""}<p>${esc(cta)}</p>`,
    md: `# ${p.name}\n\n${lead} ${p.blurb}\n\n${now ? `${now}\n\n` : ""}${cta} ${SITE}/object/${p.id}\n`,
    about: { "@type": "Thing", name: p.name, description: p.blurb },
  };
}

function moonContent(m: MoonMeta): ObjectContent {
  const planet = PLANET_BY_ID[m.parent].name;
  const period = m.periodDays < 2 ? `${Math.round(m.periodDays * 24)} hours` : `${m.periodDays.toFixed(1)} days`;
  const lead = `${m.name} (${m.designation}) is a moon of ${planet}, discovered by ${m.discovered.by} in ${m.discovered.year}. It orbits ${planet} every ${period} and shines at about magnitude ${m.mag.toFixed(1)}.`;
  const cta = `Open AstroPilot to see where ${m.name} is next to ${planet} tonight and how easy it is with your telescope.`;
  return {
    name: m.name,
    title: `${m.name}, moon of ${planet} — how to see it | AstroPilot`,
    description: `${lead} ${m.blurb}`,
    html: `<h1>${esc(m.name)}</h1><p>${esc(lead)}</p><p>${esc(m.blurb)}</p><p>Other moons of ${esc(planet)}: ${MOONS.filter((x) => x.parent === m.parent && x.id !== m.id)
      .map((x) => a(`/object/${x.id}`, x.name))
      .join(", ") || "none"}.</p><p>${esc(cta)}</p>`,
    md: `# ${m.name}\n\n${lead}\n\n${m.blurb}\n\n${cta} ${SITE}/object/${m.id}\n`,
    about: { "@type": "Thing", name: m.name, alternateName: [m.designation], description: m.blurb },
  };
}

export function objectContent(id: string): ObjectContent | null {
  const s = subjectFor(id);
  if (!s) return null;
  return s.kind === "dso" ? dsoContent(s.o) : s.kind === "planet" ? planetContent(s.p) : moonContent(s.m);
}

function objectPage(id: string): Page | null {
  const c = objectContent(id);
  const s = subjectFor(id);
  if (!c || !s) return null;
  const canonicalId = s.kind === "dso" ? encodeURIComponent(s.o.id) : s.kind === "planet" ? s.p.id : s.m.id;
  const path = `/object/${canonicalId}`;
  return {
    status: 200,
    title: c.title,
    description: c.description,
    path,
    markdown: `${path}.md`,
    body: layout(`<nav aria-label="Breadcrumb">${a("/explore", "Explore")} › ${esc(c.name)}</nav>${c.html}`),
    jsonLd: [
      breadcrumb([
        { name: "Explore", path: "/explore" },
        { name: c.name, path },
      ]),
      { "@context": "https://schema.org", "@type": "WebPage", name: c.title, url: `${SITE}${path}`, description: c.description, about: c.about, isPartOf: { "@type": "WebSite", name: "AstroPilot", url: `${SITE}/` } },
    ],
  };
}

function appScreen(path: string, title: string, what: string): Page {
  return {
    status: 200,
    title: `${title} | AstroPilot`,
    description: what,
    path,
    robots: "noindex, follow",
    body: layout(`<h1>${esc(title)}</h1><p>${esc(what)}</p>`),
  };
}

function notFound(path: string): Page {
  return {
    status: 404,
    title: "Page not found | AstroPilot",
    description: "This page doesn't exist on AstroPilot.",
    path,
    robots: "noindex, follow",
    body: layout(`<h1>Page not found</h1><p>There's no page at this address. ${a("/explore", "Explore the night sky")} or go to ${a("/", "tonight's forecast")}.</p>`),
  };
}

/** The app's old addresses (AstroPilot 1) and their new homes: real 301s, not a page that redirects later. */
export const REDIRECTS: Record<string, string> = {
  "/donation/success": "/support/thanks",
  "/donation/cancel": "/support",
  "/sky-tonight": "/sky",
  "/objects": "/explore",
  "/recommendations": "/explore",
  "/wizard": "/plan",
  "/watchlist": "/plan",
  "/sessions": "/journal",
  "/equipment": "/gear",
  "/equipment-analyzer": "/gear",
  "/help": "/about",
};

/** The page for a path (without query string). */
export function pageFor(pathname: string): Page {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const obj = /^\/object\/([^/]+)$/.exec(path);
  if (obj) return objectPage(decodeURIComponent(obj[1])) ?? notFound(path);
  switch (path) {
    case "/":
      return home();
    case "/explore":
      return explore();
    case "/sky":
      return sky();
    case "/about":
      return about();
    case "/privacy":
    case "/terms":
    case "/support":
      return legal(path.slice(1) as "privacy" | "terms" | "support");
    case "/support/thanks":
      return appScreen(path, "Thank you", "Thank you for supporting AstroPilot.");
    case "/plan":
      return appScreen(path, "Observing plan", "Your targets for the night, in the order that makes the most of the dark hours.");
    case "/journal":
      return appScreen(path, "Observing journal", "Your observing log: sessions, objects seen, notes and photos.");
    case "/achievements":
      return appScreen(path, "Achievements", "Observing programs and milestones earned from your observing log.");
    case "/gear":
      return appScreen(path, "Gear", "Your telescopes, eyepieces, Barlows, filters and cameras, with magnification and exit pupil.");
    case "/locations":
      return appScreen(path, "Locations", "Your observing sites with time zone, elevation and sky darkness.");
    case "/settings":
      return appScreen(path, "Settings", "Units, time format, minimum altitude and your account.");
    case "/login":
      return appScreen(path, "Sign in", "Sign in to AstroPilot to use your saved locations, gear and observing log.");
    case "/register":
      return appScreen(path, "Create an account", "A free AstroPilot account saves your locations, gear and observing log.");
  }
  if (/^\/journal\/\d+$/.test(path)) return appScreen(path, "Observing session", "An observing session in your journal.");
  return notFound(path);
}

// ------------------------------------------------------------------------------------------------
// The HTML shell
// ------------------------------------------------------------------------------------------------

const jsonLdTag = (o: object) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;

/** The page's head tags (replacing the shell's default block) and its readable content inside #root. */
export function renderShell(template: string, page: Page): string {
  const url = `${SITE}${page.path}`;
  const head = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta name="robots" content="${page.robots ?? "index, follow, max-image-preview:large"}" />`,
    `<meta property="og:site_name" content="AstroPilot" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="AstroPilot — your night sky, planned" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    ...(page.markdown ? [`<link rel="alternate" type="text/markdown" href="${esc(page.markdown)}" title="${esc(page.title)} (Markdown)" />`] : []),
    ...(page.jsonLd ?? []).map(jsonLdTag),
  ].join("\n    ");
  return template
    .replace(/<!--seo-->[\s\S]*?<!--\/seo-->/, head)
    .replace("<!--ssr-->", `<div id="ssr">${page.body}</div>`);
}
