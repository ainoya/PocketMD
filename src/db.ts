import Database from "better-sqlite3";
import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";

// Define the SQLite database connection
const sqlite = new Database("pocket_articles.sqlite3");
export const db: BetterSQLite3Database = drizzle(sqlite);
