import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  email: text("email").unique().notNull(),
  password: text("password").notNull(),
  avatarUrl: text("avatar_url"),
  age: integer("age"),
  city: text("city"),
  isOnline: boolean("is_online").default(false).notNull(),
  hideActivity: boolean("hide_activity").default(false).notNull(),
  timezone: text("timezone").default("UTC").notNull(),
  lastActive: timestamp("last_active").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
});

// Base types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Export schemas for validation
export const insertUserSchema = createInsertSchema(users, {
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
export const selectUserSchema = createSelectSchema(users);

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Document = typeof documents.$inferSelect;

export const documentEmbeddings = pgTable("document_embeddings", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id).notNull(),
  embedding: text("embedding").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  backgroundColor: text("backgroundColor").default("#ffffff"),
  isDirectMessage: boolean("is_direct_message").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Channel = typeof channels.$inferSelect;

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  channelId: integer("channel_id").references(() => channels.id).notNull(),
  parentId: integer("parent_id").references(() => messages.id),
  replyCount: integer("reply_count").default(0).notNull(),
  isAIMessage: boolean("is_ai_message").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect & {
  user: User;
  reactions?: MessageReaction[];
  reads?: MessageRead[];
  attachments?: MessageAttachment[];
};

export const messageReactions = pgTable("message_reactions", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => messages.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MessageReaction = typeof messageReactions.$inferSelect & {
  user: User;
};

export const channelMembers = pgTable("channel_members", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  channelId: integer("channel_id").references(() => channels.id).notNull(),
});

export const userRelations = relations(users, ({ many }) => ({
  messages: many(messages),
  channelMembers: many(channelMembers),
  messageReactions: many(messageReactions),
  directMessageChannels1: many(directMessageChannels, { relationName: "user1" }),
  directMessageChannels2: many(directMessageChannels, { relationName: "user2" }),
}));

export const messageRelations = relations(messages, ({ one, many }) => ({
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
  channel: one(channels, {
    fields: [messages.channelId],
    references: [channels.id],
  }),
  reactions: many(messageReactions),
  reads: many(messageReads),
  attachments: many(messageAttachments),
}));

export const messageReactionRelations = relations(messageReactions, ({ one }) => ({
  message: one(messages, {
    fields: [messageReactions.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [messageReactions.userId],
    references: [users.id],
  }),
}));

export const channelRelations = relations(channels, ({ many }) => ({
  messages: many(messages),
  channelMembers: many(channelMembers),
}));

export const channelMemberRelations = relations(channelMembers, ({ one }) => ({
  user: one(users, {
    fields: [channelMembers.userId],
    references: [users.id],
  }),
  channel: one(channels, {
    fields: [channelMembers.channelId],
    references: [channels.id],
  }),
}));

export const documentRelations = relations(documents, ({ one }) => ({
  user: one(users, {
    fields: [documents.userId],
    references: [users.id],
  }),
}));

export const documentEmbeddingRelations = relations(documentEmbeddings, ({ one }) => ({
  document: one(documents, {
    fields: [documentEmbeddings.documentId],
    references: [documents.id],
  }),
}));


export const insertMessageSchema = createInsertSchema(messages);
export const selectMessageSchema = createSelectSchema(messages);

export const insertMessageReactionSchema = createInsertSchema(messageReactions);
export const selectMessageReactionSchema = createSelectSchema(messageReactions);

export const insertChannelSchema = createInsertSchema(channels);
export const selectChannelSchema = createSelectSchema(channels);

export const channelInvites = pgTable("channel_invites", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").references(() => channels.id).notNull(),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  receiverId: integer("receiver_id").references(() => users.id).notNull(),
  status: text("status").notNull().default('pending'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const friendRequests = pgTable("friend_requests", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  receiverId: integer("receiver_id").references(() => users.id).notNull(),
  status: text("status").notNull().default('pending'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const friends = pgTable("friends", {
  id: serial("id").primaryKey(),
  user1Id: integer("user1_id").references(() => users.id).notNull(),
  user2Id: integer("user2_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const friendRequestRelations = relations(friendRequests, ({ one }) => ({
  sender: one(users, {
    fields: [friendRequests.senderId],
    references: [users.id],
  }),
  receiver: one(users, {
    fields: [friendRequests.receiverId],
    references: [users.id],
  }),
}));

export const channelInviteRelations = relations(channelInvites, ({ one }) => ({
  channel: one(channels, {
    fields: [channelInvites.channelId],
    references: [channels.id],
  }),
  sender: one(users, {
    fields: [channelInvites.senderId],
    references: [users.id],
  }),
  receiver: one(users, {
    fields: [channelInvites.receiverId],
    references: [users.id],
  }),
}));

export const directMessageChannels = pgTable("direct_message_channels", {
  id: serial("id").primaryKey(),
  user1Id: integer("user1_id").references(() => users.id).notNull(),
  user2Id: integer("user2_id").references(() => users.id).notNull(),
  channelId: integer("channel_id").references(() => channels.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const directMessageChannelRelations = relations(directMessageChannels, ({ one }) => ({
  user1: one(users, {
    fields: [directMessageChannels.user1Id],
    references: [users.id],
  }),
  user2: one(users, {
    fields: [directMessageChannels.user2Id],
    references: [users.id],
  }),
  channel: one(channels, {
    fields: [directMessageChannels.channelId],
    references: [channels.id],
  }),
}));

export const insertFriendRequestSchema = createInsertSchema(friendRequests);
export const selectFriendRequestSchema = createSelectSchema(friendRequests);

export const insertChannelInviteSchema = createInsertSchema(channelInvites);
export const selectChannelInviteSchema = createSelectSchema(channelInvites);

export const messageReads = pgTable("message_reads", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => messages.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  readAt: timestamp("read_at").defaultNow().notNull(),
});

export type MessageRead = typeof messageReads.$inferSelect;
export type InsertMessageRead = typeof messageReads.$inferInsert;

export const messageReadRelations = relations(messageReads, ({ one }) => ({
  message: one(messages, {
    fields: [messageReads.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [messageReads.userId],
    references: [users.id],
  }),
}));

export const insertMessageReadSchema = createInsertSchema(messageReads);
export const selectMessageReadSchema = createSelectSchema(messageReads);

export const messageAttachments = pgTable("message_attachments", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => messages.id).notNull(),
  filename: text("filename").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MessageAttachment = typeof messageAttachments.$inferSelect;
export type InsertMessageAttachment = typeof messageAttachments.$inferInsert;

export const messageAttachmentRelations = relations(messageAttachments, ({ one }) => ({
  message: one(messages, {
    fields: [messageAttachments.messageId],
    references: [messages.id],
  }),
}));

export const insertMessageAttachmentSchema = createInsertSchema(messageAttachments);
export const selectMessageAttachmentSchema = createSelectSchema(messageAttachments);

export const insertDocumentSchema = createInsertSchema(documents);
export const selectDocumentSchema = createSelectSchema(documents);

export const insertDocumentEmbeddingSchema = createInsertSchema(documentEmbeddings);
export const selectDocumentEmbeddingSchema = createSelectSchema(documentEmbeddings);

export const suggestionFeedback = pgTable("suggestion_feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  suggestedContent: text("suggested_content").notNull(),
  messageLength: integer("message_length").notNull(),
  wasAccepted: boolean("was_accepted").notNull(),
  channelId: integer("channel_id").references(() => channels.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SuggestionFeedback = typeof suggestionFeedback.$inferSelect;
export type InsertSuggestionFeedback = typeof suggestionFeedback.$inferInsert;

export const suggestionFeedbackRelations = relations(suggestionFeedback, ({ one }) => ({
  user: one(users, {
    fields: [suggestionFeedback.userId],
    references: [users.id],
  }),
  channel: one(channels, {
    fields: [suggestionFeedback.channelId],
    references: [channels.id],
  }),
}));