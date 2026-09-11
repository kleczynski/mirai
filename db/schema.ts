// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(), expiresAt: text("expires_at").notNull(),
  data: text("data").notNull(), revision: integer("revision").notNull().default(0),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (t) => [index("sessions_owner_updated_idx").on(t.ownerId, t.updatedAt)]);
export const demoStates = sqliteTable('demo_states', {
 id:text('id').primaryKey(), sessionId:text('session_id').notNull().references(()=>sessions.id),
 data:text('data').notNull(),revision:integer('revision').notNull().default(1),updatedAt:text('updated_at').notNull(),
});
// Durable admission and usage accounting for paid discovery requests. No bearer or message text.
export const discoveryRequests = sqliteTable('discovery_requests', {
 id: text('id').primaryKey(), sessionId: text('session_id').notNull().references(() => sessions.id),
 fingerprint: text('fingerprint').notNull(), status: text('status').notNull(),
 reservedMicrousd: integer('reserved_microusd').notNull(), chargedMicrousd: integer('charged_microusd'),
 createdAt: integer('created_at').notNull(), metadata: text('metadata').notNull().default('{}'),
}, t => [index('discovery_requests_session_idx').on(t.sessionId, t.createdAt)]);
