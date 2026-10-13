import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, RotateCcw, X } from "lucide-react";
import { GLOSSARY, plainText, type GlossaryTerm } from "@shared/glossary";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { store } from "@/lib/storage";

const ROUNDS = 8;

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The definition with the word itself (and its other names) blanked out, so it isn't a giveaway. */
function clue(t: GlossaryTerm): string {
  let s = plainText(t.short);
  for (const name of [t.term, ...(t.aliases ?? [])].filter((n) => n.length > 2).sort((a, b) => b.length - a.length)) {
    s = s.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "____");
  }
  return s;
}

interface Question {
  answer: GlossaryTerm;
  options: GlossaryTerm[];
}

function makeQuiz(): Question[] {
  // Questions from every corner of the glossary; wrong answers from the same topic, so it's not too easy.
  const picks = shuffle(GLOSSARY.filter((t) => t.category !== "astropilot")).slice(0, ROUNDS);
  return picks.map((answer) => {
    const same = shuffle(GLOSSARY.filter((t) => t.category === answer.category && t.slug !== answer.slug));
    const others = shuffle(GLOSSARY.filter((t) => t.category !== answer.category));
    return { answer, options: shuffle([answer, ...[...same, ...others].slice(0, 3)]) };
  });
}

export default function Quiz({ onClose }: { onClose: () => void }) {
  const [seed, setSeed] = useState(0);
  const questions = useMemo(makeQuiz, [seed]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [missed, setMissed] = useState<GlossaryTerm[]>([]);
  const [score, setScore] = useState(0);
  const done = i >= questions.length;
  const best = store.get<number>("ap.glossaryBest", 0);

  const restart = () => {
    setSeed((s) => s + 1);
    setI(0);
    setPicked(null);
    setMissed([]);
    setScore(0);
  };

  if (done) {
    if (score > best) store.set("ap.glossaryBest", score);
    const verdict = score === ROUNDS ? "Perfect — you speak fluent astronomer." : score >= 6 ? "Excellent: you know your way around." : score >= 4 ? "A good start — the words below are worth a look." : "Plenty to discover: the glossary has you covered.";
    return (
      <div className="flex flex-col gap-4" aria-live="polite">
        <div>
          <div className="eyebrow">Your score</div>
          <div className="font-display text-4xl">
            {score} <span className="text-xl text-muted-foreground">/ {ROUNDS}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {verdict}
            {score > best && best > 0 ? " A new best!" : best > 0 ? ` Your best: ${Math.max(best, score)}.` : ""}
          </p>
        </div>
        {missed.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {missed.map((t) => (
              <Link key={t.slug} href={`/glossary/${t.slug}`} className="inline-flex h-9 items-center rounded-full border px-3 text-sm hover:border-primary/40 hover:bg-accent">
                {t.term}
              </Link>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={restart}>
            <RotateCcw /> Play again
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  const q = questions[i];
  const answered = picked !== null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">
          Question {i + 1} of {ROUNDS}
        </span>
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-accent" aria-label="Close the quiz">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((i + (answered ? 1 : 0)) / ROUNDS) * 100}%` }} />
      </div>
      <p className="text-[1.05rem] leading-relaxed">{clue(q.answer)}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {q.options.map((o) => {
          const right = o.slug === q.answer.slug;
          const chosen = picked === o.slug;
          return (
            <button
              key={o.slug}
              type="button"
              disabled={answered}
              onClick={() => {
                setPicked(o.slug);
                if (right) setScore((s) => s + 1);
                else setMissed((m) => [...m, q.answer]);
              }}
              className={cn(
                "flex min-h-[2.75rem] items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                !answered && "hover:border-primary/40 hover:bg-accent",
                answered && right && "border-q-excellent/60 bg-q-excellent/10",
                answered && chosen && !right && "border-q-poor/60 bg-q-poor/10",
                answered && !right && !chosen && "opacity-60",
              )}
            >
              {o.term}
              {answered && right && <Check className="h-4 w-4 text-q-excellent" />}
              {answered && chosen && !right && <X className="h-4 w-4 text-q-poor" />}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/glossary/${q.answer.slug}`} className="link text-sm">
            More about {q.answer.term.toLowerCase()}
          </Link>
          <Button
            onClick={() => {
              setPicked(null);
              setI((n) => n + 1);
            }}
            autoFocus
          >
            {i + 1 < ROUNDS ? "Next" : "See your score"} <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  );
}
