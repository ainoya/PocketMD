import { articlesTable as articles } from "./schema";
import { db } from "./db";
import { subDays } from "date-fns";
import { and, eq, gte, isNotNull, isNull } from "drizzle-orm";
import axios from "axios";

const DISTILLER_API_ENDPOINT = process.env.DISTILLER_API_ENDPOINT;
const DISTILLER_API_KEY = process.env.DISTILLER_API_KEY;

type DistillRequest = {
  url: string;
  markdown: boolean;
};

type DistillResponse = {
  body: string;
};

async function distillArticle(url: string): Promise<string | undefined> {
  if (!DISTILLER_API_ENDPOINT || !DISTILLER_API_KEY) {
    throw new Error("Distill API credentials not set");
  }
  const request: DistillRequest = {
    url,
    markdown: true,
  };

  try {
    const response = await axios.post<DistillResponse>(
      DISTILLER_API_ENDPOINT,
      request,
      {
        headers: {
          Authorization: `Bearer ${DISTILLER_API_KEY}`,
        },
      }
    );

    console.info(`Distilled article ${url}, status: ${response.status}`);

    return response.data.body;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        `Error distilling article ${url}, status: ${error.response?.status}, message: ${error.response?.data}`
      );
    } else {
      console.error(`Error distilling article ${url}, error: ${error}`);
    }

    return undefined;
  }
}

// fill in the body of articles
async function main() {
  // get articles created in the last 7days
  const since = subDays(new Date(), 7);
  // get item from sqlite db
  const latestArticles = await db
    .select()
    .from(articles)
    .where(and(gte(articles.time_added, since), isNull(articles.markdown)))
    .execute();

  for (const article of latestArticles) {
    console.info(`Distilling article ${article.url}`);
    const markdown = await distillArticle(article.url);

    if (!markdown) {
      continue;
    }
    await db
      .update(articles)
      .set({
        markdown,
      })
      .where(eq(articles.id, article.id))
      .execute();
  }
}

main().catch(console.error);
