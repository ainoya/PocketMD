import { InferSelectModel } from "drizzle-orm";
import { articlesTable } from "../schema";

export type Article = InferSelectModel<typeof articlesTable>;
