import "dotenv/config";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./db";

// This will run migrations on the database, skipping the ones already applied
migrate(db, { migrationsFolder: "./drizzle" });

console.log("Migrations completed successfully.");
