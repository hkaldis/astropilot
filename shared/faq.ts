/**
 * Questions people ask about AstroPilot, answered once: shown on the About page, in the server-rendered
 * page for crawlers and AI assistants, and as FAQPage structured data (which must match what's visible).
 */
export const FAQ: { q: string; a: string }[] = [
  {
    q: "Is AstroPilot free?",
    a: "Yes. Every feature is free. A free account is optional: it saves your locations, telescopes and eyepieces, and your observing log. Donations help pay for hosting.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. AstroPilot runs in any modern browser on a phone, tablet or computer. You can also install it as an app from the browser menu; once installed it keeps working at a dark site without signal.",
  },
  {
    q: "How does AstroPilot decide whether tonight is good for stargazing?",
    a: "It combines an astronomy-specific weather forecast for your exact location — cloud at three heights, seeing from jet-stream and wind-shear data, transparency from humidity and aerosols, and dew risk — with how dark the night gets and how much moonlight there is, hour by hour, into a score from 0 to 100 and a 7-night outlook.",
  },
  {
    q: "Which objects can I see with my telescope?",
    a: "Tell AstroPilot what you observe with — the naked eye, binoculars or a telescope, or your own gear with its eyepieces — and it rates every object from easy to out of reach for your sky's darkness, your instrument and tonight's Moon, and says when each one is best placed.",
  },
  {
    q: "How accurate are the positions and times?",
    a: "Positions are computed with astronomy-engine (VSOP87 and ELP theories) and checked against NASA/JPL Horizons and the US Naval Observatory: Sun and Moon rise and set times agree to about a minute and planet positions to a few arcseconds.",
  },
  {
    q: "Where does the weather data come from?",
    a: "From Open-Meteo's numerical weather models (with ECMWF, GFS and ICON as a cross-check), Copernicus aerosol forecasts and 7Timer's astronomical forecast. The cloud map shows EUMETSAT's Meteosat satellite images for the last few hours, then Open-Meteo's hourly cloud forecast for the week. Sky darkness for a new place is estimated from the 2025 World Atlas of Artificial Night Sky Brightness.",
  },
];
