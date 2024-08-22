import { articlesTable as articles } from "./schema";
import { db } from "./db";
import { subDays } from "date-fns";
import { and, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import axios from "axios";
import axiosRetry from "axios-retry";

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

  axiosRetry(axios, {
    retries: 7,
    retryDelay: (retryCount) => {
      // exponential backoff
      const delay = Math.pow(2, retryCount) * 3000;

      console.info(
        `Retrying distillation for article ${url}, retryCount: ${retryCount}, delay: ${delay}`
      );

      return delay;
    },
    retryCondition: (error) => {
      return error.response?.status === 429;
    },
  });

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

async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  const fileType = response.headers.get("content-type");
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString("base64");

  return `data:${fileType};base64,${base64}`;
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error("timeout"));
    }, ms);
  });
}

async function replaceImageWithBase64Data(markdown: string): Promise<string> {
  const regex = /!\[.*?\]\((.*?)\)/g;

  // set timeout to avoid redos attack
  const matches = await Promise.race([markdown.matchAll(regex), timeout(1000)]);

  for (const match of matches) {
    const imageUrl = match[1];
    try {
      const base64 = await fetchImageAsBase64(imageUrl);
      console.info(`Replaced image ${imageUrl} with base64 data`);
      markdown = markdown.replace(imageUrl, base64);
    } catch (error) {
      console.error(`Error fetching image ${imageUrl}: ${error}`);
      continue;
    }
  }

  return markdown;
}

// fill in the body of articles
async function main() {
  // get articles created in the last 7days
  const since = subDays(new Date(), 7);
  // get item from sqlite db
  const latestArticles = await db
    .select()
    .from(articles)
    .where(
      and(
        gte(articles.time_added, since),
        isNull(articles.markdown),
        sql`${articles.url} NOT LIKE '%.pdf'`
      )
    )
    .execute();

  for (const article of latestArticles) {
    console.info(`Distilling article ${article.url}`);
    const markdown = await distillArticle(article.url);

    if (!markdown) {
      continue;
    }
    const markdownProcessed = await replaceImageWithBase64Data(markdown);

    await db
      .update(articles)
      .set({
        markdown: markdownProcessed,
      })
      .where(eq(articles.id, article.id))
      .execute();
  }
}

main().catch(console.error);
