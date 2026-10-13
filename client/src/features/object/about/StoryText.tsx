import { Fragment } from "react";
import { Term } from "@/features/glossary/Term";

const LINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/**
 * Story text with its [[slug|words]] glossary links as words you can tap for a definition. Parsed here rather
 * than with the glossary's helper, so object pages don't load the glossary until a definition is opened.
 */
export function StoryText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  LINK.lastIndex = 0;
  while ((m = LINK.exec(text))) {
    if (m.index > last) parts.push(<Fragment key={last}>{text.slice(last, m.index)}</Fragment>);
    parts.push(
      <Term key={m.index} slug={m[1]}>
        {m[2] ?? m[1].replace(/-/g, " ")}
      </Term>,
    );
    last = LINK.lastIndex;
  }
  if (last < text.length) parts.push(<Fragment key={last}>{text.slice(last)}</Fragment>);
  return <>{parts}</>;
}

/** The same text without its links, for places that can't hold them. */
export const storyPlain = (text: string) => text.replace(LINK, (_, slug: string, label?: string) => label ?? slug.replace(/-/g, " "));
