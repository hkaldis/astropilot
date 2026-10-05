import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  integer,
  text,
  boolean,
  real,
  pgEnum,
  customType,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Enums
export const objectCategoryEnum = pgEnum('object_category', [
  'planet',
  'moon',
  'nebula',
  'emission_nebula',
  'reflection_nebula',
  'dark_nebula',
  'mixed_nebula',
  'open_cluster',
  'globular_cluster',
  'planetary_nebula',
  'galaxy',
  'double_star',
  'asterism',
  'supernova_remnant',
  'comet',
  'meteor_shower'
]);

export const difficultyEnum = pgEnum('difficulty', [
  'easy',
  'moderate',
  'challenging',
  'difficult',
  'expert'
]);

export const cameraTypeEnum = pgEnum('camera_type', [
  'smartphone',
  'astrocam',
  'dslr'
]);

export const filterTypeEnum = pgEnum('filter_type', [
  'none',
  'uhc',
  'oiii',
  'h_beta',
  'h_alpha',
  'neodymium',
  'contrast_booster',
  'cls',
  'lps',
  'nd',
  'variable_polarizer',
  'fringe_killer',
  'semi_apo',
  'color_yellow',
  'color_red',
  'color_blue',
  'color_green',
  'color_orange',
  'color_violet',
  'light_pollution',
  'moon',
  'color'
]);

export const accessoryTypeEnum = pgEnum('accessory_type', [
  'adapter',
  'power',
  'dew_control',
  'collimation',
  'mount_accessory',
  'case',
  'other'
]);

// Finder scope type enum
export const finderTypeEnum = pgEnum('finder_type', [
  'optical',      // Traditional optical finder (6x30, 8x50, etc.)
  'raci',         // Right-Angle Correct Image finder
  'red_dot',      // Red dot sight
  'telrad',       // Telrad-style reflex sight
  'laser'         // Green laser pointer
]);

// Optical modifier type enum (focal reducers and coma correctors)
export const opticalModifierTypeEnum = pgEnum('optical_modifier_type', [
  'focal_reducer',    // Reduces focal length (0.5x-0.95x)
  'coma_corrector'    // Corrects coma in fast Newtonians (may have slight magnification 1.0-1.15x)
]);

export const conditionSourceEnum = pgEnum('condition_source', [
  'manual',
  'api'
]);

export const powerClassEnum = pgEnum('power_class', [
  'HIGH',
  'MID',
  'LOW'
]);

export const authProviderEnum = pgEnum('auth_provider', [
  'local',
  'google'
]);

// Session storage table
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  authProvider: authProviderEnum("auth_provider").default('local'),
  passwordHash: varchar("password_hash"),
  googleId: varchar("google_id").unique(),
  favoriteTelescopeId: integer("favorite_telescope_id"), // User's preferred telescope for calculations
  favoriteLocationId: integer("favorite_location_id"), // User's preferred location for calculations
  preferences: jsonb("preferences"), // AstroPilot 2: units, time format, default ids, onboarding state
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Equipment tables
export const telescopes = pgTable("telescopes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  aperture: real("aperture").notNull(), // in mm
  focalLength: real("focal_length").notNull(), // in mm
  type: varchar("type", { length: 50 }), // e.g., Reflector, Refractor, Catadioptric
  obstructionRatio: real("obstruction_ratio"), // Central obstruction as percentage (0-100), typically 20-25% for reflectors
  createdAt: timestamp("created_at").defaultNow(),
});

export const eyepieces = pgTable("eyepieces", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  focalLength: real("focal_length").notNull(), // in mm
  apparentFov: real("apparent_fov"), // degrees
  createdAt: timestamp("created_at").defaultNow(),
});

export const barlows = pgTable("barlows", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  factor: real("factor").notNull(), // magnification factor (e.g., 2x, 3x)
  createdAt: timestamp("created_at").defaultNow(),
});

