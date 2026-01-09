import {
  users,
  telescopes,
  eyepieces,
  barlows,
  filters,
  cameras,
  accessories,
  finders,
  opticalModifiers,
  locations,
  celestialObjects,
  observationSessions,
  observations,
  observationPhotos,
  objectSettings,
  nightConditions,
  badges,
  userBadges,
  userStats,
  messierProgress,
  watchlistItems,
  watchlistWindows,
  type User,
  type UpsertUser,
  type Telescope,
  type InsertTelescope,
  type Eyepiece,
  type InsertEyepiece,
  type Barlow,
  type InsertBarlow,
  type Filter,
  type InsertFilter,
  type Camera,
  type InsertCamera,
  type Accessory,
  type InsertAccessory,
  type Finder,
  type InsertFinder,
  type OpticalModifier,
  type InsertOpticalModifier,
  type Location,
  type InsertLocation,
  type CelestialObject,
  type InsertCelestialObject,
  type ObservationSession,
  type InsertObservationSession,
  type Observation,
  type InsertObservation,
  type ObservationPhoto,
  type InsertObservationPhoto,
  type ObjectSettings,
  type InsertObjectSettings,
  type NightConditions,
  type InsertNightConditions,
  type Badge,
  type UserBadge,
  type InsertUserBadge,
  type UserStats,
  type InsertUserStats,
  type MessierProgress,
  type InsertMessierProgress,
  type WatchlistItem,
  type InsertWatchlistItem,
  type WatchlistWindow,
  type InsertWatchlistWindow,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, like, sql, inArray, or, isNull } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createLocalUser(data: { email: string; passwordHash: string; firstName: string | null; lastName: string | null }): Promise<User>;
  createGoogleUser(data: { email: string | null; firstName: string | null; lastName: string | null; profileImageUrl: string | null; googleId: string }): Promise<User>;
  linkGoogleAccount(userId: string, googleId: string): Promise<void>;
  setFavoriteTelescope(userId: string, telescopeId: number | null): Promise<void>;
  setFavoriteLocation(userId: string, locationId: number | null): Promise<void>;
  getUserPreferences(userId: string): Promise<{ favoriteTelescopeId: number | null; favoriteLocationId: number | null }>;

  // Telescopes
  getTelescopes(userId: string): Promise<Telescope[]>;
  createTelescope(data: InsertTelescope): Promise<Telescope>;
  updateTelescope(id: number, userId: string, data: Partial<InsertTelescope>): Promise<Telescope>;
  deleteTelescope(id: number, userId: string): Promise<void>;
  countObservationsUsingTelescope(id: number): Promise<number>;
  nullifyTelescopeInObservations(id: number): Promise<void>;

  // Eyepieces
  getEyepieces(userId: string): Promise<Eyepiece[]>;
  createEyepiece(data: InsertEyepiece): Promise<Eyepiece>;
  updateEyepiece(id: number, userId: string, data: Partial<InsertEyepiece>): Promise<Eyepiece>;
  deleteEyepiece(id: number, userId: string): Promise<void>;
  countObservationsUsingEyepiece(id: number): Promise<number>;
  nullifyEyepieceInObservations(id: number): Promise<void>;

  // Barlows
  getBarlows(userId: string): Promise<Barlow[]>;
  createBarlow(data: InsertBarlow): Promise<Barlow>;
  updateBarlow(id: number, userId: string, data: Partial<InsertBarlow>): Promise<Barlow>;
  deleteBarlow(id: number, userId: string): Promise<void>;
  countObservationsUsingBarlow(id: number): Promise<number>;
  nullifyBarlowInObservations(id: number): Promise<void>;

  // Filters
  getFilters(userId: string): Promise<Filter[]>;
  createFilter(data: InsertFilter): Promise<Filter>;
  updateFilter(id: number, userId: string, data: Partial<InsertFilter>): Promise<Filter>;
  deleteFilter(id: number, userId: string): Promise<void>;
  countObservationsUsingFilter(id: number): Promise<number>;
  nullifyFilterInObservations(id: number): Promise<void>;

  // Cameras
  getCameras(userId: string): Promise<Camera[]>;
  createCamera(data: InsertCamera): Promise<Camera>;
  updateCamera(id: number, userId: string, data: Partial<InsertCamera>): Promise<Camera>;
  deleteCamera(id: number, userId: string): Promise<void>;
  countObservationsUsingCamera(id: number): Promise<number>;
  nullifyCameraInObservations(id: number): Promise<void>;

  // Accessories
  getAccessories(userId: string): Promise<Accessory[]>;
  createAccessory(data: InsertAccessory): Promise<Accessory>;
  updateAccessory(id: number, userId: string, data: Partial<InsertAccessory>): Promise<Accessory>;
  deleteAccessory(id: number, userId: string): Promise<void>;

  // Finders
  getFinders(userId: string): Promise<Finder[]>;
  createFinder(data: InsertFinder): Promise<Finder>;
  updateFinder(id: number, userId: string, data: Partial<InsertFinder>): Promise<Finder>;
  deleteFinder(id: number, userId: string): Promise<void>;
  countObservationsUsingFinder(id: number): Promise<number>;
  nullifyFinderInObservations(id: number): Promise<void>;

  // Optical Modifiers (Focal Reducers & Coma Correctors)
  getOpticalModifiers(userId: string): Promise<OpticalModifier[]>;
  createOpticalModifier(data: InsertOpticalModifier): Promise<OpticalModifier>;
  updateOpticalModifier(id: number, userId: string, data: Partial<InsertOpticalModifier>): Promise<OpticalModifier>;
  deleteOpticalModifier(id: number, userId: string): Promise<void>;
  countObservationsUsingOpticalModifier(id: number): Promise<number>;
  nullifyOpticalModifierInObservations(id: number): Promise<void>;

  // Locations
  getLocations(userId: string): Promise<Location[]>;
  createLocation(data: InsertLocation): Promise<Location>;
  deleteLocation(id: number, userId: string): Promise<void>;

  // Celestial Objects
  getObjects(): Promise<CelestialObject[]>;
  getObjectsForUser(userId: string): Promise<CelestialObject[]>; // catalog + user's custom objects
  getObject(id: number): Promise<CelestialObject | undefined>;
  createObject(data: InsertCelestialObject): Promise<CelestialObject>;
  deleteCustomObject(id: number, userId: string): Promise<void>;

  // Observation Sessions
  getSessions(userId: string): Promise<(ObservationSession & { location: Location | null; observations: (Observation & { object: CelestialObject })[] })[]>;
  getSession(id: number, userId: string): Promise<ObservationSession | undefined>;
  createSession(data: InsertObservationSession): Promise<ObservationSession>;
  deleteSession(id: number, userId: string): Promise<void>;

  // Observations
  createObservation(data: InsertObservation): Promise<Observation>;
  getObservations(sessionId: number): Promise<Observation[]>;
  getObservation(id: number): Promise<Observation | undefined>;
  getUserObservations(userId: string): Promise<(Observation & { object: CelestialObject })[]>;
  updateObservation(id: number, data: Partial<InsertObservation>): Promise<Observation>;
  deleteObservation(id: number, sessionId: number, userId: string): Promise<void>;

  // Observation Photos
  getObservationPhotos(observationId: number): Promise<ObservationPhoto[]>;
  getUserPhotosWithDetails(userId: string): Promise<(ObservationPhoto & { observation: Observation & { object: CelestialObject; session: ObservationSession } })[]>;
  createObservationPhoto(data: InsertObservationPhoto): Promise<ObservationPhoto>;
  deleteObservationPhoto(id: number): Promise<void>;

  // Object Settings
  getObjectSettings(userId: string, objectId: number): Promise<ObjectSettings | undefined>;
  upsertObjectSettings(data: InsertObjectSettings): Promise<ObjectSettings>;

  // Night Conditions
  getTonightConditions(userId: string, date: Date, locationId?: number): Promise<NightConditions | undefined>;
  upsertNightConditions(data: InsertNightConditions): Promise<NightConditions>;
  deleteNightConditions(id: number, userId: string): Promise<void>;

  // Gamification - Badges
  getAllBadges(): Promise<Badge[]>;
  getUserBadges(userId: string): Promise<(UserBadge & { badge: Badge })[]>;
  awardBadge(data: InsertUserBadge): Promise<UserBadge>;
  checkUserHasBadge(userId: string, badgeId: number): Promise<boolean>;

  // Gamification - User Stats
  getUserStats(userId: string): Promise<UserStats | undefined>;
  upsertUserStats(data: InsertUserStats): Promise<UserStats>;
  incrementUserStat(userId: string, stat: keyof UserStats, amount?: number): Promise<UserStats>;

  // Gamification - Messier Progress
  getMessierProgress(userId: string): Promise<(MessierProgress & { object: CelestialObject })[]>;
  trackMessierObservation(userId: string, objectId: number, sessionId: number): Promise<MessierProgress>;
  getMessierCompletionCount(userId: string): Promise<number>;

  // Reset/Recalculate
  recalculateUserStats(userId: string): Promise<UserStats>;
  recalculateMessierProgress(userId: string): Promise<void>;

  // Watchlist
  getWatchlistItems(userId: string, status?: 'planned' | 'observed' | 'dismissed'): Promise<(WatchlistItem & { object: CelestialObject; windows?: WatchlistWindow[] })[]>;
  getWatchlistItem(id: number, userId: string): Promise<WatchlistItem | undefined>;
  createWatchlistItem(data: InsertWatchlistItem): Promise<WatchlistItem>;
  updateWatchlistItem(id: number, userId: string, data: Partial<InsertWatchlistItem>): Promise<WatchlistItem>;
  deleteWatchlistItem(id: number, userId: string): Promise<void>;
  isObjectInWatchlist(userId: string, objectId: number): Promise<boolean>;
  
  // Watchlist Windows
  getWatchlistWindows(watchlistItemId: number): Promise<WatchlistWindow[]>;
  deleteWatchlistWindowsForItem(watchlistItemId: number): Promise<void>;
  createWatchlistWindows(windows: InsertWatchlistWindow[]): Promise<WatchlistWindow[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async createLocalUser(data: { email: string; passwordHash: string; firstName: string | null; lastName: string | null }): Promise<User> {
    const [user] = await db.insert(users).values({
      email: data.email,
      passwordHash: data.passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      authProvider: 'local',
    }).returning();
    return user;
  }

  async createGoogleUser(data: { email: string | null; firstName: string | null; lastName: string | null; profileImageUrl: string | null; googleId: string }): Promise<User> {
    const [user] = await db.insert(users).values({
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      profileImageUrl: data.profileImageUrl,
      googleId: data.googleId,
      authProvider: 'google',
    }).returning();
    return user;
  }

  async linkGoogleAccount(userId: string, googleId: string): Promise<void> {
    await db.update(users).set({ googleId, authProvider: 'google' }).where(eq(users.id, userId));
  }

  async setFavoriteTelescope(userId: string, telescopeId: number | null): Promise<void> {
    await db.update(users).set({ favoriteTelescopeId: telescopeId }).where(eq(users.id, userId));
  }

  async setFavoriteLocation(userId: string, locationId: number | null): Promise<void> {
    await db.update(users).set({ favoriteLocationId: locationId }).where(eq(users.id, userId));
  }

  async getUserPreferences(userId: string): Promise<{ favoriteTelescopeId: number | null; favoriteLocationId: number | null }> {
    const [user] = await db.select({ 
      favoriteTelescopeId: users.favoriteTelescopeId, 
      favoriteLocationId: users.favoriteLocationId 
    }).from(users).where(eq(users.id, userId));
    return {
      favoriteTelescopeId: user?.favoriteTelescopeId ?? null,
      favoriteLocationId: user?.favoriteLocationId ?? null,
    };
  }

  // Telescopes
  async getTelescopes(userId: string): Promise<Telescope[]> {
    return db.select().from(telescopes).where(eq(telescopes.userId, userId)).orderBy(desc(telescopes.createdAt));
  }

  async createTelescope(data: InsertTelescope): Promise<Telescope> {
    const [telescope] = await db.insert(telescopes).values(data).returning();
    return telescope;
  }

  async deleteTelescope(id: number, userId: string): Promise<void> {
    await db.delete(telescopes).where(and(eq(telescopes.id, id), eq(telescopes.userId, userId)));
  }

  async updateTelescope(id: number, userId: string, data: Partial<InsertTelescope>): Promise<Telescope> {
    const [telescope] = await db.update(telescopes).set(data).where(and(eq(telescopes.id, id), eq(telescopes.userId, userId))).returning();
    return telescope;
  }

  async countObservationsUsingTelescope(id: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(observations).where(eq(observations.telescopeId, id));
    return Number(result[0]?.count || 0);
  }

  async nullifyTelescopeInObservations(id: number): Promise<void> {
    await db.update(observations).set({ telescopeId: null }).where(eq(observations.telescopeId, id));
  }

  // Eyepieces
  async getEyepieces(userId: string): Promise<Eyepiece[]> {
    return db.select().from(eyepieces).where(eq(eyepieces.userId, userId)).orderBy(desc(eyepieces.createdAt));
  }

  async createEyepiece(data: InsertEyepiece): Promise<Eyepiece> {
    const [eyepiece] = await db.insert(eyepieces).values(data).returning();
    return eyepiece;
  }

  async deleteEyepiece(id: number, userId: string): Promise<void> {
    await db.delete(eyepieces).where(and(eq(eyepieces.id, id), eq(eyepieces.userId, userId)));
  }

  async updateEyepiece(id: number, userId: string, data: Partial<InsertEyepiece>): Promise<Eyepiece> {
    const [eyepiece] = await db.update(eyepieces).set(data).where(and(eq(eyepieces.id, id), eq(eyepieces.userId, userId))).returning();
    return eyepiece;
  }

  async countObservationsUsingEyepiece(id: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(observations).where(eq(observations.eyepieceId, id));
    return Number(result[0]?.count || 0);
  }

  async nullifyEyepieceInObservations(id: number): Promise<void> {
    await db.update(observations).set({ eyepieceId: null }).where(eq(observations.eyepieceId, id));
  }

  // Barlows
  async getBarlows(userId: string): Promise<Barlow[]> {
    return db.select().from(barlows).where(eq(barlows.userId, userId)).orderBy(desc(barlows.createdAt));
  }

  async createBarlow(data: InsertBarlow): Promise<Barlow> {
    const [barlow] = await db.insert(barlows).values(data).returning();
    return barlow;
  }

  async deleteBarlow(id: number, userId: string): Promise<void> {
    await db.delete(barlows).where(and(eq(barlows.id, id), eq(barlows.userId, userId)));
  }

  async updateBarlow(id: number, userId: string, data: Partial<InsertBarlow>): Promise<Barlow> {
    const [barlow] = await db.update(barlows).set(data).where(and(eq(barlows.id, id), eq(barlows.userId, userId))).returning();
    return barlow;
  }

  async countObservationsUsingBarlow(id: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(observations).where(eq(observations.barlowId, id));
    return Number(result[0]?.count || 0);
  }

  async nullifyBarlowInObservations(id: number): Promise<void> {
    await db.update(observations).set({ barlowId: null }).where(eq(observations.barlowId, id));
  }

  // Filters
  async getFilters(userId: string): Promise<Filter[]> {
    return db.select().from(filters).where(eq(filters.userId, userId)).orderBy(desc(filters.createdAt));
  }

  async createFilter(data: InsertFilter): Promise<Filter> {
    const [filter] = await db.insert(filters).values(data).returning();
    return filter;
  }

  async deleteFilter(id: number, userId: string): Promise<void> {
    await db.delete(filters).where(and(eq(filters.id, id), eq(filters.userId, userId)));
  }

  async updateFilter(id: number, userId: string, data: Partial<InsertFilter>): Promise<Filter> {
    const [filter] = await db.update(filters).set(data).where(and(eq(filters.id, id), eq(filters.userId, userId))).returning();
    return filter;
  }

  async countObservationsUsingFilter(id: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(observations).where(eq(observations.filterId, id));
    return Number(result[0]?.count || 0);
  }

  async nullifyFilterInObservations(id: number): Promise<void> {
    await db.update(observations).set({ filterId: null }).where(eq(observations.filterId, id));
  }

  // Cameras
  async getCameras(userId: string): Promise<Camera[]> {
    return db.select().from(cameras).where(eq(cameras.userId, userId)).orderBy(desc(cameras.createdAt));
  }

  async createCamera(data: InsertCamera): Promise<Camera> {
    const [camera] = await db.insert(cameras).values(data).returning();
    return camera;
  }

  async deleteCamera(id: number, userId: string): Promise<void> {
    await db.delete(cameras).where(and(eq(cameras.id, id), eq(cameras.userId, userId)));
  }

  async updateCamera(id: number, userId: string, data: Partial<InsertCamera>): Promise<Camera> {
    const [camera] = await db.update(cameras).set(data).where(and(eq(cameras.id, id), eq(cameras.userId, userId))).returning();
    return camera;
  }

  async countObservationsUsingCamera(id: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(observations).where(eq(observations.cameraId, id));
    return Number(result[0]?.count || 0);
  }

  async nullifyCameraInObservations(id: number): Promise<void> {
    await db.update(observations).set({ cameraId: null }).where(eq(observations.cameraId, id));
  }

  // Accessories
  async getAccessories(userId: string): Promise<Accessory[]> {
    return db.select().from(accessories).where(eq(accessories.userId, userId)).orderBy(desc(accessories.createdAt));
  }

  async createAccessory(data: InsertAccessory): Promise<Accessory> {
    const [accessory] = await db.insert(accessories).values(data).returning();
    return accessory;
  }

  async deleteAccessory(id: number, userId: string): Promise<void> {
    await db.delete(accessories).where(and(eq(accessories.id, id), eq(accessories.userId, userId)));
  }

  async updateAccessory(id: number, userId: string, data: Partial<InsertAccessory>): Promise<Accessory> {
    const [accessory] = await db.update(accessories).set(data).where(and(eq(accessories.id, id), eq(accessories.userId, userId))).returning();
    return accessory;
  }

  // Finders
  async getFinders(userId: string): Promise<Finder[]> {
    return db.select().from(finders).where(eq(finders.userId, userId)).orderBy(desc(finders.createdAt));
  }

  async createFinder(data: InsertFinder): Promise<Finder> {
    const [finder] = await db.insert(finders).values(data).returning();
    return finder;
  }

  async deleteFinder(id: number, userId: string): Promise<void> {
    await db.delete(finders).where(and(eq(finders.id, id), eq(finders.userId, userId)));
  }

  async updateFinder(id: number, userId: string, data: Partial<InsertFinder>): Promise<Finder> {
    const [finder] = await db.update(finders).set(data).where(and(eq(finders.id, id), eq(finders.userId, userId))).returning();
    return finder;
  }

  async countObservationsUsingFinder(id: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(observations).where(eq(observations.finderId, id));
    return Number(result[0]?.count || 0);
  }

  async nullifyFinderInObservations(id: number): Promise<void> {
    await db.update(observations).set({ finderId: null }).where(eq(observations.finderId, id));
  }

  // Optical Modifiers (Focal Reducers & Coma Correctors)
  async getOpticalModifiers(userId: string): Promise<OpticalModifier[]> {
    return db.select().from(opticalModifiers).where(eq(opticalModifiers.userId, userId)).orderBy(desc(opticalModifiers.createdAt));
  }

  async createOpticalModifier(data: InsertOpticalModifier): Promise<OpticalModifier> {
    const [modifier] = await db.insert(opticalModifiers).values(data).returning();
    return modifier;
  }

  async deleteOpticalModifier(id: number, userId: string): Promise<void> {
    await db.delete(opticalModifiers).where(and(eq(opticalModifiers.id, id), eq(opticalModifiers.userId, userId)));
  }

  async updateOpticalModifier(id: number, userId: string, data: Partial<InsertOpticalModifier>): Promise<OpticalModifier> {
    const [modifier] = await db.update(opticalModifiers).set(data).where(and(eq(opticalModifiers.id, id), eq(opticalModifiers.userId, userId))).returning();
    return modifier;
  }

  async countObservationsUsingOpticalModifier(id: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(observations).where(eq(observations.opticalModifierId, id));
    return Number(result[0]?.count || 0);
  }

  async nullifyOpticalModifierInObservations(id: number): Promise<void> {
    await db.update(observations).set({ opticalModifierId: null }).where(eq(observations.opticalModifierId, id));
  }

  // Locations
  async getLocations(userId: string): Promise<Location[]> {
    return db.select().from(locations).where(eq(locations.userId, userId)).orderBy(desc(locations.createdAt));
  }

  async createLocation(data: InsertLocation): Promise<Location> {
    const [location] = await db.insert(locations).values(data).returning();
    return location;
  }

  async updateLocation(id: number, userId: string, data: Partial<InsertLocation>): Promise<Location> {
    const [location] = await db.update(locations).set(data).where(and(eq(locations.id, id), eq(locations.userId, userId))).returning();
    return location;
  }

  async deleteLocation(id: number, userId: string): Promise<void> {
    await db.delete(locations).where(and(eq(locations.id, id), eq(locations.userId, userId)));
  }

  // Celestial Objects
  async getObjects(): Promise<CelestialObject[]> {
    return db.select().from(celestialObjects).orderBy(celestialObjects.catalogId);
  }

  async getObject(id: number): Promise<CelestialObject | undefined> {
    const [object] = await db.select().from(celestialObjects).where(eq(celestialObjects.id, id));
    return object;
  }

  async createObject(data: InsertCelestialObject): Promise<CelestialObject> {
    const [object] = await db.insert(celestialObjects).values(data).returning();
    return object;
  }

  async getObjectsForUser(userId: string): Promise<CelestialObject[]> {
    // Return catalog objects (userId is null) + user's custom objects
    return db.select().from(celestialObjects)
      .where(or(isNull(celestialObjects.userId), eq(celestialObjects.userId, userId)))
      .orderBy(celestialObjects.catalogId);
  }

  async deleteCustomObject(id: number, userId: string): Promise<void> {
    // Only allow deleting custom objects that belong to the user
    await db.delete(celestialObjects).where(
      and(eq(celestialObjects.id, id), eq(celestialObjects.userId, userId))
    );
  }

  // Observation Sessions
  async getSessions(userId: string): Promise<(ObservationSession & { location: Location | null; observations: (Observation & { object: CelestialObject })[] })[]> {
    const sessionsData = await db
      .select()
      .from(observationSessions)
      .leftJoin(locations, eq(observationSessions.locationId, locations.id))
      .where(eq(observationSessions.userId, userId))
      .orderBy(desc(observationSessions.date));

    const result = [];
    for (const row of sessionsData) {
      const sessionObservations = await db
        .select()
        .from(observations)
        .leftJoin(celestialObjects, eq(observations.objectId, celestialObjects.id))
        .where(eq(observations.sessionId, row.observation_sessions.id));

      result.push({
        ...row.observation_sessions,
        location: row.locations,
        observations: sessionObservations.map((o) => ({
          ...o.observations,
          object: o.celestial_objects!,
        })),
      });
    }

    return result;
  }

  async getSession(id: number, userId: string): Promise<ObservationSession | undefined> {
    const [session] = await db
      .select()
      .from(observationSessions)
      .where(and(eq(observationSessions.id, id), eq(observationSessions.userId, userId)));
    return session;
  }

  async createSession(data: InsertObservationSession): Promise<ObservationSession> {
    const [session] = await db.insert(observationSessions).values(data).returning();
    return session;
  }

  async deleteSession(id: number, userId: string): Promise<void> {
    // First verify the session belongs to the user
    const session = await this.getSession(id, userId);
    if (!session) {
      throw new Error("Session not found or access denied");
    }
    
    // Get all observations for this session
    const sessionObservations = await db
      .select({ id: observations.id })
      .from(observations)
      .where(eq(observations.sessionId, id));
    
    // Delete photos for all observations in this session
    for (const obs of sessionObservations) {
      await db.delete(observationPhotos).where(eq(observationPhotos.observationId, obs.id));
    }
    
    // Delete all observations for this session
    await db.delete(observations).where(eq(observations.sessionId, id));
    
    // Clear any bestSessionId references in messierProgress that point to this session
    await db
      .update(messierProgress)
      .set({ bestSessionId: null })
      .where(eq(messierProgress.bestSessionId, id));
    
    // Delete the session itself
    await db.delete(observationSessions).where(eq(observationSessions.id, id));
  }

  // Observations
  async createObservation(data: InsertObservation): Promise<Observation> {
    const [observation] = await db.insert(observations).values(data).returning();
    return observation;
  }

  async getObservations(sessionId: number): Promise<Observation[]> {
    return db.select().from(observations).where(eq(observations.sessionId, sessionId));
  }

  async getObservation(id: number): Promise<Observation | undefined> {
    const [observation] = await db.select().from(observations).where(eq(observations.id, id));
    return observation;
  }

  async getUserObservations(userId: string): Promise<(Observation & { object: CelestialObject })[]> {
    // Get all sessions for user, then all observations with their objects
    const userSessions = await db
      .select({ id: observationSessions.id })
      .from(observationSessions)
      .where(eq(observationSessions.userId, userId));
    
    const sessionIds = userSessions.map(s => s.id);
    if (sessionIds.length === 0) return [];
    
    const results = await db
      .select()
      .from(observations)
      .innerJoin(celestialObjects, eq(observations.objectId, celestialObjects.id))
      .where(inArray(observations.sessionId, sessionIds));
    
    return results.map(r => ({
      ...r.observations,
      object: r.celestial_objects,
    }));
  }

  async updateObservation(id: number, data: Partial<InsertObservation>): Promise<Observation> {
    const [observation] = await db
      .update(observations)
      .set(data)
      .where(eq(observations.id, id))
      .returning();
    return observation;
  }

  async deleteObservation(id: number, sessionId: number, userId: string): Promise<void> {
    // First verify the session belongs to the user
    const session = await this.getSession(sessionId, userId);
    if (!session) {
      throw new Error("Session not found or access denied");
    }
    // Delete related photos first (they cascade, but let's be explicit)
    await db.delete(observationPhotos).where(eq(observationPhotos.observationId, id));
    // Delete the observation
    await db.delete(observations).where(and(eq(observations.id, id), eq(observations.sessionId, sessionId)));
  }

  // Observation Photos
  async getObservationPhotos(observationId: number): Promise<ObservationPhoto[]> {
    return db
      .select()
      .from(observationPhotos)
      .where(eq(observationPhotos.observationId, observationId))
      .orderBy(desc(observationPhotos.createdAt));
  }

  async createObservationPhoto(data: InsertObservationPhoto): Promise<ObservationPhoto> {
    const [photo] = await db.insert(observationPhotos).values(data).returning();
    return photo;
  }

  async deleteObservationPhoto(id: number): Promise<void> {
    await db.delete(observationPhotos).where(eq(observationPhotos.id, id));
  }

  async getUserPhotosWithDetails(userId: string): Promise<(ObservationPhoto & { observation: Observation & { object: CelestialObject; session: ObservationSession } })[]> {
    // Get all sessions for user
    const userSessions = await db
      .select()
      .from(observationSessions)
      .where(eq(observationSessions.userId, userId));
    
    if (userSessions.length === 0) return [];
    
    const sessionIds = userSessions.map(s => s.id);
    const sessionMap = new Map(userSessions.map(s => [s.id, s]));
    
    // Get all observations for those sessions
    const userObservations = await db
      .select({
        observation: observations,
        object: celestialObjects,
      })
      .from(observations)
      .innerJoin(celestialObjects, eq(observations.objectId, celestialObjects.id))
      .where(inArray(observations.sessionId, sessionIds));
    
    if (userObservations.length === 0) return [];
    
    const observationIds = userObservations.map(o => o.observation.id);
    const observationMap = new Map(userObservations.map(o => [o.observation.id, { ...o.observation, object: o.object }]));
    
    // Get all photos for those observations
    const photos = await db
      .select()
      .from(observationPhotos)
      .where(inArray(observationPhotos.observationId, observationIds))
      .orderBy(desc(observationPhotos.createdAt));
    
    // Combine the data
    return photos.map(photo => {
      const obs = observationMap.get(photo.observationId)!;
      const session = sessionMap.get(obs.sessionId)!;
      return {
        ...photo,
        observation: {
          ...obs,
          session,
        },
      };
    });
  }

  // Object Settings
  async getObjectSettings(userId: string, objectId: number): Promise<ObjectSettings | undefined> {
    const [settings] = await db
      .select()
      .from(objectSettings)
      .where(and(eq(objectSettings.userId, userId), eq(objectSettings.objectId, objectId)));
    return settings;
  }

  async upsertObjectSettings(data: InsertObjectSettings): Promise<ObjectSettings> {
    const [settings] = await db
      .insert(objectSettings)
      .values(data)
      .onConflictDoUpdate({
        target: [objectSettings.userId, objectSettings.objectId],
        set: data,
      })
      .returning();
    return settings;
  }

  // Night Conditions
  async getTonightConditions(userId: string, date: Date, _locationId?: number): Promise<NightConditions | undefined> {
    // Get conditions for the same observing night (within 24 hours)
    // Note: One set of conditions per user per night (locationId is just metadata, not a filter)
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const conditions = await db
      .select()
      .from(nightConditions)
      .where(eq(nightConditions.userId, userId))
      .orderBy(desc(nightConditions.updatedAt));

    // Find conditions from today
    return conditions.find((c) => {
      const condDate = new Date(c.observingDate);
      return condDate >= startOfDay && condDate <= endOfDay;
    });
  }

  async upsertNightConditions(data: InsertNightConditions): Promise<NightConditions> {
    // Check if conditions exist for this user today (one set per night)
    const existing = await this.getTonightConditions(
      data.userId,
      data.observingDate
    );

    if (existing) {
      // Update existing record
      const [updated] = await db
        .update(nightConditions)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(nightConditions.id, existing.id))
        .returning();
      return updated;
    }

    // Create new record
    const [created] = await db.insert(nightConditions).values(data).returning();
    return created;
  }

  async deleteNightConditions(id: number, userId: string): Promise<void> {
    await db
      .delete(nightConditions)
      .where(and(eq(nightConditions.id, id), eq(nightConditions.userId, userId)));
  }

  // Gamification - Badges
  async getAllBadges(): Promise<Badge[]> {
    return db.select().from(badges).orderBy(badges.tier, badges.points);
  }

  async getUserBadges(userId: string): Promise<(UserBadge & { badge: Badge })[]> {
    const results = await db
      .select()
      .from(userBadges)
      .innerJoin(badges, eq(userBadges.badgeId, badges.id))
      .where(eq(userBadges.userId, userId))
      .orderBy(desc(userBadges.earnedAt));
    
    return results.map((r) => ({
      ...r.user_badges,
      badge: r.badges,
    }));
  }

  async awardBadge(data: InsertUserBadge): Promise<UserBadge> {
    const [badge] = await db.insert(userBadges).values(data).returning();
    return badge;
  }

  async checkUserHasBadge(userId: string, badgeId: number): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(userBadges)
      .where(and(eq(userBadges.userId, userId), eq(userBadges.badgeId, badgeId)));
    return !!existing;
  }

  // Gamification - User Stats
  async getUserStats(userId: string): Promise<UserStats | undefined> {
    const [stats] = await db
      .select()
      .from(userStats)
      .where(eq(userStats.userId, userId));
    return stats;
  }

  async upsertUserStats(data: InsertUserStats): Promise<UserStats> {
    const [stats] = await db
      .insert(userStats)
      .values(data)
      .onConflictDoUpdate({
        target: userStats.userId,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return stats;
  }

  async incrementUserStat(userId: string, stat: keyof UserStats, amount: number = 1): Promise<UserStats> {
    // First ensure user stats exist
    let currentStats = await this.getUserStats(userId);
    if (!currentStats) {
      currentStats = await this.upsertUserStats({ userId });
    }

    // Type-safe increment for integer fields
    const integerFields = [
      'totalObservations', 'totalSessions', 'totalPhotos',
      'messierObjectsObserved', 'ngcObjectsObserved', 'planetsObserved',
      'nebulaeObserved', 'galaxiesObserved', 'clustersObserved',
      'doubleStarsObserved', 'currentStreak', 'longestStreak', 'totalPoints',
      'conjunctionsObserved', 'oppositionsObserved', 'meteorShowersObserved',
      'eclipsesObserved', 'rareEventsObserved'
    ];

    if (integerFields.includes(stat as string)) {
      const currentValue = (currentStats[stat] as number) || 0;
      const updateData = { [stat]: currentValue + amount, updatedAt: new Date() };
      
      const [updated] = await db
        .update(userStats)
        .set(updateData)
        .where(eq(userStats.userId, userId))
        .returning();
      return updated;
    }

    return currentStats;
  }

  // Gamification - Messier Progress
  async getMessierProgress(userId: string): Promise<(MessierProgress & { object: CelestialObject })[]> {
    const results = await db
      .select()
      .from(messierProgress)
      .innerJoin(celestialObjects, eq(messierProgress.objectId, celestialObjects.id))
      .where(eq(messierProgress.userId, userId))
      .orderBy(messierProgress.firstObservedAt);

    return results.map((r) => ({
      ...r.messier_progress,
      object: r.celestial_objects,
    }));
  }

  async trackMessierObservation(userId: string, objectId: number, sessionId: number): Promise<MessierProgress> {
    // Check if this object is a Messier object
    const [object] = await db
      .select()
      .from(celestialObjects)
      .where(eq(celestialObjects.id, objectId));

    if (!object || !object.catalogId.startsWith('M')) {
      throw new Error('Not a Messier object');
    }

    // Check if already tracked
    const [existing] = await db
      .select()
      .from(messierProgress)
      .where(and(eq(messierProgress.userId, userId), eq(messierProgress.objectId, objectId)));

    if (existing) {
      // Increment observation count
      const [updated] = await db
        .update(messierProgress)
        .set({
          observationCount: (existing.observationCount || 1) + 1,
          bestSessionId: sessionId,
        })
        .where(eq(messierProgress.id, existing.id))
        .returning();
      return updated;
    }

    // Create new progress record
    const [progress] = await db
      .insert(messierProgress)
      .values({
        userId,
        objectId,
        bestSessionId: sessionId,
        observationCount: 1,
      })
      .returning();

    // Increment messier count in user stats
    await this.incrementUserStat(userId, 'messierObjectsObserved', 1);

    return progress;
  }

  async getMessierCompletionCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(messierProgress)
      .innerJoin(celestialObjects, eq(messierProgress.objectId, celestialObjects.id))
      .where(and(
        eq(messierProgress.userId, userId),
        like(celestialObjects.catalogId, 'M%')
      ));
    
    return Number(result[0]?.count) || 0;
  }

  // Reset and recalculate all user stats from observation history
  async recalculateUserStats(userId: string): Promise<UserStats> {
    // Get all user observations with their objects
    const userObs = await this.getUserObservations(userId);
    
    // Count observations by category
    let totalObservations = userObs.length;
    let totalPhotos = 0;
    let planetsObserved = 0;
    let galaxiesObserved = 0;
    let nebulaeObserved = 0;
    let clustersObserved = 0;
    let doubleStarsObserved = 0;
    let messierObjectsObserved = 0;
    let ngcObjectsObserved = 0;
    
    // Track unique objects for category counts
    const observedPlanets = new Set<number>();
    const observedGalaxies = new Set<number>();
    const observedNebulae = new Set<number>();
    const observedClusters = new Set<number>();
    const observedDoubleStars = new Set<number>();
    const observedMessier = new Set<number>();
    const observedNGC = new Set<number>();
    
    for (const obs of userObs) {
      if (obs.imagingDone) totalPhotos++;
      
      const obj = obs.object;
      if (!obj) continue;
      
      // Track unique objects by category
      switch (obj.category) {
        case 'planet':
          observedPlanets.add(obj.id);
          break;
        case 'galaxy':
          observedGalaxies.add(obj.id);
          break;
        case 'nebula':
        case 'planetary_nebula':
        case 'reflection_nebula':
        case 'dark_nebula':
        case 'supernova_remnant':
          observedNebulae.add(obj.id);
          break;
        case 'globular_cluster':
        case 'open_cluster':
          observedClusters.add(obj.id);
          break;
        case 'double_star':
          observedDoubleStars.add(obj.id);
          break;
      }
      
      // Track Messier and NGC
      if (obj.catalogId.startsWith('M') && /^M\d+$/.test(obj.catalogId)) {
        observedMessier.add(obj.id);
      }
      if (obj.catalogId.startsWith('NGC')) {
        observedNGC.add(obj.id);
      }
    }
    
    planetsObserved = observedPlanets.size;
    galaxiesObserved = observedGalaxies.size;
    nebulaeObserved = observedNebulae.size;
    clustersObserved = observedClusters.size;
    doubleStarsObserved = observedDoubleStars.size;
    messierObjectsObserved = observedMessier.size;
    ngcObjectsObserved = observedNGC.size;
    
    // Count total sessions
    const sessionResults = await db
      .select({ count: sql<number>`count(*)` })
      .from(observationSessions)
      .where(eq(observationSessions.userId, userId));
    const totalSessions = Number(sessionResults[0]?.count) || 0;
    
    // Get existing stats to preserve points and streaks (earned legitimately)
    let existingStats = await this.getUserStats(userId);
    
    // Create stats if they don't exist
    if (!existingStats) {
      existingStats = await this.upsertUserStats({ userId });
    }
    
    // Update stats with recalculated values
    const [updated] = await db
      .update(userStats)
      .set({
        totalObservations,
        totalSessions,
        totalPhotos,
        planetsObserved,
        galaxiesObserved,
        nebulaeObserved,
        clustersObserved,
        doubleStarsObserved,
        messierObjectsObserved,
        ngcObjectsObserved,
        // Preserve earned values
        totalPoints: existingStats.totalPoints || 0,
        currentStreak: existingStats.currentStreak || 0,
        longestStreak: existingStats.longestStreak || 0,
        conjunctionsObserved: existingStats.conjunctionsObserved || 0,
        oppositionsObserved: existingStats.oppositionsObserved || 0,
        meteorShowersObserved: existingStats.meteorShowersObserved || 0,
        eclipsesObserved: existingStats.eclipsesObserved || 0,
        rareEventsObserved: existingStats.rareEventsObserved || 0,
        updatedAt: new Date(),
      })
      .where(eq(userStats.userId, userId))
      .returning();
    
    return updated;
  }

  // Recalculate Messier progress from actual observations
  async recalculateMessierProgress(userId: string): Promise<void> {
    // Get all Messier objects
    const messierObjects = await db
      .select()
      .from(celestialObjects)
      .where(like(celestialObjects.catalogId, 'M%'));
    
    const messierIds = messierObjects
      .filter(obj => /^M\d+$/.test(obj.catalogId))
      .map(obj => obj.id);
    
    // Get all user observations of Messier objects
    const userObs = await this.getUserObservations(userId);
    const messierObs = userObs.filter(obs => messierIds.includes(obs.objectId));
    
    // Group observations by object
    const obsMap = new Map<number, { count: number; latestSessionId: number | null }>();
    for (const obs of messierObs) {
      const existing = obsMap.get(obs.objectId);
      if (existing) {
        existing.count++;
        existing.latestSessionId = obs.sessionId;
      } else {
        obsMap.set(obs.objectId, { count: 1, latestSessionId: obs.sessionId });
      }
    }
    
    // Delete current Messier progress for this user
    await db.delete(messierProgress).where(eq(messierProgress.userId, userId));
    
    // Recreate progress based on actual observations
    for (const [objectId, data] of obsMap) {
      await db.insert(messierProgress).values({
        userId,
        objectId,
        observationCount: data.count,
        bestSessionId: data.latestSessionId,
      });
    }
  }

  // Watchlist operations
  async getWatchlistItems(userId: string, status?: 'planned' | 'observed' | 'dismissed'): Promise<(WatchlistItem & { object: CelestialObject; windows?: WatchlistWindow[] })[]> {
    const conditions = [eq(watchlistItems.userId, userId)];
    if (status) {
      conditions.push(eq(watchlistItems.status, status));
    }
    
    const items = await db
      .select()
      .from(watchlistItems)
      .innerJoin(celestialObjects, eq(watchlistItems.objectId, celestialObjects.id))
      .where(and(...conditions))
      .orderBy(desc(watchlistItems.createdAt));
    
    // Fetch windows for each item
    const itemsWithWindows = await Promise.all(
      items.map(async (row) => {
        const windows = await this.getWatchlistWindows(row.watchlist_items.id);
        return {
          ...row.watchlist_items,
          object: row.celestial_objects,
          windows,
        };
      })
    );
    
    return itemsWithWindows;
  }

  async getWatchlistItem(id: number, userId: string): Promise<WatchlistItem | undefined> {
    const [item] = await db
      .select()
      .from(watchlistItems)
      .where(and(eq(watchlistItems.id, id), eq(watchlistItems.userId, userId)));
    return item;
  }

  async createWatchlistItem(data: InsertWatchlistItem): Promise<WatchlistItem> {
    const [item] = await db.insert(watchlistItems).values(data).returning();
    return item;
  }

  async updateWatchlistItem(id: number, userId: string, data: Partial<InsertWatchlistItem>): Promise<WatchlistItem> {
    const [item] = await db
      .update(watchlistItems)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(watchlistItems.id, id), eq(watchlistItems.userId, userId)))
      .returning();
    return item;
  }

  async deleteWatchlistItem(id: number, userId: string): Promise<void> {
    await db
      .delete(watchlistItems)
      .where(and(eq(watchlistItems.id, id), eq(watchlistItems.userId, userId)));
  }

  async isObjectInWatchlist(userId: string, objectId: number): Promise<boolean> {
    const [item] = await db
      .select()
      .from(watchlistItems)
      .where(and(
        eq(watchlistItems.userId, userId),
        eq(watchlistItems.objectId, objectId),
        eq(watchlistItems.status, 'planned')
      ));
    return !!item;
  }

  // Watchlist Windows
  async getWatchlistWindows(watchlistItemId: number): Promise<WatchlistWindow[]> {
    return db
      .select()
      .from(watchlistWindows)
      .where(eq(watchlistWindows.watchlistItemId, watchlistItemId))
      .orderBy(watchlistWindows.windowDate);
  }

  async deleteWatchlistWindowsForItem(watchlistItemId: number): Promise<void> {
    await db.delete(watchlistWindows).where(eq(watchlistWindows.watchlistItemId, watchlistItemId));
  }

  async createWatchlistWindows(windows: InsertWatchlistWindow[]): Promise<WatchlistWindow[]> {
    if (windows.length === 0) return [];
    return db.insert(watchlistWindows).values(windows).returning();
  }
}

export const storage = new DatabaseStorage();
