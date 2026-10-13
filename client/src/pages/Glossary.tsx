import { GlossaryIndex } from "@/features/glossary/GlossaryIndex";
import { TermView } from "@/features/glossary/TermView";

export default function GlossaryPage({ slug }: { slug?: string }) {
  return slug ? <TermView slug={slug} /> : <GlossaryIndex />;
}
