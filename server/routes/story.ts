/** The story and measured facts for one object: GET /api/story/:id */
import type { Express } from "express";
import storiesData from "@shared/data/stories.json";
import factsData from "@shared/data/objectFacts.json";
import type { ObjectFacts, ObjectStory, StoryResponse } from "@shared/stories";
import { ah } from "../http";

const STORIES = storiesData as unknown as Record<string, ObjectStory>;
const FACTS = factsData as unknown as Record<string, ObjectFacts>;
const byUpper = new Map<string, string>([...Object.keys(STORIES), ...Object.keys(FACTS)].map((k) => [k.toUpperCase(), k]));

export function storyFor(id: string): StoryResponse | null {
  const key = byUpper.get(id.toUpperCase());
  if (!key) return null;
  return { story: STORIES[key] ?? null, facts: FACTS[key] ?? null };
}

export function registerStory(app: Express) {
  app.get(
    "/api/story/:id",
    ah(async (req, res) => {
      const data = storyFor(String(req.params.id));
      if (!data) {
        res.status(404).json({ message: "No story for that object" });
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.json(data);
    }),
  );
}