export const filters = pgTable("filters", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  type: filterTypeEnum("type").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const cameras = pgTable("cameras", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  type: cameraTypeEnum("type").notNull(),
  sensorSize: varchar("sensor_size", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const accessories = pgTable("accessories", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  type: accessoryTypeEnum("type").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Finders table - finder scopes, red dots, telrads
export const finders = pgTable("finders", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  type: finderTypeEnum("type").notNull(),
  magnification: real("magnification"), // For optical finders (6x, 8x, 9x)
  aperture: real("aperture"), // For optical finders (30mm, 50mm)
  fieldOfView: real("field_of_view"), // True FOV in degrees
  illuminatedReticle: boolean("illuminated_reticle").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Optical modifiers table - focal reducers and coma correctors
export const opticalModifiers = pgTable("optical_modifiers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  type: opticalModifierTypeEnum("type").notNull(),
  factor: real("factor").notNull(), // Reduction/magnification factor (0.63 for reducer, 1.1 for coma corrector)
  compatibleTelescopeTypes: text("compatible_telescope_types").array(), // e.g., ['SCT', 'Refractor']
  minFRatio: real("min_f_ratio"), // For coma correctors: minimum f/ratio it works with (e.g., f/3)
  maxFRatio: real("max_f_ratio"), // For coma correctors: maximum f/ratio (e.g., f/5)
  imageCircle: real("image_circle"), // Illuminated image circle diameter in mm
  backfocus: real("backfocus"), // Required backfocus in mm
  forImaging: boolean("for_imaging").default(true), // Primarily for imaging use
  forVisual: boolean("for_visual").default(false), // Suitable for visual use
  createdAt: timestamp("created_at").defaultNow(),
});

// Locations table
export const locations = pgTable("locations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  bortle: integer("bortle").notNull(), // 1-9
  notes: text("notes"),
  isFavorite: boolean("is_favorite").default(false),
  timezone: varchar("timezone", { length: 64 }), // IANA zone, e.g. Europe/Athens
  elevation: real("elevation"), // metres
  sqm: real("sqm"), // measured sky brightness, mag/arcsec² (optional, overrides Bortle)
  createdAt: timestamp("created_at").defaultNow(),
});

// Celestial objects catalog
export const celestialObjects = pgTable("celestial_objects", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }), // null = catalog object, set = user's custom object
  catalogId: varchar("catalog_id", { length: 50 }).notNull(), // e.g., M31, NGC7000, or user-defined
  name: varchar("name", { length: 100 }).notNull(),
  category: objectCategoryEnum("category").notNull(),
  constellation: varchar("constellation", { length: 50 }),
  magnitude: real("magnitude"),
  size: varchar("size", { length: 50 }), // angular size
  separation: real("separation"), // For double stars: angular separation in arcseconds
  rightAscension: varchar("right_ascension", { length: 20 }),
  declination: varchar("declination", { length: 20 }),
  bestMonths: text("best_months").array(), // e.g., ['jan', 'feb', 'mar']
  difficulty: difficultyEnum("difficulty"),
  moonInterference: integer("moon_interference"), // 0-5 scale, how much moon affects visibility
  isHot: boolean("is_hot").default(false), // popular/featured object
  description: text("description"),
});

// Observation sessions
export const observationSessions = pgTable("observation_sessions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  locationId: integer("location_id").references(() => locations.id),
  date: timestamp("date").notNull(),
  bortle: integer("bortle").notNull(), // can override location's bortle
  lowCloudPct: integer("low_cloud_pct").default(0), // low clouds 0-100%
  midCloudPct: integer("mid_cloud_pct").default(0), // mid clouds 0-100%
  highCloudPct: integer("high_cloud_pct").default(0), // high clouds 0-100%
  seeing: integer("seeing"), // 0-3 (poor to excellent)
  jetstream: integer("jetstream"), // 0-2 (strong to calm)
  humidity: integer("humidity"), // percentage
  moonIllumination: integer("moon_illumination"), // percentage
  totalScore: real("total_score"), // computed 0-10
  planetScore: real("planet_score"), // computed 0-5
  dsoScore: real("dso_score"), // computed 0-7
  notes: text("notes"),
  title: varchar("title", { length: 120 }),
  endDate: timestamp("end_date"),
  conditions: jsonb("conditions"), // forecast snapshot + observer ratings (AstroPilot 2)
  createdAt: timestamp("created_at").defaultNow(),
});

