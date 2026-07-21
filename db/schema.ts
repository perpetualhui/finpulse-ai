import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const newsSnapshots = sqliteTable("news_snapshots", {
  id: text("id").primaryKey(),
  issue: text("issue").notNull(),
  updatedAt: text("updated_at").notNull(),
  payload: text("payload").notNull(),
});
