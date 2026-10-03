import type { Express } from "express";
import { z } from "zod";
import { ah, parse, rateLimit, HttpError } from "../http";
import { donationsEnabled } from "./features";

async function stripe() {
  if (!donationsEnabled()) throw new HttpError(503, "Donations are not available right now.");
  const { getUncachableStripeClient } = await import("../stripeClient");
  return getUncachableStripeClient();
}

export function registerDonations(app: Express) {
  app.get(
    "/api/donations/products",
    ah(async (_req, res) => {
      const s = await stripe();
      const prices = await s.prices.list({ active: true, expand: ["data.product"], lookup_keys: ["donation_5", "donation_10", "donation_50"] });
      const products = prices.data
        .filter((p) => (p.product as any)?.active && (p.product as any)?.metadata?.type === "donation")
        .map((p) => ({ id: p.id, name: (p.product as any).name as string, description: (p.product as any).description as string | null, amount: p.unit_amount, currency: p.currency }))
        .sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0));
      res.json({ products });
    }),
  );

  app.post(
    "/api/donations/checkout",
    rateLimit({ windowMs: 60_000, max: 10 }),
    ah(async (req, res) => {
      const { priceId } = parse(z.object({ priceId: z.string().regex(/^price_[A-Za-z0-9]+$/) }), req.body);
      const s = await stripe();
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
    }),
  );

  app.get(
    "/api/donations/verify/:sessionId",
    ah(async (req, res) => {
      const id = String(req.params.sessionId);
      if (!/^cs_[A-Za-z0-9_]+$/.test(id)) throw new HttpError(400, "Invalid session");
      const s = await stripe();
      const session = await s.checkout.sessions.retrieve(id);
      res.json({ success: session.payment_status === "paid", amount: session.amount_total, currency: session.currency });
    }),
  );
}
