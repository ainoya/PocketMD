// save items to local markdown files
// if markdown file exits, skip saving
import { subDays } from "date-fns";
import { and, gte, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { articlesTable as articles } from "./schema";
import fs from "fs";
import path from "path";

const CLIP_DIR = process.env.CLIP_DIR;

async function main() {
  // get articles created in the last 7days
  const since = subDays(new Date(), 7);
  // get item from sqlite db
  const latestArticles = await db
    .select()
    .from(articles)
    .where(
      and(
        isNotNull(articles.markdown),
        gte(articles.time_added, since),
        isNotNull(articles.title)
      )
    )
    .execute();

  for (const article of latestArticles) {
    await saveArticleToMarkdown(article);
  }
}

main().catch(console.error);

async function saveArticleToMarkdown(article: {
  id: string;
  title: string | null;
  url: string;
  excerpt: string | null;
  markdown: string | null;
  ai_summary: string | null;
}): Promise<void> {
  if (!CLIP_DIR) {
    throw new Error("CLIP_DIR is not set");
  }

  if (!article.title) {
    console.log(`Skipping article with no title: ${article.id}`);
    return;
  }
  // escape slashes, and forbidden characters in filenames
  const fileName = `${article.title.replace(/[/\\?%*:|"<>]/g, "_")}.md`;
  const filePath = path.join(CLIP_DIR, fileName);

  if (fs.existsSync(filePath)) {
    console.log(`File ${filePath} exists, skipping saving`);
    return;
  }

  const content = `---
title: "${article.title}"
url: ${article.url}
description: "${article.excerpt}"
---

## Summary

${article.ai_summary ?? "no summary"}

## Article

${article.markdown ?? "no content"}
`;

  fs.writeFileSync(filePath, content);

  console.log(`Saved article ${article.title} to ${filePath}`);
}
