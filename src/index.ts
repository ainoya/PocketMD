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

// Function to save articles to SQLite database using Drizzle ORM
async function saveArticlesToSQLite(newArticles: PocketItemList) {
  // Insert articles into the database
  for (const articleId in newArticles) {
    const article = newArticles[articleId];
    console.log(
      `Saving url ${article.resolved_url},article: ${
        article.resolved_title
      }, timestamp: ${format(
        new Date(parseInt(article.time_added) * 1000),
        "yyyy-MM-dd HH:mm:ss"
      )}`
    );
    // upsert into the articles table
    await db
      .insert(articles)
      .values({
        id: article.item_id,
        title: article.resolved_title ?? article.given_title,
        url: article.resolved_url ?? article.given_url,
        excerpt: article.excerpt,
        raw_data: article,
        // convert time_added (epoch seconds) to date
        time_added: new Date(parseInt(article.time_added) * 1000),
      })
      .onConflictDoNothing({
        target: articles.id,
      })
      .execute();
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
