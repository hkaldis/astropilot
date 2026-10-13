import { useState } from "react";
import { Check, Link2, Mail, MessageCircle, Send, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { useStory } from "./about/useStory";

/**
 * Send an object to a friend. Phones (and browsers that have one) open the system share sheet — Messages,
 * WhatsApp, Mail… — with the object's one-line story and its link; the link's preview shows its photo. Elsewhere a
 * small menu copies the link or opens WhatsApp, Telegram or email.
 */
export function ShareObject({ id, name, className }: { id: string; name: string; className?: string }) {
  const tagline = useStory(id).data?.story?.tagline;
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/object/${encodeURIComponent(id)}`;
  const text = tagline ? `${name}\n${tagline}` : `${name}: see when and where to look for it tonight.`;
  const native = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copied", description: `Paste it anywhere to share ${name}.` });
    } catch {
      toast({ title: "Couldn't copy the link", description: url });
    }
  };

  if (native) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={className}
        onClick={async () => {
          try {
            await navigator.share({ title: name, text, url });
          } catch (e) {
            // Closing the share sheet isn't an error; anything else falls back to copying the link.
            if ((e as DOMException)?.name !== "AbortError") await copy();
          }
        }}
      >
        <Share2 /> Share
      </Button>
    );
  }

  const enc = encodeURIComponent;
  const items = [
    { label: "WhatsApp", icon: MessageCircle, href: `https://wa.me/?text=${enc(`${text}\n${url}`)}` },
    { label: "Telegram", icon: Send, href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}` },
    { label: "Email", icon: Mail, href: `mailto:?subject=${enc(`${name} — have a look`)}&body=${enc(`${text}\n\n${url}`)}` },
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={className}>
          <Share2 /> Share
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1.5">
        <div className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground">Send {name} to a friend</div>
        <button type="button" onClick={copy} className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-accent">
          {copied ? <Check className="h-4 w-4 text-q-excellent" /> : <Link2 className="h-4 w-4 text-muted-foreground" />}
          {copied ? "Link copied" : "Copy link"}
        </button>
        {items.map((i) => (
          <a key={i.label} href={i.href} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-accent">
            <i.icon className="h-4 w-4 text-muted-foreground" /> {i.label}
          </a>
        ))}
      </PopoverContent>
    </Popover>
  );
}
