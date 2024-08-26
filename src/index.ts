import axios from "axios";
import { articlesTable as articles } from "./schema";
import { db } from "./db";
import { format, subDays } from "date-fns";
import { PocketItemList } from "./types/pocket";

// Define the Pocket API credentials
const POCKET_CONSUMER_KEY = process.env.POCKET_CONSUMER_KEY;
const POCKET_ACCESS_TOKEN = process.env.POCKET_ACCESS_TOKEN;

// Function to fetch articles from Pocket
async function fetchPocketArticles() {
  // fetch articles in 7 days
  const since = subDays(new Date(), 7).getTime() / 1000;

  const response = await axios.post("https://getpocket.com/v3/get", {
    consumer_key: POCKET_CONSUMER_KEY,
    access_token: POCKET_ACCESS_TOKEN,
    detailType: "complete",
    since,
  });

  return response.data.list;
}

// Resolve file type from the URL with using headers
async function resolveFileType(url: string): Promise<string | null> {
  try {
    const response = await axios.head(url);
    const contentType = response.headers["content-type"].split(";")[0];

    return contentType;
  } catch (error) {
    console.error(`Error resolving file type for ${url}: ${error}`);
    return null;
  }
}

// Function to save articles to SQLite database using Drizzle ORM
async function saveArticlesToSQLite(newArticles: PocketItemList) {
  console.log("Saving articles to SQLite database...");
  // Insert articles into the database
  for (const articleId in newArticles) {
    const article = newArticles[articleId];
    const fileType = await resolveFileType(
      article.resolved_url ?? article.given_url
    );
    try {
      // upsert into the articles table
      await db
        .insert(articles)
        .values({
          id: article.item_id,
          title: article.resolved_title ?? article.given_title,
          url: article.resolved_url ?? article.given_url,
          excerpt: article.excerpt,
          raw_data: article,
          filetype: fileType,
          // convert time_added (epoch seconds) to date
          time_added: new Date(parseInt(article.time_added) * 1000),
        })
        .onConflictDoNothing({
          target: articles.id,
        })
        .execute();
    } catch (error) {
      console.error(
        `Error saving article: ${article} ${article.resolved_url}, ${error}`
        
      );
      console.error(error);
    }
  }
}

// Main function to fetch and save articles
async function main() {
  try {
    const articles = await fetchPocketArticles();
    await saveArticlesToSQLite(articles);
    console.log("Articles saved to SQLite database successfully.");
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the main function
main();
