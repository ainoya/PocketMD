import { VertexAI } from "@google-cloud/vertexai";

type availableAIModel = "gemini-1.5-flash-002" | "gemini-1.5-pro-002";

export const vertexAIClient = (opts: { modelName?: availableAIModel }) => {
  if (!process.env.GCP_PROJECT_ID) {
    throw new Error("GCP_PROJECT_ID is not set.");
  }

  const modelName = opts.modelName || "gemini-1.5-flash-002";

  console.log(`keyFile: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);

  const vertexAI = new VertexAI({
    project: process.env.GCP_PROJECT_ID,
    location: process.env.GCP_PROJECT_LOCATION,
    googleAuthOptions: {
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    },
  });

  return vertexAI.getGenerativeModel({ model: modelName });
};
