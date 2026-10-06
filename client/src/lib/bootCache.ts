/**
 * What the app needs to know before it can draw a page for this browser's account — who is signed in (with
 * their preferences), their saved places and their gear — kept from the last visit. Seeded into the query
 * cache at start-up, it lets every page draw at once and in its final form; each query is still refetched
 * straight away (the copies are marked stale), and a page only changes if something changed meanwhile.
 * It follows the query cache, so signing in or out (which clears that) replaces it, and a guest keeps
 * nothing but "signed out".
 */
import type { QueryClient } from "@tanstack/react-query";
import { store } from "./storage";

const KEY = "ap.boot";
const AUTH = "/api/auth/user";
/** The account's own data, kept only while that account is signed in. */
const ACCOUNT = ["/api/locations", "/api/gear"];
const KEPT = new Set([AUTH, ...ACCOUNT]);

type AuthData = { user: { id: string } | null };
type Boot = { data: Record<string, unknown> };

export function startBootCache(qc: QueryClient) {
  /** The account the cached data belongs to (null: signed out; undefined: not known yet). */
  let account: string | null | undefined;

  const boot = store.get<Boot | null>(KEY, null);
  const auth = boot?.data?.[AUTH] as AuthData | undefined;
  if (boot && auth && typeof auth === "object" && "user" in auth) {
    // updatedAt 0: shown at once, refetched as soon as a page asks for it.
    qc.setQueryData([AUTH], auth, { updatedAt: 0 });
    if (auth.user) for (const k of ACCOUNT) if (boot.data[k] !== undefined) qc.setQueryData([k], boot.data[k], { updatedAt: 0 });
    account = auth.user?.id ?? null;
  }

  let queued = false;
  const save = () => {
    queued = false;
    const a = qc.getQueryData<AuthData>([AUTH]);
    if (!a) return;
    const data: Record<string, unknown> = { [AUTH]: a };
    if (a.user)
      for (const k of ACCOUNT) {
        const v = qc.getQueryData([k]);
        if (v !== undefined) data[k] = v;
      }
    store.set(KEY, { data } satisfies Boot);
  };
  qc.getQueryCache().subscribe((e) => {
    if (e.type !== "updated" || e.action.type !== "success") return;
    const k = String(e.query.queryKey[0]);
    if (!KEPT.has(k)) return;
    if (k === AUTH) {
      // The session belongs to someone else than the cached data (signed out or in elsewhere): drop their
      // places and gear rather than show them, and load this account's.
      const id = (e.query.state.data as AuthData | undefined)?.user?.id ?? null;
      if (account && id !== account) for (const a of ACCOUNT) void qc.resetQueries({ queryKey: [a] });
      account = id;
    }
    if (queued) return;
    queued = true;
    setTimeout(save, 0);
  });
}