// Individual observations within a session
export const observations = pgTable("observations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  sessionId: integer("session_id").notNull().references(() => observationSessions.id, { onDelete: 'cascade' }),
  objectId: integer("object_id").notNull().references(() => celestialObjects.id),
  // Used equipment (what the observer actually used)
  telescopeId: integer("telescope_id").references(() => telescopes.id),
  eyepieceId: integer("eyepiece_id").references(() => eyepieces.id),
  barlowId: integer("barlow_id").references(() => barlows.id),
  filterId: integer("filter_id").references(() => filters.id),
  cameraId: integer("camera_id").references(() => cameras.id),
  opticalModifierId: integer("optical_modifier_id").references(() => opticalModifiers.id), // Focal reducer or coma corrector
  finderId: integer("finder_id").references(() => finders.id), // Finder used for acquisition
  magnification: real("magnification"),
  exitPupil: real("exit_pupil"),
  // Suggested equipment (system recommendations - stored as JSONB)
  suggestedEquipment: jsonb("suggested_equipment"),
  // Observation details
  visibilityRating: integer("visibility_rating"), // 1-5 stars
  imagingDone: boolean("imaging_done").default(false),
  exposure: varchar("exposure", { length: 50 }),
  iso: integer("iso"),
  notes: text("notes"),
  observedAt: timestamp("observed_at"),
  catalogRef: varchar("catalog_ref", { length: 50 }), // AstroPilot 2 catalog id, e.g. "M31", "NGC7000", "jupiter"
  seeing: integer("seeing"), // 1 (poor) .. 5 (excellent), observer's rating
  transparency: integer("transparency"), // 1..5
  createdAt: timestamp("created_at").defaultNow(),
});

// Observation photos - each observation can have multiple photos with their own settings
export const observationPhotos = pgTable("observation_photos", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  observationId: integer("observation_id").notNull().references(() => observations.id, { onDelete: 'cascade' }),
  imageUrl: varchar("image_url", { length: 500 }).notNull(),
  cameraId: integer("camera_id").references(() => cameras.id),
  // Camera settings for this specific photo
  exposure: varchar("exposure", { length: 50 }), // e.g., "1/250s", "30s", "2min"
  iso: integer("iso"),
  gain: integer("gain"), // for astrocams
  frameCount: integer("frame_count"), // number of stacked frames
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tonight's conditions - separate from observation sessions
export const nightConditions = pgTable("night_conditions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  locationId: integer("location_id").references(() => locations.id),
  observingDate: timestamp("observing_date").notNull(), // The night this applies to
  bortle: integer("bortle"), // Location's bortle at time of saving
  lowCloudPct: integer("low_cloud_pct").default(0),
  midCloudPct: integer("mid_cloud_pct").default(0),
  highCloudPct: integer("high_cloud_pct").default(0),
  seeingArcsec: real("seeing_arcsec"), // Seeing in arcseconds
  jetStreamIndex: integer("jet_stream_index"), // 0-100
  humidity: integer("humidity"), // percentage
  moonIllumination: integer("moon_illumination"), // percentage
  // Computed scores
  totalScore: real("total_score"),
  planetScore: real("planet_score"),
  dsoScore: real("dso_score"),
  powerClass: powerClassEnum("power_class"),
  // Metadata
  source: conditionSourceEnum("source").default('manual'),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User custom settings for objects (optional overrides)
export const objectSettings = pgTable("object_settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  objectId: integer("object_id").notNull().references(() => celestialObjects.id),
  notes: text("notes"),
  isFavorite: boolean("is_favorite").default(false),
  hasObserved: boolean("has_observed").default(false),
  customDifficulty: difficultyEnum("custom_difficulty"),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  telescopes: many(telescopes),
  eyepieces: many(eyepieces),
  barlows: many(barlows),
  filters: many(filters),
  cameras: many(cameras),
  finders: many(finders),
  opticalModifiers: many(opticalModifiers),
  locations: many(locations),
  sessions: many(observationSessions),
  objectSettings: many(objectSettings),
  nightConditions: many(nightConditions),
}));

export const telescopesRelations = relations(telescopes, ({ one }) => ({
  user: one(users, { fields: [telescopes.userId], references: [users.id] }),
}));

export const eyepiecesRelations = relations(eyepieces, ({ one }) => ({
  user: one(users, { fields: [eyepieces.userId], references: [users.id] }),
}));

export const barlowsRelations = relations(barlows, ({ one }) => ({
  user: one(users, { fields: [barlows.userId], references: [users.id] }),
}));

export const filtersRelations = relations(filters, ({ one }) => ({
  user: one(users, { fields: [filters.userId], references: [users.id] }),
}));

