import type { Express } from "express";
import { registerMe } from "./me";
import { registerFeatures } from "./features";
import { registerTargets } from "./targets";
import { registerDonations } from "./donations";
import { registerLocations } from "./locations";
import { registerGeo } from "./geo";
import { registerGear } from "./gear";
import { registerJournal } from "./journal";
import { registerForecast } from "./forecast";
import { registerComets } from "./comets";

export function registerRoutes(app: Express) {
  registerFeatures(app);
  registerMe(app);
  registerLocations(app);
  registerGeo(app);
  registerGear(app);
  registerTargets(app);
  registerJournal(app);
  registerForecast(app);
  registerComets(app);
  registerDonations(app);
}
