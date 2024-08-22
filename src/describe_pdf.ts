// 1. get pdf url from sqlite
// 2. download pdf
// 3. extract text from pdf with vertex ai

import { sql, desc, eq, and, or } from "drizzle-orm";
import { db } from "./db";
import { articlesTable as articles } from "./schema";
import { Article } from "./models/article";
import { vertexAIClient } from "./lib/vertex_client";
import { Content, InlineDataPart } from "@google-cloud/vertexai";
import { isNotNull } from "drizzle-orm";

// 1. get pdf url from sqlite
const fetchPdfUrls = async (): Promise<Article[]> => {
  const latestPdfs = await db
    .select()
    .from(articles)
    .where(
      and(
        or(
          sql`${articles.url} LIKE '%.pdf'`,
          sql`${articles.url} LIKE 'https://arxiv.org/pdf/%'`
        ),
        isNotNull(articles.markdown)
      )
    )
    .orderBy(desc(articles.time_added))
    .limit(10)
    .execute();

  return latestPdfs;
};

// 2. download pdf
const downloadPdf = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const data = await response.arrayBuffer();
  const base64Encoded = Buffer.from(data).toString("base64");

  return base64Encoded;
};

// 3. extract text from pdf with vertexAI
const extractTextFromPdf = async (
  dataBase64Encoded: string
): Promise<string> => {
  const client = vertexAIClient({
    modelName: "gemini-1.5-pro-001",
  });

  const pdfPart: InlineDataPart = {
    inlineData: {
      mimeType: "application/pdf",
      data: dataBase64Encoded,
    },
  };

  const customInstructions = process.env.CUSTOM_INSTRUCTIONS_DESCRIBE_PDF || "";

  const textPrompt = `Extract text from PDF
    ${customInstructions}
  `;

  const contents: Content[] = [
    {
      role: "user",
      parts: [pdfPart, { text: textPrompt }],
    },
  ];

  const continueWord = process.env.CONTINUE_WORD || "Please continue";

  const maxLoopCount = 10;
  let loopCount = 0;
  while (true) {
    if (loopCount >= maxLoopCount) {
      console.log("Max loop count reached");
      break;
    }
    loopCount++;
    console.log("Generating content...");
    const generated = await client.generateContent({
      contents: contents,
    });

    const content = generated.response.candidates?.at(0)?.content;
    if (content) {
      contents.push(content);
      contents.push({ role: "user", parts: [{ text: continueWord }] });
    } else {
      console.log("No content generated");
      break;
    }
    const finishReason = generated.response.candidates?.at(0)?.finishReason;

    if (finishReason !== "MAX_TOKENS") {
      console.log(
        "Finish reason:",
        generated.response.candidates?.at(0)?.finishReason
      );
      break;
    }
  }

  return contents
    .map((content) => content.parts[0].text)
    .filter((text) => text !== continueWord)
    .join("\n");
};

const updateArticle = async (article: Article, text: string) => {
  await db
    .update(articles)
    .set({ markdown: text })
    .where(eq(articles.id, article.id))
    .execute();
};

async function main() {
  const pdfs = await fetchPdfUrls();

  console.log(`Found ${pdfs.length} pdfs`);

  for (const pdf of pdfs) {
    try {
      console.log(`Extracting text from pdf: ${pdf.url}`);
      const pdfData = await downloadPdf(pdf.url);

      const text = await extractTextFromPdf(pdfData);
      console.log(text);

      // Update the article with the extracted text
      await updateArticle(pdf, text);
    } catch (error) {
      console.error(`Error extracting text from pdf: ${pdf.url}, ${error}`);
    }
  }
}

main().catch(console.error);
