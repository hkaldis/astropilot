import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import { storage } from "./storage";

const SALT_ROUNDS = 12;

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: any, done) => {
    done(null, { id: user.id });
  });

  passport.deserializeUser(async (data: any, done) => {
    try {
      const userId = typeof data === 'object' ? data.id : data;
      if (!userId) {
        return done(null, false);
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      done(null, false);
    }
  });

  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }
          if (!user.passwordHash) {
            return done(null, false, { message: "Please sign in with Google" });
          }
          const isValid = await verifyPassword(password, user.passwordHash);
          if (!isValid) {
            return done(null, false, { message: "Invalid email or password" });
          }
          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (googleClientId && googleClientSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: googleClientId,
          clientSecret: googleClientSecret,
          callbackURL: "/api/auth/google/callback",
          scope: ["profile", "email"],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            const googleId = profile.id;
            
            let user = await storage.getUserByGoogleId(googleId);
            
            if (!user && email) {
              user = await storage.getUserByEmail(email);
              if (user) {
                await storage.linkGoogleAccount(user.id, googleId);
                user = await storage.getUser(user.id);
              }
            }
            
            if (!user) {
              user = await storage.createGoogleUser({
                email: email || null,
                firstName: profile.name?.givenName || null,
                lastName: profile.name?.familyName || null,
                profileImageUrl: profile.photos?.[0]?.value || null,
                googleId,
              });
            }
            
            return done(null, user);
          } catch (error) {
            return done(error as Error);
          }
        }
      )
    );

    app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

    app.get(
      "/api/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/login?error=google_failed" }),
      (req, res) => {
        res.redirect("/");
      }
    );
  }

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const passwordHash = await hashPassword(password);
      const user = await storage.createLocalUser({
        email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
      });

      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Error logging in" });
        }
        // Explicitly save session before sending response to avoid race condition
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({ message: "Error saving session" });
          }
          return res.json({ 
            user: { 
              id: user.id, 
              email: user.email, 
              firstName: user.firstName, 
              lastName: user.lastName,
              profileImageUrl: user.profileImageUrl 
            } 
          });
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Error creating account" });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        console.error("Login auth error:", err);
        return res.status(500).json({ message: "Error logging in" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      console.log("Login successful for user:", user.id, "Session ID before login:", req.sessionID);
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("req.login error:", loginErr);
          return res.status(500).json({ message: "Error logging in" });
        }
        console.log("req.login completed, Session ID:", req.sessionID, "Session passport:", req.session?.passport);
        // Explicitly save session before sending response to avoid race condition
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({ message: "Error saving session" });
          }
          console.log("Session saved successfully, sending response");
          return res.json({ 
            user: { 
              id: user.id, 
              email: user.email, 
              firstName: user.firstName, 
              lastName: user.lastName,
              profileImageUrl: user.profileImageUrl 
            } 
          });
        });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Error logging out" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/user", (req, res) => {
    console.log("GET /api/auth/user - Session ID:", req.sessionID, "isAuthenticated:", req.isAuthenticated(), "passport:", req.session?.passport);
    if (req.isAuthenticated() && req.user) {
      const user = req.user as any;
      return res.json({ 
        user: { 
          id: user.id, 
          email: user.email, 
          firstName: user.firstName, 
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl 
        } 
      });
    }
    res.json({ user: null });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};
