import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, Request } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "./db";
import { users, type User } from "@shared/schema";
import { ah, parse, rateLimit, HttpError } from "./http";
import { isProd, sessionSecret } from "./env";

const SALT_ROUNDS = 12;

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export interface PublicUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  authProvider: string | null;
  hasPassword: boolean;
  preferences: Record<string, unknown>;
  createdAt: string | null;
}

export function publicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    profileImageUrl: u.profileImageUrl,
    authProvider: u.authProvider,
    hasPassword: Boolean(u.passwordHash),
    preferences: (u.preferences as Record<string, unknown>) ?? {},
    createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
  };
}

export async function getUser(id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u;
}

async function getUserByEmail(email: string) {
  const [u] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (u) return u;
  // Legacy accounts may have mixed-case emails.
  const { rows } = await pool.query(`SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`, [email.trim()]);
  return rows[0] ? getUser(rows[0].id) : undefined;
}

/**
 * Delete a user's stored login sessions (all devices), optionally keeping one (the caller's).
 * Sessions written by this app store `passport.user = { id }`; older ones may hold the bare id.
 */
export async function destroyUserSessions(uid: string, keepSid?: string) {
  await pool.query(
    `DELETE FROM sessions
      WHERE (sess->'passport'->'user'->>'id' = $1 OR sess->'passport'->>'user' = $1)
        AND sid IS DISTINCT FROM $2`,
    [uid, keepSid ?? null],
  );
}

export function sessionMiddleware() {
  const ttl = 30 * 24 * 60 * 60 * 1000; // 30 days: observers come back weekly
  const PgStore = connectPg(session);
  return session({
    secret: sessionSecret,
    store: new PgStore({ pool, createTableIfMissing: false, ttl: ttl / 1000, tableName: "sessions" }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, secure: isProd, sameSite: "lax", maxAge: ttl },
  });
}

function login(req: Request, user: User): Promise<void> {
  return new Promise((resolve, reject) => {
    req.login(user, (err) => {
      if (err) return reject(err);
      req.session.save((e) => (e ? reject(e) : resolve()));
    });
  });
}

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email address").max(254),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  firstName: z.string().trim().max(60).optional().nullable(),
  lastName: z.string().trim().max(60).optional().nullable(),
});

/** Login body: types and sizes only (legacy accounts may have unusual but valid emails). */
const loginBody = z.object({
  email: z.string({ required_error: "Enter your email address", invalid_type_error: "Enter your email address" }).trim().min(1, "Enter your email address").max(254, "That email address is too long"),
  password: z.string({ required_error: "Enter your password", invalid_type_error: "Enter your password" }).min(1, "Enter your password").max(200, "That password is too long"),
});

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  // `/objects/*` serves legacy photo URLs to their owner, so it needs the session too.
  app.use(["/api", "/objects"], sessionMiddleware(), passport.initialize(), passport.session());

  passport.serializeUser((user: any, done) => done(null, { id: user.id }));
  passport.deserializeUser(async (data: any, done) => {
    try {
      const id = typeof data === "object" ? data?.id : data;
      if (!id) return done(null, false);
      const u = await getUser(id);
      done(null, u ?? false);
    } catch (e) {
      // A database hiccup must fail this request, not sign the user out: answering `false` here
      // makes passport delete the login from the session for good.
      done(e as Error);
    }
  });

  passport.use(
    new LocalStrategy({ usernameField: "email", passwordField: "password" }, async (email, password, done) => {
      try {
        const u = await getUserByEmail(email);
        if (!u) return done(null, false, { message: "That email and password don't match an account." });
        if (!u.passwordHash) return done(null, false, { message: "This account uses Google sign-in. Continue with Google instead." });
        const ok = await bcrypt.compare(password, u.passwordHash);
        if (!ok) return done(null, false, { message: "That email and password don't match an account." });
        done(null, u);
      } catch (e) {
        done(e as Error);
      }
    }),
  );

  if (googleEnabled()) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: "/api/auth/google/callback",
          scope: ["profile", "email"],
        },
        async (_at, _rt, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value?.toLowerCase() ?? null;
            const verified = (profile.emails?.[0] as any)?.verified !== false;
            let [u] = await db.select().from(users).where(eq(users.googleId, profile.id));
            if (!u && email && verified) {
              const existing = await getUserByEmail(email);
              if (existing) {
                [u] = await db.update(users).set({ googleId: profile.id, updatedAt: new Date() }).where(eq(users.id, existing.id)).returning();
              }
            }
            if (!u) {
              [u] = await db
                .insert(users)
                .values({
                  email,
                  firstName: profile.name?.givenName ?? null,
                  lastName: profile.name?.familyName ?? null,
                  profileImageUrl: profile.photos?.[0]?.value ?? null,
                  googleId: profile.id,
                  authProvider: "google",
                })
                .returning();
            }
            done(null, u);
          } catch (e) {
            done(e as Error);
          }
        },
      ),
    );
    app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
    app.get(
      "/api/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/login?error=google" }),
      (_req, res) => res.redirect("/"),
    );
  }

  const authLimiter = rateLimit({ windowMs: 10 * 60_000, max: 20, message: "Too many attempts. Please wait a few minutes and try again." });

  app.get("/api/auth/providers", (_req, res) => res.json({ google: googleEnabled(), password: true }));

  app.post(
    "/api/auth/register",
    authLimiter,
    ah(async (req, res) => {
      const body = parse(credentials, req.body);
      const email = body.email.toLowerCase();
      if (await getUserByEmail(email)) return res.status(409).json({ message: "An account with this email already exists. Sign in instead." });
      const passwordHash = await bcrypt.hash(body.password, SALT_ROUNDS);
      let u: User;
      try {
        [u] = await db
          .insert(users)
          .values({ email, passwordHash, firstName: body.firstName || null, lastName: body.lastName || null, authProvider: "local" })
          .returning();
      } catch (e: any) {
        // Two sign-ups racing for the same address: the unique index decides.
        if (e?.code === "23505") throw new HttpError(409, "An account with this email already exists. Sign in instead.");
        throw e;
      }
      await login(req, u);
      res.status(201).json({ user: publicUser(u) });
    }),
  );

  app.post("/api/auth/login", authLimiter, (req, res, next) => {
    // Reject non-string credentials up front (an object here used to reach `.trim()` → 500).
    const check = loginBody.safeParse(req.body ?? {});
    if (!check.success) return res.status(400).json({ message: check.error.issues[0]?.message ?? "Enter your email and password." });
    passport.authenticate("local", async (err: any, u: User | false, info: any) => {
      if (err) return next(err);
      if (!u) return res.status(401).json({ message: info?.message ?? "Sign-in failed." });
      try {
        await login(req, u);
        res.json({ user: publicUser(u) });
      } catch (e) {
        next(e);
      }
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      req.session?.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ ok: true });
      });
    });
  });

  app.get("/api/auth/user", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.isAuthenticated() && req.user) return res.json({ user: publicUser(req.user as User) });
    res.json({ user: null });
  });
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, SALT_ROUNDS);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}
