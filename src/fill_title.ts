// fill title with Vertex AI

import { HarmBlockThreshold, HarmCategory } from "@google-cloud/vertexai";
import { articlesTable as articles } from "./schema";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "./db";
import { vertexAIClient } from "./lib/vertex_client";

const generativeAiModel = vertexAIClient({
  modelName: "gemini-1.5-flash-001",
});

async function main() {
  const latestArticle = await db
    .select()
    .from(articles)
    .where(and(isNotNull(articles.markdown), eq(articles.title, "")))
    .orderBy(desc(articles.time_added))
    .limit(10)
    .execute();

  for (const article of latestArticle) {
    await addTitleToArticle(article);
  }
}

main().catch(console.error);

async function addTitleToArticle(article: {
  id: string;
  title: string | null;
  url: string;
  excerpt: string | null;
  raw_data: unknown;
  markdown: string | null;
  ai_summary: string | null;
  time_added: Date | null;
}): Promise<void> {
  console.log(`Filling title for article ${article.url}`);

  const text = generatePrompt(article);

  // convert enum HarmCategory to array
  // NOTE: pelease refer to https://cloud.google.com/vertex-ai/docs/gapic/reference/rpc/google.cloud.aiplatform.v1#google.cloud.aiplatform.v1.HarmCategory
  // you may need to adjust the HarmCategory to match the enum in the API
  const allHarmCategories = Object.values(HarmCategory);

  const title = await generativeAiModel.generateContent({
    safetySettings: allHarmCategories.map((category) => ({
      category,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    })),
    generationConfig: {
      maxOutputTokens: 128,
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: JSON.stringify(text),
          },
        ],
      },
    ],
  });

  const candidates = title.response.candidates;

  if (!candidates) {
    console.error(
      `Failed to generate title for article ${article.title}, no candidates found`
    );
    return;
  }

  console.info(`respone: ${JSON.stringify(candidates)}`);
  const fullTextResponse = candidates[0].content.parts[0].text;

  console.log(fullTextResponse);

  if (fullTextResponse) {
    // sanitized title for file name
    const sanitizedTitle = fullTextResponse
      .replace(/[/\\?%*:|"<>]/g, "_")
      // remove newlines
      .replace(/\n/g, "")
      .substring(0, 200);
    await db
      .update(articles)
      .set({
        title: sanitizedTitle,
      })
      .where(eq(articles.id, article.id))
      .execute();
  } else {
    console.error(
      `Failed to generate title for article ${article.title}, no response found`
    );
  }
}

function generatePrompt(article: {
  id: string;
  title: string | null;
  url: string;
  excerpt: string | null;
  raw_data: unknown;
  markdown: string | null;
  ai_summary: string | null;
  time_added: Date | null;
}): string {
  // remove image links
  const sanitized = article.markdown?.replace(/!\[.*?\]\((.*?)\)/g, "");
  return `
  URL: ${article.url}
  Description: ${article.excerpt}
  <article_body>
  ${sanitized?.substring(0, 20_000) ?? "empty result"}
  </article_body>

  ---

  Please generate title.

  NOTE: you write only the title of the article.
  `;
}
