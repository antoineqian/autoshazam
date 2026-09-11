import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  real,
  boolean,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeProductId: text('stripe_product_id'),
  planName: varchar('plan_name', { length: 50 }),
  subscriptionStatus: varchar('subscription_status', { length: 20 }),
});

export const teamMembers = pgTable('team_members', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  role: varchar('role', { length: 50 }).notNull(),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

/**
 * One analysis run: a single file or URL scanned at a chosen interval. Tracks
 * point at the run they were detected in so the library can group by it.
 */
export const sources = pgTable('sources', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  userId: integer('user_id').references(() => users.id),
  // 'file' | 'url' | 'unknown' ('unknown' covers rows recorded before runs
  // were tracked, which are grouped by detection time instead).
  kind: varchar('kind', { length: 20 }).notNull().default('unknown'),
  label: varchar('label', { length: 512 }).notNull(),
  url: text('url'),
  intervalMinutes: integer('interval_minutes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const tracks = pgTable('tracks', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  userId: integer('user_id').references(() => users.id),
  // Nullable: rows predating source tracking keep working, and the backfill
  // assigns them a synthesised 'unknown' run.
  sourceId: integer('source_id').references(() => sources.id),
  title: varchar('title', { length: 255 }).notNull(),
  subtitle: varchar('subtitle', { length: 255 }).notNull(),
  position: real('position').notNull(),
  fileIndex: integer('file_index').notNull().default(0),
  url: text('url'),
  uri: text('uri'),
  // Whether this track has been added to the user's own collection. Held per
  // row but kept identical across every row of the same track, since owning a
  // file is a fact about the track, not about the mix it turned up in.
  downloaded: boolean('downloaded').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  invitedBy: integer('invited_by')
    .notNull()
    .references(() => users.id),
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
});

/** Soulseek search preferences, one row per team; defaults apply when absent. */
export const downloadPreferences = pgTable('download_preferences', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id)
    .unique(),
  formatPriority: jsonb('format_priority')
    .$type<string[]>()
    .notNull()
    .default(['flac', 'mp3']),
  // null = any bitrate
  minMp3Bitrate: integer('min_mp3_bitrate'),
  autoDownload: boolean('auto_download').notNull().default(true),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * One file fetched from Soulseek. Keyed by title and subtitle like the
 * `downloaded` flag, so any row of that track can point at where the file is.
 */
export const downloads = pgTable('downloads', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  sourceId: integer('source_id').references(() => sources.id),
  title: varchar('title', { length: 255 }).notNull(),
  subtitle: varchar('subtitle', { length: 255 }).notNull(),
  localPath: text('local_path').notNull(),
  remoteUser: varchar('remote_user', { length: 255 }),
  format: varchar('format', { length: 10 }),
  bitrate: integer('bitrate'),
  matchScore: real('match_score'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const teamsRelations = relations(teams, ({ many }) => ({
  teamMembers: many(teamMembers),
  activityLogs: many(activityLogs),
  invitations: many(invitations),
  tracks: many(tracks),
  downloads: many(downloads),
}));

export const downloadPreferencesRelations = relations(
  downloadPreferences,
  ({ one }) => ({
    team: one(teams, {
      fields: [downloadPreferences.teamId],
      references: [teams.id],
    }),
  })
);

export const downloadsRelations = relations(downloads, ({ one }) => ({
  team: one(teams, {
    fields: [downloads.teamId],
    references: [teams.id],
  }),
  source: one(sources, {
    fields: [downloads.sourceId],
    references: [sources.id],
  }),
}));

export const sourcesRelations = relations(sources, ({ one, many }) => ({
  team: one(teams, {
    fields: [sources.teamId],
    references: [teams.id],
  }),
  tracks: many(tracks),
}));

export const tracksRelations = relations(tracks, ({ one }) => ({
  team: one(teams, {
    fields: [tracks.teamId],
    references: [teams.id],
  }),
  source: one(sources, {
    fields: [tracks.sourceId],
    references: [sources.id],
  }),
  user: one(users, {
    fields: [tracks.userId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  teamMembers: many(teamMembers),
  invitationsSent: many(invitations),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  team: one(teams, {
    fields: [invitations.teamId],
    references: [teams.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  team: one(teams, {
    fields: [activityLogs.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type TrackWithSource = Track & { source: Source | null };
export type DownloadPreferencesRow = typeof downloadPreferences.$inferSelect;
export type NewDownloadPreferences = typeof downloadPreferences.$inferInsert;
export type Download = typeof downloads.$inferSelect;
export type NewDownload = typeof downloads.$inferInsert;
export type TeamDataWithMembers = Team & {
  teamMembers: (TeamMember & {
    user: Pick<User, 'id' | 'name' | 'email'>;
  })[];
};

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
}