export const camerasRelations = relations(cameras, ({ one }) => ({
  user: one(users, { fields: [cameras.userId], references: [users.id] }),
}));

export const findersRelations = relations(finders, ({ one }) => ({
  user: one(users, { fields: [finders.userId], references: [users.id] }),
}));

export const opticalModifiersRelations = relations(opticalModifiers, ({ one }) => ({
  user: one(users, { fields: [opticalModifiers.userId], references: [users.id] }),
}));

export const locationsRelations = relations(locations, ({ one, many }) => ({
  user: one(users, { fields: [locations.userId], references: [users.id] }),
  sessions: many(observationSessions),
  nightConditions: many(nightConditions),
}));

export const nightConditionsRelations = relations(nightConditions, ({ one }) => ({
  user: one(users, { fields: [nightConditions.userId], references: [users.id] }),
  location: one(locations, { fields: [nightConditions.locationId], references: [locations.id] }),
}));

export const observationSessionsRelations = relations(observationSessions, ({ one, many }) => ({
  user: one(users, { fields: [observationSessions.userId], references: [users.id] }),
  location: one(locations, { fields: [observationSessions.locationId], references: [locations.id] }),
  observations: many(observations),
}));

export const observationsRelations = relations(observations, ({ one, many }) => ({
  session: one(observationSessions, { fields: [observations.sessionId], references: [observationSessions.id] }),
  object: one(celestialObjects, { fields: [observations.objectId], references: [celestialObjects.id] }),
  telescope: one(telescopes, { fields: [observations.telescopeId], references: [telescopes.id] }),
  eyepiece: one(eyepieces, { fields: [observations.eyepieceId], references: [eyepieces.id] }),
  barlow: one(barlows, { fields: [observations.barlowId], references: [barlows.id] }),
  filter: one(filters, { fields: [observations.filterId], references: [filters.id] }),
  camera: one(cameras, { fields: [observations.cameraId], references: [cameras.id] }),
  opticalModifier: one(opticalModifiers, { fields: [observations.opticalModifierId], references: [opticalModifiers.id] }),
  finder: one(finders, { fields: [observations.finderId], references: [finders.id] }),
  photos: many(observationPhotos),
}));

export const observationPhotosRelations = relations(observationPhotos, ({ one }) => ({
  observation: one(observations, { fields: [observationPhotos.observationId], references: [observations.id] }),
  camera: one(cameras, { fields: [observationPhotos.cameraId], references: [cameras.id] }),
}));

export const celestialObjectsRelations = relations(celestialObjects, ({ one, many }) => ({
  user: one(users, { fields: [celestialObjects.userId], references: [users.id] }),
  observations: many(observations),
  settings: many(objectSettings),
}));

export const objectSettingsRelations = relations(objectSettings, ({ one }) => ({
  user: one(users, { fields: [objectSettings.userId], references: [users.id] }),
  object: one(celestialObjects, { fields: [objectSettings.objectId], references: [celestialObjects.id] }),
}));

