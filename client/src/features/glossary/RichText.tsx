import { Fragment } from "react";
import { richParts } from "@shared/glossary";
import { Term } from "./Term";

/** Glossary text with its [[term]] links as words you can hover for a definition or follow. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {richParts(text).map((p, i) =>
        "slug" in p ? (
          <Term key={i} slug={p.slug} link>
            {p.label}
          </Term>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}
