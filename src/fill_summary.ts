// fill summary with Vertex AI

import { HarmBlockThreshold, HarmCategory } from "@google-cloud/vertexai";
import { articlesTable as articles } from "./schema";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "./db";
import { vertexAIClient } from "./lib/vertex_client";

const CUSTOM_INSTRUCTIONS = process.env.CUSTOM_INSTRUCTIONS || "";

const generativeAiModel = vertexAIClient({
  modelName: "gemini-1.5-flash-002",
});

async function main() {
  const latestArticle = await db
    .select()
    .from(articles)
    .where(and(isNotNull(articles.markdown), isNull(articles.ai_summary)))
    .orderBy(desc(articles.time_added))
    .limit(10)
    .execute();

  for (const article of latestArticle) {
    await summarizeArticle(article);
  }
}

main().catch(console.error);

async function summarizeArticle(article: {
  id: string;
  title: string | null;
  url: string;
  excerpt: string | null;
  raw_data: unknown;
  markdown: string | null;
  ai_summary: string | null;
  time_added: Date | null;
}): Promise<void> {
  console.log(`Filling summary for article ${article.title}`);

  const text = generatePrompt(article);

  // convert enum HarmCategory to array
  // NOTE: pelease refer to https://cloud.google.com/vertex-ai/docs/gapic/reference/rpc/google.cloud.aiplatform.v1#google.cloud.aiplatform.v1.HarmCategory
  // you may need to adjust the HarmCategory to match the enum in the API
  const allHarmCategories = Object.values(HarmCategory);

  const summary = await generativeAiModel.generateContent({
    safetySettings: allHarmCategories.map((category) => ({
      category,
      threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
    })),
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

  const candidates = summary.response.candidates;

  if (!candidates) {
    console.error(
      `Failed to generate summary for article ${article.title}, no candidates found`
    );
    return;
  }

  console.info(`respone: ${JSON.stringify(candidates)}`);
  const fullTextResponse = candidates[0].content.parts[0].text;

  console.log(fullTextResponse);

  if (fullTextResponse) {
    await db
      .update(articles)
      .set({
        ai_summary: fullTextResponse,
      })
      .where(eq(articles.id, article.id))
      .execute();
  } else {
    console.error(
      `Failed to generate summary for article ${article.title}, no response found`
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
  Title: ${article.title}
  URL: ${article.url}
  Description: ${article.excerpt}
  <article_body>
  ${sanitized?.substring(0, 20_000) ?? "empty result"}
  </article_body>

  ---

  Please summarize the above article. Output it in markdown format as bullet points.

  ${CUSTOM_INSTRUCTIONS}
  `;
}