// Insert schemas - using .pick() pattern to avoid drizzle-zod .omit() TypeScript bug
export const insertTelescopeSchema = createInsertSchema(telescopes).pick({
  userId: true, name: true, aperture: true, focalLength: true, type: true, obstructionRatio: true
});
export const insertEyepieceSchema = createInsertSchema(eyepieces).pick({
  userId: true, name: true, focalLength: true, apparentFov: true
});
export const insertBarlowSchema = createInsertSchema(barlows).pick({
  userId: true, name: true, factor: true
});
export const insertFilterSchema = createInsertSchema(filters).pick({
  userId: true, name: true, type: true
});
export const insertCameraSchema = createInsertSchema(cameras).pick({
  userId: true, name: true, type: true, sensorSize: true
});
export const insertAccessorySchema = createInsertSchema(accessories).pick({
  userId: true, name: true, type: true, description: true
});
export const insertFinderSchema = createInsertSchema(finders).pick({
  userId: true, name: true, type: true, magnification: true, aperture: true, fieldOfView: true, illuminatedReticle: true
});
export const insertOpticalModifierSchema = createInsertSchema(opticalModifiers).pick({
  userId: true, name: true, type: true, factor: true, compatibleTelescopeTypes: true, 
  minFRatio: true, maxFRatio: true, imageCircle: true, backfocus: true, forImaging: true, forVisual: true
});
export const insertLocationSchema = createInsertSchema(locations).pick({
  userId: true, name: true, latitude: true, longitude: true, bortle: true, notes: true, isFavorite: true
});
export const insertCelestialObjectSchema = createInsertSchema(celestialObjects).pick({
  userId: true, catalogId: true, name: true, category: true, constellation: true, magnitude: true,
  size: true, separation: true, rightAscension: true, declination: true, bestMonths: true,
  difficulty: true, moonInterference: true, isHot: true, description: true
});
export const insertObservationSessionSchema = createInsertSchema(observationSessions).pick({
  userId: true, locationId: true, date: true, bortle: true, lowCloudPct: true, midCloudPct: true,
  highCloudPct: true, seeing: true, jetstream: true, humidity: true, moonIllumination: true,
  totalScore: true, planetScore: true, dsoScore: true, notes: true
});
export const insertObservationSchema = createInsertSchema(observations).pick({
  sessionId: true, objectId: true, telescopeId: true, eyepieceId: true, barlowId: true,
  filterId: true, cameraId: true, opticalModifierId: true, finderId: true,
  magnification: true, exitPupil: true, suggestedEquipment: true,
  visibilityRating: true, imagingDone: true, exposure: true, iso: true, notes: true
});
export const insertObservationPhotoSchema = createInsertSchema(observationPhotos).pick({
  observationId: true, imageUrl: true, cameraId: true, exposure: true, iso: true, gain: true,
  frameCount: true, notes: true
});
export const insertObjectSettingsSchema = createInsertSchema(objectSettings).pick({
  userId: true, objectId: true, notes: true, isFavorite: true, hasObserved: true, customDifficulty: true
});
export const insertNightConditionsSchema = createInsertSchema(nightConditions).pick({
  userId: true, locationId: true, observingDate: true, bortle: true, lowCloudPct: true,
  midCloudPct: true, highCloudPct: true, seeingArcsec: true, jetStreamIndex: true, humidity: true,
  moonIllumination: true, totalScore: true, planetScore: true, dsoScore: true, powerClass: true,
  source: true, notes: true
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Telescope = typeof telescopes.$inferSelect;
export type InsertTelescope = z.infer<typeof insertTelescopeSchema>;
export type Eyepiece = typeof eyepieces.$inferSelect;
export type InsertEyepiece = z.infer<typeof insertEyepieceSchema>;
export type Barlow = typeof barlows.$inferSelect;
export type InsertBarlow = z.infer<typeof insertBarlowSchema>;
export type Filter = typeof filters.$inferSelect;
export type InsertFilter = z.infer<typeof insertFilterSchema>;
export type Camera = typeof cameras.$inferSelect;
export type InsertCamera = z.infer<typeof insertCameraSchema>;
export type Accessory = typeof accessories.$inferSelect;
export type InsertAccessory = z.infer<typeof insertAccessorySchema>;
export type Finder = typeof finders.$inferSelect;
export type InsertFinder = z.infer<typeof insertFinderSchema>;
export type OpticalModifier = typeof opticalModifiers.$inferSelect;
export type InsertOpticalModifier = z.infer<typeof insertOpticalModifierSchema>;
export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type CelestialObject = typeof celestialObjects.$inferSelect;
export type InsertCelestialObject = z.infer<typeof insertCelestialObjectSchema>;
export type ObservationSession = typeof observationSessions.$inferSelect;
export type InsertObservationSession = z.infer<typeof insertObservationSessionSchema>;
export type Observation = typeof observations.$inferSelect;
export type InsertObservation = z.infer<typeof insertObservationSchema>;
export type ObservationPhoto = typeof observationPhotos.$inferSelect;
export type InsertObservationPhoto = z.infer<typeof insertObservationPhotoSchema>;
export type ObjectSettings = typeof objectSettings.$inferSelect;
export type InsertObjectSettings = z.infer<typeof insertObjectSettingsSchema>;
export type NightConditions = typeof nightConditions.$inferSelect;
export type InsertNightConditions = z.infer<typeof insertNightConditionsSchema>;

// === GAMIFICATION TABLES ===

// Badge types enum
export const badgeTierEnum = pgEnum('badge_tier', [
  'bronze',
  'silver', 
  'gold',
  'platinum',
  'special'
]);

export const badgeCategoryEnum = pgEnum('badge_category', [
  'observation_count',
  'object_type',
  'equipment',
  'catalog_completion',
  'conditions',
  'imaging',
  'streak',
  'special'
]);

// Badges/Achievements definitions (system-wide, not user-specific)
export const badges = pgTable("badges", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description").notNull(),
  icon: varchar("icon", { length: 50 }).notNull(), // Lucide icon name
  tier: badgeTierEnum("tier").notNull().default('bronze'),
  category: badgeCategoryEnum("category").notNull(),
  requirement: jsonb("requirement").notNull(), // JSON defining unlock criteria
  points: integer("points").notNull().default(10),
  isSecret: boolean("is_secret").default(false), // Hidden until unlocked
  createdAt: timestamp("created_at").defaultNow(),
});

// User badges (earned achievements)
export const userBadges = pgTable("user_badges", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  badgeId: integer("badge_id").notNull().references(() => badges.id, { onDelete: 'cascade' }),
  earnedAt: timestamp("earned_at").defaultNow(),
  progress: jsonb("progress"), // Optional: progress data at time of earning
});

