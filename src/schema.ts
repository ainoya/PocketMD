import { sqliteTable, blob, text, integer } from "drizzle-orm/sqlite-core";

export const articlesTable = sqliteTable("articles", {
  id: text("id").primaryKey(),
  title: text("title"),
  url: text("url").notNull(),
  excerpt: text("excerpt"),
  raw_data: blob("raw_data", { mode: "json" }),
  markdown: text("markdown"),
  ai_summary: text("ai_summary"),
  time_added: integer("time_added", { mode: "timestamp" }),
});
