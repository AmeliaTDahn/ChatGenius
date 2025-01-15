import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { db } from "@db";
import { messages, messageEmbeddings } from "@db/schema";
import { eq } from "drizzle-orm";

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

// Function to analyze and store user message
export async function addUserMessageToVectorStore(
  messageId: number,
  content: string,
) {
  const vectorStore = await initVectorStore();

  // Create a document with message content and metadata
  const doc = new Document({
    pageContent: content,
    metadata: {
      messageId,
      timestamp: new Date().toISOString(),
      type: 'user_message'
    },
  });

  // Store in Pinecone
  await vectorStore.addDocuments([doc]);

  // Get the embedding from OpenAI
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
  });
  const [embedding] = await embeddings.embedDocuments([content]);

  // Store in PostgreSQL
  await db.insert(messageEmbeddings).values({
    messageId,
    embedding: JSON.stringify(embedding),
    sentimentScore: 0, // To be implemented: sentiment analysis
    topicTags: '', // To be implemented: topic extraction
  });
}

// Function to retrieve relevant user messages for personality analysis
export async function getRelevantUserMessages(
  currentMessage: string,
  limit: number = 5
): Promise<Array<{ content: string; similarity: number }>> {
  const vectorStore = await initVectorStore();

  const results = await vectorStore.similaritySearch(currentMessage, limit);

  return results.map(doc => ({
    content: doc.pageContent,
    similarity: doc.metadata.score || 0
  }));
}

// Function to analyze user personality from messages
export async function analyzeUserPersonality(messages: string[]): Promise<string> {
  const openai = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  const combinedContent = messages.join('\n');
  const prompt = `Analyze the following user messages and describe their communication style, preferences, and personality traits:\n\n${combinedContent}`;

  // We'll use the embedding model to get a high-level understanding
  const [embedding] = await openai.embedDocuments([prompt]);

  return JSON.stringify({
    embedding,
    messageCount: messages.length,
    lastAnalyzed: new Date().toISOString()
  });
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