// User stats/progress tracking (for achievements)
export const userStats = pgTable("user_stats", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  totalObservations: integer("total_observations").default(0),
  totalSessions: integer("total_sessions").default(0),
  totalPhotos: integer("total_photos").default(0),
  messierObjectsObserved: integer("messier_objects_observed").default(0),
  ngcObjectsObserved: integer("ngc_objects_observed").default(0),
  planetsObserved: integer("planets_observed").default(0),
  nebulaeObserved: integer("nebulae_observed").default(0),
  galaxiesObserved: integer("galaxies_observed").default(0),
  clustersObserved: integer("clusters_observed").default(0),
  doubleStarsObserved: integer("double_stars_observed").default(0),
  currentStreak: integer("current_streak").default(0), // Days in a row
  longestStreak: integer("longest_streak").default(0),
  lastObservationDate: timestamp("last_observation_date"),
  totalPoints: integer("total_points").default(0),
  messierCertificateEarned: boolean("messier_certificate_earned").default(false),
  messierCertificateDate: timestamp("messier_certificate_date"),
  // Celestial event tracking
  conjunctionsObserved: integer("conjunctions_observed").default(0),
  oppositionsObserved: integer("oppositions_observed").default(0),
  meteorShowersObserved: integer("meteor_showers_observed").default(0),
  eclipsesObserved: integer("eclipses_observed").default(0),
  rareEventsObserved: integer("rare_events_observed").default(0), // Transits, occultations, etc.
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Messier Marathon tracking (for certificate)
export const messierProgress = pgTable("messier_progress", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  objectId: integer("object_id").notNull().references(() => celestialObjects.id),
  firstObservedAt: timestamp("first_observed_at").defaultNow(),
  observationCount: integer("observation_count").default(1),
  bestSessionId: integer("best_session_id").references(() => observationSessions.id),
}, (table) => [
  index("messier_progress_user_object_idx").on(table.userId, table.objectId)
]);

// Schemas and types for gamification - using .pick() pattern to avoid drizzle-zod .omit() TypeScript bug
export const insertBadgeSchema = createInsertSchema(badges).pick({
  name: true, description: true, icon: true, tier: true, category: true, requirement: true, points: true, isSecret: true
});
export const insertUserBadgeSchema = createInsertSchema(userBadges).pick({
  userId: true, badgeId: true, progress: true
});
export const insertUserStatsSchema = createInsertSchema(userStats).pick({
  userId: true, totalObservations: true, totalSessions: true, totalPhotos: true,
  messierObjectsObserved: true, ngcObjectsObserved: true, planetsObserved: true, nebulaeObserved: true,
  galaxiesObserved: true, clustersObserved: true, doubleStarsObserved: true, currentStreak: true,
  longestStreak: true, lastObservationDate: true, totalPoints: true, messierCertificateEarned: true,
  messierCertificateDate: true, conjunctionsObserved: true, oppositionsObserved: true,
  meteorShowersObserved: true, eclipsesObserved: true, rareEventsObserved: true
});
export const insertMessierProgressSchema = createInsertSchema(messierProgress).pick({
  userId: true, objectId: true, observationCount: true, bestSessionId: true
});

