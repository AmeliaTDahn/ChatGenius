import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";

if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_ENVIRONMENT || !process.env.OPENAI_API_KEY) {
  throw new Error("Missing required environment variables for vector store");
}

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const index = pinecone.Index("chat-genius");

export async function initVectorStore() {
  return await PineconeStore.fromExistingIndex(
    new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
    }),
    { pineconeIndex: index }
  );
}

export async function addDocumentToVectorStore(
  content: string,
  metadata: Record<string, any> = {}
) {
  const vectorStore = await initVectorStore();
  const doc = new Document({
    pageContent: content,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
    },
  });

  await vectorStore.addDocuments([doc]);
}

export async function queryVectorStore(query: string, k: number = 3) {
  const vectorStore = await initVectorStore();
  return await vectorStore.similaritySearch(query, k);
}