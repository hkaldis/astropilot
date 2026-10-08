/**
 * Search engines, AI assistants and security scanners: robots.txt, sitemap.xml, llms.txt (and a Markdown
 * twin of every object page), security.txt, real redirects and 404s, and the server-rendered HTML shell.
 */
import type { Express, Request, Response } from "express";
import { isProd } from "../env";
import { SOLAR_SYSTEM } from "@shared/astro/planets";
import { MOONS } from "@shared/astro/moons";
import { FAQ } from "@shared/faq";
import { allSubjects, catalog } from "./facts";
import { CONTACT, REDIRECTS, SITE, objectContent, pageFor, renderShell } from "./pages";

const text = (res: Response, type: string, body: string, maxAge = 3600) => {
  res.setHeader("Content-Type", `${type}; charset=utf-8`);
  res.setHeader("Cache-Control", `public, max-age=${maxAge}`);
  res.send(body);
};

function robots(): string {
  return `# AstroPilot welcomes search engines and AI assistants.
User-agent: *
Allow: /
Disallow: /api/
Allow: /api/health

Sitemap: ${SITE}/sitemap.xml
`;
}

function sitemap(): string {
  const urls = ["/", "/explore", "/sky", "/about", "/privacy", "/terms", "/support", ...allSubjects().map((s) => s.path)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc>${u === "/" ? "<changefreq>daily</changefreq><priority>1.0</priority>" : ""}</url>`).join("\n")}
</urlset>
`;
}

/** https://llmstxt.org — what AstroPilot is, for AI assistants answering questions about it. */
function llms(): string {
  const n = catalog().list.length;
  return `# AstroPilot

> AstroPilot (${SITE}) is a free web app for amateur astronomers and stargazers. For an exact location it says whether tonight is worth observing — cloud at three heights, seeing, transparency, dew and moonlight, hour by hour, as a 0–100 score with a 7-night outlook — which objects a given telescope, binoculars or the naked eye can show tonight, and when and where to look. It also has an interactive sky chart, an observing planner and an observing journal. No install is needed; it runs in any browser and can be installed as an app.

AstroPilot is made by Starboard Studio. Contact: ${CONTACT}. It is free; an optional free account saves locations, gear and the observing log.

## Features

- [Tonight](${SITE}/): observing verdict and forecast for the user's location, a cloud map (live Meteosat satellite images, then the hourly cloud forecast for the week on one slider), the Moon, the planets and their moons, comets, meteor showers, eclipses, space-station passes, aurora chances.
- [Sky chart](${SITE}/sky): live all-sky chart for any place and time, with search.
- [Explore](${SITE}/explore): ${n} deep-sky objects (all Messier and Caldwell objects, bright NGC/IC objects, double stars) plus the planets and their moons, ranked for the user's sky darkness, instrument and moonlight.
- Plan, Journal, Achievements, Gear (telescopes, eyepieces, magnification, exit pupil) and Locations (sky darkness from the light-pollution atlas) are personal screens.

## Object pages

Every object has a page with what it is, when it is best placed in the evening sky, how high it climbs from different latitudes and its catalog facts — and a Markdown version for AI assistants (add \`.md\`):

- [Index of all object pages (Markdown)](${SITE}/objects.md)
- Examples: [Andromeda Galaxy, M 31](${SITE}/object/M31.md), [Orion Nebula, M 42](${SITE}/object/M42.md), [Jupiter](${SITE}/object/jupiter.md), [Titan](${SITE}/object/titan.md)

Ids: Messier "M1"–"M110", "NGC7000", "IC434", Caldwell "C41", planets ("jupiter", "moon"), planetary moons ("io", "titan"). For a specific place and night, send people to the app: positions, times and visibility ratings there are computed for their location and instrument.

## Questions

${FAQ.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}

## Optional

- [About and methods](${SITE}/about)
- [Privacy policy](${SITE}/privacy)
- [Terms of use](${SITE}/terms)
`;
}

function objectsIndex(): string {
  const groups = new Map<string, string[]>();
  for (const s of allSubjects()) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group)!.push(`- [${s.name}](${SITE}${s.path}.md)`);
  }
  return `# AstroPilot object pages

${SOLAR_SYSTEM.length} Solar System bodies, ${MOONS.length} moons of the planets and ${catalog().list.length} deep-sky objects. Each link is the Markdown version; drop \`.md\` for the web page.

${[...groups].map(([g, lines]) => `## ${g}\n\n${lines.join("\n")}`).join("\n\n")}
`;
}

function securityTxt(): string {
  const expires = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10) + "T00:00:00Z";
  return `Contact: mailto:${CONTACT}
Expires: ${expires}
Preferred-Languages: en
Canonical: ${SITE}/.well-known/security.txt
Policy: ${SITE}/privacy
`;
}

export function registerSeo(app: Express) {
  // One address for the site: www sends visitors (and search engines) to the bare domain.
  if (isProd) {
    const canonicalHost = new URL(SITE).host;
    app.use((req, res, next) => {
      const host = req.headers.host ?? "";
      if (host === `www.${canonicalHost}` && (req.method === "GET" || req.method === "HEAD") && !req.path.startsWith("/api/"))
        return res.redirect(301, `${SITE}${req.originalUrl}`);
      next();
    });
  }
  for (const [from, to] of Object.entries(REDIRECTS)) {
    app.get(from, (req, res) => {
      const q = req.originalUrl.indexOf("?");
      res.redirect(301, `${to}${q >= 0 ? req.originalUrl.slice(q) : ""}`);
    });
  }
  app.get("/robots.txt", (_req, res) => text(res, "text/plain", robots(), 86_400));
  app.get("/sitemap.xml", (_req, res) => text(res, "application/xml", sitemap(), 86_400));
  app.get("/llms.txt", (_req, res) => text(res, "text/plain", llms(), 86_400));
  app.get("/objects.md", (_req, res) => text(res, "text/markdown", objectsIndex(), 86_400));
  app.get("/.well-known/security.txt", (_req, res) => text(res, "text/plain", securityTxt(), 86_400));
  app.get(/^\/object\/([^/]+)\.md$/, (req, res) => {
    const c = objectContent(decodeURIComponent((req.params as unknown as string[])[0]));
    if (!c) return res.status(404).type("text/plain").send("No such object.\n");
    // Planet pages say where the planet is now: keep them fresh for a day at most.
    text(res, "text/markdown", c.md, 6 * 3600);
  });
}

/** The app's HTML for a request: the right title, description, structured data and readable content, and status. */
export function renderHtml(template: string, req: Request): { status: number; html: string } {
  // req.path is relative to the handler's mount point ("*" makes it "/"): read the address itself.
  const page = pageFor(new URL(req.originalUrl, "http://x").pathname);
  return { status: page.status, html: renderShell(template, page) };
}
