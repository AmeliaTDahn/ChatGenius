import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  isOnline: boolean("is_online").default(false).notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  city: text("city"),
  timezone: text("timezone").notNull(),
  age: integer("age"),
  avatarUrl: text("avatar_url"),
  isProfileComplete: boolean("is_profile_complete").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Define base types first
export type User = typeof users.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

// Then extend User type to include optional profile
export type UserWithProfile = User & {
  profile?: UserProfile;
};

// Relations
export const userRelations = relations(users, ({ one }) => ({
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),
}));

// Export schemas for validation
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertUserProfileSchema = createInsertSchema(userProfiles);
export const selectUserProfileSchema = createSelectSchema(userProfiles);

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isDirectMessage: boolean("is_direct_message").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Base types
export type Channel = typeof channels.$inferSelect;


export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  channelId: integer("channel_id").references(() => channels.id).notNull(),
  parentId: integer("parent_id").references(() => messages.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect & {
  user: User;
  replies?: (Message & { user: User })[];
  reactions?: MessageReaction[];
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

export const friendRequests = pgTable("friend_requests", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  receiverId: integer("receiver_id").references(() => users.id).notNull(),
  status: text("status").notNull().default('pending'), // pending, accepted, rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const friends = pgTable("friends", {
  id: serial("id").primaryKey(),
  user1Id: integer("user1_id").references(() => users.id).notNull(),
  user2Id: integer("user2_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const channelInvites = pgTable("channel_invites", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").references(() => channels.id).notNull(),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  receiverId: integer("receiver_id").references(() => users.id).notNull(),
  status: text("status").notNull().default('pending'), // pending, accepted, rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const channelRelations = relations(channels, ({ many }) => ({
  messages: many(messages),
  channelMembers: many(channelMembers),
  channelInvites: many(channelInvites),
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
  parentMessage: one(messages, {
    fields: [messages.parentId],
    references: [messages.id],
  }),
  replies: many(messages, { relationName: "message_replies" }),
  reactions: many(messageReactions),
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

// Export schemas for validation

export const insertChannelSchema = createInsertSchema(channels);
export const selectChannelSchema = createSelectSchema(channels);

export const insertMessageSchema = createInsertSchema(messages);
export const selectMessageSchema = createSelectSchema(messages);

export const insertMessageReactionSchema = createInsertSchema(messageReactions);
export const selectMessageReactionSchema = createSelectSchema(messageReactions);

export const insertFriendRequestSchema = createInsertSchema(friendRequests);
export const selectFriendRequestSchema = createSelectSchema(friendRequests);

export const insertChannelInviteSchema = createInsertSchema(channelInvites);
export const selectChannelInviteSchema = createSelectSchema(channelInvites);