export type Badge = typeof badges.$inferSelect;
export type InsertBadge = z.infer<typeof insertBadgeSchema>;
export type UserBadge = typeof userBadges.$inferSelect;
export type InsertUserBadge = z.infer<typeof insertUserBadgeSchema>;
export type UserStats = typeof userStats.$inferSelect;
export type InsertUserStats = z.infer<typeof insertUserStatsSchema>;
export type MessierProgress = typeof messierProgress.$inferSelect;
export type InsertMessierProgress = z.infer<typeof insertMessierProgressSchema>;

// Type for suggested equipment JSONB structure
export interface SuggestedEquipment {
  telescopeId?: number;
  telescopeName?: string;
  eyepiece?: {
    id: number;
    name: string;
    focalLength?: number;
    magnification?: number;
    exitPupil?: number;
    reason: string;
  };
  barlow?: {
    id: number;
    name: string;
    factor: number;
    reason?: string;
  };
  filter?: {
    id?: number;
    name?: string;
    type: string;
    status?: 'required' | 'optional' | 'not_recommended';
    recommendation?: string;
    reason: string;
  };
  opticalModifier?: {
    id: number;
    name: string;
    type: 'focal_reducer' | 'coma_corrector';
    factor: number;
    reason: string;
  };
  finder?: {
    id: number;
    name: string;
    type: string;
    reason: string;
  };
  imaging?: {
    feasibility: 'yes' | 'borderline' | 'no';
    preferredCamera?: string;
    reason: string;
    settings?: {
      exposureRange: string;
      isoGain: string;
      frameCount: string;
      notes: string;
    };
  };
  magnification?: number;
  exitPupil?: number;
  effectiveFocalLength?: number; // Telescope FL modified by reducer/corrector
  effectiveFRatio?: number; // f/ratio after modifier
  powerClass?: 'HIGH' | 'MID' | 'LOW';
}

// === WATCH LIST TABLES ===

// Priority levels for watchlist items
export const watchlistPriorityEnum = pgEnum('watchlist_priority', [
  'high',
  'medium',
  'low'
]);

// Status of watchlist items
export const watchlistStatusEnum = pgEnum('watchlist_status', [
  'planned',     // Waiting to observe
  'observed',    // Successfully observed
  'dismissed'    // User removed/no longer interested
]);

// Twilight segment for observation windows
export const twilightSegmentEnum = pgEnum('twilight_segment', [
  'evening',   // Astronomical dusk until ~midnight
  'midnight',  // Around local midnight when sun is lowest
  'morning'    // ~midnight until astronomical dawn
]);

// User's watchlist items
export const watchlistItems = pgTable("watchlist_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  objectId: integer("object_id").notNull().references(() => celestialObjects.id, { onDelete: 'cascade' }),
  priority: watchlistPriorityEnum("priority").default('medium'),
  notes: text("notes"),
  status: watchlistStatusEnum("status").default('planned'),
  observationId: integer("observation_id").references(() => observations.id), // Link when observed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("watchlist_user_object_idx").on(table.userId, table.objectId),
  index("watchlist_user_status_idx").on(table.userId, table.status)
]);

// Cached observation windows for watchlist items (computed by server)
// Windows are continuous periods within astronomical twilight when the object is observable
export const watchlistWindows = pgTable("watchlist_windows", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  watchlistItemId: integer("watchlist_item_id").notNull().references(() => watchlistItems.id, { onDelete: 'cascade' }),
  locationId: integer("location_id").notNull().references(() => locations.id, { onDelete: 'cascade' }),
  windowDate: timestamp("window_date").notNull(), // Calendar date when window starts (local reference)
  startTime: timestamp("start_time").notNull(), // Actual start time (within astronomical twilight)
  endTime: timestamp("end_time").notNull(), // Actual end time (may span into next calendar day)
  qualityScore: integer("quality_score").notNull(), // 0-100
  peakAltitude: real("peak_altitude"), // Maximum altitude during window
  transitTime: timestamp("transit_time"), // When object is highest
  moonPhase: real("moon_phase"), // 0-100 illumination
  moonSeparation: real("moon_separation"), // Angular separation in degrees
  moonInterference: varchar("moon_interference", { length: 20 }), // none, low, moderate, high
  durationMinutes: integer("duration_minutes"), // Total observable time in this window
  twilightSegment: twilightSegmentEnum("twilight_segment"), // evening, midnight, or morning
  astronomicalDusk: timestamp("astronomical_dusk"), // When sun reaches -18° (darkness begins)
  astronomicalDawn: timestamp("astronomical_dawn"), // When sun reaches -18° (darkness ends)
  generatedAt: timestamp("generated_at").defaultNow(),
}, (table) => [
  index("watchlist_windows_item_idx").on(table.watchlistItemId),
  index("watchlist_windows_date_idx").on(table.windowDate)
]);

