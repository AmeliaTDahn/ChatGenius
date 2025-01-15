import { PineconeClient } from "@pinecone-database/pinecone";
import { Document } from "langchain/document";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PineconeStore } from "langchain/vectorstores/pinecone";

if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_ENVIRONMENT || !process.env.OPENAI_API_KEY) {
  throw new Error("Missing required environment variables for vector store");
}

const pinecone = new PineconeClient();

export async function initVectorStore() {
  await pinecone.init({
    apiKey: process.env.PINECONE_API_KEY,
    environment: process.env.PINECONE_ENVIRONMENT,
  });

  const index = pinecone.Index("chat-genius");
  
  return new PineconeStore(new OpenAIEmbeddings(), { pineconeIndex: index });
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
