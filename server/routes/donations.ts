import type { Express } from "express";
import { z } from "zod";
import { ah, parse, rateLimit, HttpError, TTLCache } from "../http";
import { donationsEnabled } from "./features";

async function stripe() {
  if (!donationsEnabled()) throw new HttpError(503, "Donations are not available right now.");
  const { getUncachableStripeClient } = await import("../stripeClient");
  try {
    return await getUncachableStripeClient();
  } catch (e: any) {
    console.warn("[donations] Stripe connection unavailable:", e?.message ?? e);
    throw new HttpError(503, "Donations are not available right now.");
  }
}

/**
 * Stripe (and Replit connector) errors carry upstream status codes and messages — e.g. a 401
 * "Invalid API Key provided: sk_live_…" — that must neither leak nor look like "please sign in".
 */
function upstream(e: any, notFound: string): never {
  if (e instanceof HttpError) throw e;
  if (e?.type === "StripeInvalidRequestError" && (e?.statusCode === 404 || e?.code === "resource_missing")) throw new HttpError(404, notFound);
  console.warn("[donations] Stripe request failed:", e?.type ?? e?.name, e?.message);
  throw new HttpError(502, "Donations are unavailable right now. Please try again later.");
}

type Product = { id: string; name: string; description: string | null; amount: number | null; currency: string };
const productCache = new TTLCache<Product[]>(10 * 60_000, 1);

export function registerDonations(app: Express) {
  app.get(
    "/api/donations/products",
    rateLimit({ windowMs: 60_000, max: 30 }),
    ah(async (_req, res) => {
      let products = productCache.get("all");
      if (!products) {
        const s = await stripe();
        try {
          const prices = await s.prices.list({ active: true, expand: ["data.product"], lookup_keys: ["donation_5", "donation_10", "donation_50"] });
          products = prices.data
            .filter((p) => (p.product as any)?.active && (p.product as any)?.metadata?.type === "donation")
            .map((p) => ({ id: p.id, name: (p.product as any).name as string, description: (p.product as any).description as string | null, amount: p.unit_amount, currency: p.currency }))
            .sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0));
        } catch (e) {
          upstream(e, "No donation options found.");
        }
        productCache.set("all", products);
      }
      res.json({ products });
    }),
  );

  app.post(
    "/api/donations/checkout",
    rateLimit({ windowMs: 60_000, max: 10 }),
    ah(async (req, res) => {
      const { priceId } = parse(z.object({ priceId: z.string().max(100).regex(/^price_[A-Za-z0-9]+$/, "Unknown donation option") }), req.body);
      const s = await stripe();
      try {
        const price = await s.prices.retrieve(priceId, { expand: ["product"] });
        if (!price.active || (price.product as any)?.metadata?.type !== "donation") throw new HttpError(400, "Unknown donation option");
        const host = process.env.REPLIT_DOMAINS?.split(",")[0] || req.get("host");
        const base = `https://${host}`;
        const session = await s.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{ price: priceId, quantity: 1 }],
          mode: "payment",
          success_url: `${base}/support/thanks?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${base}/support`,
          metadata: { type: "donation" },
        });
        res.json({ url: session.url });
      } catch (e) {
        upstream(e, "Unknown donation option");
      }
    }),
  );

  app.get(
    "/api/donations/verify/:sessionId",
    rateLimit({ windowMs: 60_000, max: 30 }),
    ah(async (req, res) => {
      const id = String(req.params.sessionId);
      if (!/^cs_[A-Za-z0-9_]{1,200}$/.test(id)) throw new HttpError(400, "Invalid session");
      const s = await stripe();
      try {
        const session = await s.checkout.sessions.retrieve(id);
        res.json({ success: session.payment_status === "paid", amount: session.amount_total, currency: session.currency });
      } catch (e) {
        upstream(e, "We couldn't find that donation.");
      }
    }),
  );
}