// Relations for watchlist
export const watchlistItemsRelations = relations(watchlistItems, ({ one, many }) => ({
  user: one(users, { fields: [watchlistItems.userId], references: [users.id] }),
  object: one(celestialObjects, { fields: [watchlistItems.objectId], references: [celestialObjects.id] }),
  observation: one(observations, { fields: [watchlistItems.observationId], references: [observations.id] }),
  windows: many(watchlistWindows),
}));

export const watchlistWindowsRelations = relations(watchlistWindows, ({ one }) => ({
  watchlistItem: one(watchlistItems, { fields: [watchlistWindows.watchlistItemId], references: [watchlistItems.id] }),
  location: one(locations, { fields: [watchlistWindows.locationId], references: [locations.id] }),
}));

// Insert schemas for watchlist - using .pick() pattern to avoid drizzle-zod .omit() TypeScript bug
export const insertWatchlistItemSchema = createInsertSchema(watchlistItems).pick({
  userId: true, objectId: true, priority: true, notes: true, status: true, observationId: true
});
export const insertWatchlistWindowSchema = createInsertSchema(watchlistWindows).pick({
  watchlistItemId: true, locationId: true, windowDate: true, startTime: true, endTime: true,
  qualityScore: true, peakAltitude: true, transitTime: true, moonPhase: true, moonSeparation: true,
  moonInterference: true, durationMinutes: true, twilightSegment: true, astronomicalDusk: true, astronomicalDawn: true
});

// Types for watchlist
export type WatchlistItem = typeof watchlistItems.$inferSelect;
export type InsertWatchlistItem = z.infer<typeof insertWatchlistItemSchema>;
export type WatchlistWindow = typeof watchlistWindows.$inferSelect;
export type InsertWatchlistWindow = z.infer<typeof insertWatchlistWindowSchema>;

// Extended type with computed windows for API response
export interface WatchlistItemWithWindows extends WatchlistItem {
  object?: CelestialObject;
  windows?: WatchlistWindow[];
  nextWindow?: WatchlistWindow;
}

// === RECOMMENDATION TYPES ===

// Score breakdown for object recommendations
export interface RecommendationScore {
  objectId: number;
  catalogId: string;
  name: string;
  category: string;
  totalScore: number; // 0-100 overall recommendation score
  
  // Individual score components (0-100 each)
  visibilityScore: number;     // Based on altitude, darkness overlap
  moonScore: number;           // Based on moon separation & illumination
  conditionsScore: number;     // Based on logged tonight conditions
  equipmentScore: number;      // Based on user's equipment fit
  freshnessScore: number;      // Penalty if recently observed
  seasonalScore: number;       // Based on best months match
  
  // Visibility details
  maxAltitude: number;         // Highest altitude tonight
  transitTime: string | null;  // When object reaches max altitude
  darknessOverlapMinutes: number; // Minutes visible during astronomical darkness
  
  // Moon impact
  moonSeparation: number;      // Angular distance from moon
  moonInterference: 'none' | 'low' | 'moderate' | 'high';
  
  // Equipment recommendation
  recommendedMagnification: number | null;
  equipmentMatch: 'excellent' | 'good' | 'fair' | 'poor';
  
  // Observation history
  lastObserved: string | null; // ISO date of last observation
  observationCount: number;    // Total times observed
  
  // Rationale for UI display
  rationale: string[];         // Array of reasons why this is recommended
}

// Request params for recommendation endpoint
export interface RecommendationRequest {
  locationId?: number;
  limit?: number;
  categories?: string[];       // Filter by object category
  minScore?: number;           // Minimum total score threshold
  excludeObserved?: boolean;   // Exclude previously observed objects
}

// Photo bytes when photos are stored in Postgres (AstroPilot 2 default; see server/photoStore.ts).
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
export const photoBlobs = pgTable("photo_blobs", {
  path: varchar("path", { length: 300 }).primaryKey(), // "/objects/users/<uid>/<uuid>", as stored in observation_photos.image_url
  contentType: varchar("content_type", { length: 100 }).notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
