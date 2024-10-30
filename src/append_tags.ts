// Find all markdown files in the specified directory
// Only include files that have at least 10 lines
// Filter out files that already have a "tags" property in the frontmatter

// Loop through each eligible markdown file
// Store the file's last modified timestamp

// Open and read the content of the file

// Use gemini-1.5 model to generate an array of hashtags

// Update the frontmatter with a "tags" property, assigning up to 5 tags

// Before saving the file, check if the current file's last modified timestamp has changed
// If the file has been modified since it was opened, skip saving to avoid file conflicts

// Save the updated content back to the markdown file
import { promisify } from "util";

import fs from "fs";

import matter from "gray-matter";

import { exec } from "child_process";
import { vertexAIClient } from "./lib/vertex_client";
import {
  GenerationConfig,
  HarmBlockThreshold,
  HarmCategory,
  ResponseSchema,
} from "@google/generative-ai";
import { FunctionDeclarationSchemaType } from "@google-cloud/vertexai";

const vertex = vertexAIClient({
  modelName: "gemini-1.5-pro-002",
});
const ARTICLE_DIR = process.env.ARTICLE_DIR;

if (!ARTICLE_DIR) {
  throw new Error("ARTICLE_DIR is not set");
}

const execPromise = promisify(exec);

const findMarkdownFiles = async (dir: string): Promise<string[]> => {
  // use shell command for faster performance
  // find markdown files has at least 10 lines
  // updated in the last 14 week
  const command = `find "${dir}" -type f -name "*.md" -size +100c -mtime +14 -mtime -98`;
  // const command = `find "${dir}" -type f -name "*.md" -size +100c`;

  // exec shell command
  const { stdout } = await execPromise(command);

  const files = stdout.split("\n").filter((line) => line.length > 0);

  if (files.length === 0) {
    throw new Error("No markdown files found");
  }

  return files;
};

const fetchTags = async (text: string): Promise<string[]> => {
  const CUSTOM_INSTRUCTIONS_APPEND_TAGS =
    process.env.CUSTOM_INSTRUCTIONS_APPEND_TAGS || "";
  const prompt = `
    ${CUSTOM_INSTRUCTIONS_APPEND_TAGS}

    You are a social media manager for a popular blog.
    tag format is #tag, which must be started with #
    You can generate tags up to 5 tags.

    Please generate tags for the following text:

    <Input>
    ${text}
    </Input>
    `;

  const schema: ResponseSchema = {
    type: FunctionDeclarationSchemaType.OBJECT,
    properties: {
      tags: {
        // string array
        type: FunctionDeclarationSchemaType.ARRAY,
        // @ts-ignore
        items: {
          type: FunctionDeclarationSchemaType.STRING,
        },
      },
    },
  };

  // console.log(`schema: ${JSON.stringify(schema, null, 2)}`);

  const generationConfig: GenerationConfig = {
    responseMimeType: "application/json",
    responseSchema: schema,
  };

  const allHarmCategories = Object.values(HarmCategory);
  const response = await vertex.generateContent({
    safetySettings: allHarmCategories.map((category) => ({
      category,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    })),
    generationConfig: generationConfig,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: JSON.stringify(prompt),
          },
        ],
      },
    ],
  });

  // console.log(`prompt: ${prompt}`);

  // console.log(`response: ${JSON.stringify(response, null, 2)}`);

  const responseText =
    response.response?.candidates?.at(0)?.content.parts[0].text;

  if (!responseText) {
    throw new Error("Failed to generate tags");
  }

  const responseJson = JSON.parse(responseText);

  // return tags
  // if tag not started with #, add #
  // console.log(`tags: ${JSON.stringify(responseJson, null, 2)}`);
  return responseJson.tags.map((tag: string) =>
    tag.startsWith("#")
      ? tag
      : `#${tag.replaceAll('"', "").replaceAll("#", "").replaceAll("\n", "")}`
  );
};

const updateTags = (
  filePath: string,
  fileBody: string,
  tags: string[]
): void => {
  const { content, data } = matter(fileBody);

  data.tags = tags;

  const newFileBody = matter.stringify(content, data);

  // write file
  // Before saving the file, check if the current file's last modified timestamp has changed
  // If the file has been modified since it was opened, skip saving to avoid file conflicts

  const fileUpdatedTime = fs.statSync(filePath).mtimeMs;

  const newFileUpdatedTime = new Date().getTime();
  if (fileUpdatedTime > newFileUpdatedTime) {
    console.log(
      `File ${filePath} has been modified since it was opened, skipping saving`
    );
    return;
  }

  // save file
  console.log(`Updating file: ${filePath}`);
  fs.writeFileSync(filePath, newFileBody);
};

const checkIfFileHasTags = (fileBody: string): boolean => {
  const { data } = matter(fileBody);
  return !!data.tags;
};

// main
const main = async () => {
  console.log(`ARTICLE_DIR: ${ARTICLE_DIR}`);
  console.log("Finding markdown files...");
  const markdownFiles = await findMarkdownFiles(ARTICLE_DIR);

  for (const file of markdownFiles) {
    try {
      console.log(`Processing file: ${file}`);
      const fileBody = fs.readFileSync(file, "utf-8");
      if (checkIfFileHasTags(fileBody)) {
        console.log(`File ${file} already has tags, skipping`);
        continue;
      }

      const tags = await fetchTags(fileBody);
      console.log(`Generated tags: ${tags}`);

      // sleep for 1 second to avoid rate limit
      await new Promise((resolve) => setTimeout(resolve, 200));

      updateTags(file, fileBody, tags);
    } catch (error) {
      console.error(`Error processing file: ${file}, error: ${error}`);
      continue;
    }
  }
};

main().catch(console.error);
