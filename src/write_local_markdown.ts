// save items to local markdown files
// if markdown file exits, skip saving
import { subDays } from "date-fns";
import { and, gte, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { articlesTable as articles } from "./schema";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const CLIP_DIR = process.env.CLIP_DIR;

async function main() {
  // get articles created in the last 7days
  const since = subDays(new Date(), 7);
  // get item from sqlite db
  const latestArticles = await db
    .select()
    .from(articles)
    .where(
      and(
        isNotNull(articles.markdown),
        gte(articles.time_added, since),
        isNotNull(articles.title)
      )
    )
    .execute();

  for (const article of latestArticles) {
    await saveArticleToMarkdown(article);
  }
}

main().catch(console.error);

const markdownBodyFormatOptions = {
  removeImageTags: process.env.MARKDOWN_FORMAT_REMOVE_IMAGE_TAGS === "true",
  replaceBase64ImageToFile:
    process.env.MARKDOWN_FORMAT_REPLACE_BASE64_IMAGE_TO_FILE === "true",
};

const formatMarkdownBody = (markdownBody: string): string => {
  const formatRuleFunctions: Array<((body: string) => string) | undefined> = [
    markdownBodyFormatOptions.removeImageTags
      ? (body: string) => body.replace(/!\[.*\]\(.*\)/g, "")
      : undefined,
    markdownBodyFormatOptions.replaceBase64ImageToFile
      ? (body: string) => {
          // replace base64 image to file
          // convert base64 image to file
          // get image directory path from env
          // by default, save to the `${CLIP_DIR}/images` directory
          const imageDir = process.env.MARKDOWN_FORMAT_IMAGE_DIR || `./images`;
          if (!process.env.CLIP_DIR) {
            throw new Error("CLIP_DIR is not set");
          }
          if (!fs.existsSync(path.join(process.env.CLIP_DIR, imageDir))) {
            fs.mkdirSync(path.join(process.env.CLIP_DIR, imageDir));
          }
          const imageDirAbsolute = path.join(process.env.CLIP_DIR, imageDir);
          const base64ImageRegex =
            /!\[.*\]\(data:image\/(.*);base64,([^"]*)\)/g;
          const base64ImageMatch = body.match(base64ImageRegex);

          // convert base64 image to file
          if (base64ImageMatch) {
            base64ImageMatch.forEach((base64Image) => {
              const base64ImageRegex =
                /!\[.*\]\(data:image\/(.*);base64,([^"]*)\)/;
              const match = base64Image.match(base64ImageRegex);
              if (match) {
                const [, ext, base64] = match;
                // filename is the hash of the sha256 of the base64 string, using crypto
                const fileName = `${crypto
                  .createHash("sha256")
                  .update(base64)
                  .digest("hex")}.${ext.replace("+xml", "")}`;
                const filePath = path.join(imageDirAbsolute, fileName);
                fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
                const filePathRelative = path.join(imageDir, fileName);
                body = body.replace(
                  base64Image,
                  `![image](${filePathRelative})`
                );
              }
            });
          }

          return body;
        }
      : undefined,
  ];

  return formatRuleFunctions.reduce((body, rule) => {
    if (rule) {
      return rule(body);
    }
    return body;
  }, markdownBody);
};

async function saveArticleToMarkdown(article: {
  id: string;
  title: string | null;
  url: string;
  excerpt: string | null;
  markdown: string | null;
  ai_summary: string | null;
  filetype: string | null;
}): Promise<void> {
  if (!CLIP_DIR) {
    throw new Error("CLIP_DIR is not set");
  }

  if (!article.title) {
    console.log(`Skipping article with no title: ${article.id}`);
    return;
  }
  // escape slashes, and forbidden characters in filenames
  // limit to 200 characters to avoid ENAMETOOLONG error
  const fileName = `${article.title
    .replace(/[/\\?%*:|"<>]/g, "_")
    .substring(0, 200)
    .trim()}.md`;
  const filePath = path.join(CLIP_DIR, fileName);

  if (fs.existsSync(filePath)) {
    console.log(`File ${filePath} exists, skipping saving`);
    return;
  }

  const markdownBody = article.markdown
    ? formatMarkdownBody(article.markdown)
    : undefined;

  const articleBody = `
  ## Body
  
  ${markdownBody ?? "empty result"}
  `;

  const content = `---
title: "${sanitizeFrontmatterString(article.title)}"
url: ${article.url}
description: "${sanitizeFrontmatterString(article.excerpt ?? "")}"
---

## Summary

${article.ai_summary ?? "no summary"}

${article.filetype === "application/pdf" ? articleBody : ""}
`;

  fs.writeFileSync(filePath, content);

  console.log(`Saved article ${article.title} to ${filePath}`);
}

const sanitizeFrontmatterString = (str: string) => {
  return str.replace(/"/g, '\\"');
};
