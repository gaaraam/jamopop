import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  unique,
  primaryKey,
  foreignKey,
  check,
} from 'drizzle-orm/sqlite-core';

// The migrations define triggers for derived records, rewards and deletion guards.

export const members = sqliteTable(
  'members',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    name: text('name').notNull(),
    avatar: text('avatar').notNull(),
    lastSeen: integer('last_seen').notNull(),
    practiceId: text('practice_id'),
    blocked: integer('blocked').notNull().default(0),
    accountId: text('account_id'),
    lastActive: integer('last_active').notNull().default(0),
    spectator: integer('spectator').notNull().default(0),
    chatSeen: integer('chat_seen').notNull().default(0),
    skinId: text('skin_id'),
  },
  (t) => [
    uniqueIndex('members_room_token').on(t.roomId, t.tokenHash),
    uniqueIndex('members_room_name').on(t.roomId, t.name),
    uniqueIndex('members_room_account').on(t.roomId, t.accountId),
    index('members_account_seen').on(t.accountId, sql`${t.lastSeen} desc`),
    index('members_unlinked_token')
      .on(t.tokenHash)
      .where(sql`account_id IS NULL`),
  ],
);

export const plays = sqliteTable(
  'plays',
  {
    id: text('id').primaryKey(),
    roundId: text('round_id').notNull(),
    memberId: text('member_id').notNull(),
    guesses: text('guesses').notNull().default('[]'),
    status: text('status').notNull().default('playing'),
    finishedAt: integer('finished_at'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('plays_round_member').on(t.roundId, t.memberId),
    index('plays_member_status').on(t.memberId, t.status, t.roundId),
  ],
);

export const reactions = sqliteTable(
  'reactions',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id').notNull(),
    memberId: text('member_id').notNull(),
    emoji: text('emoji').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('reactions_room_time').on(t.roomId, t.createdAt)],
);

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  hostId: text('host_id').notNull(),
  liveId: text('live_id'),
  createdAt: integer('created_at').notNull(),
  currentRoundId: text('current_round_id'),
  roundNo: integer('round_no').notNull().default(0),
  inviteCode: text('invite_code'),
  archivedAt: integer('archived_at'),
  activeSpeedId: text('active_speed_id'),
  passwordHash: text('password_hash'),
});

export const rounds = sqliteTable(
  'rounds',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id').notNull(),
    mode: text('mode').notNull(),
    answer: text('answer').notNull(),
    startsAt: integer('starts_at').notNull(),
    endsAt: integer('ends_at'),
    ownerId: text('owner_id'),
    retiredAt: integer('retired_at'),
    width: integer('width').notNull().default(5),
    phase: text('phase').notNull().default('running'),
    restricted: integer('restricted').notNull().default(0),
    dictionaryVersion: integer('dictionary_version').notNull().default(0),
    variant: text('variant').notNull().default('normal'),
    hintPolicy: integer('hint_policy').notNull().default(0),
  },
  (t) => [index('rounds_room').on(t.roomId)],
);

export const liveParticipants = sqliteTable(
  'live_participants',
  {
    roundId: text('round_id').notNull(),
    memberId: text('member_id').notNull(),
    ready: integer('ready').notNull().default(0),
  },
  (t) => [uniqueIndex('live_participants_round_member').on(t.roundId, t.memberId)],
);

export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    roomId: text('room_id').notNull(),
    memberId: text('member_id').notNull(),
    requestId: text('request_id').notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
    deleted: integer('deleted').notNull().default(0),
    channel: text('channel').notNull().default('player'),
    system: integer('system').notNull().default(0),
  },
  (t) => [
    index('chat_room_id').on(t.roomId, t.id),
    index('chat_member_time').on(t.memberId, t.createdAt),
    uniqueIndex('chat_member_request').on(t.memberId, t.requestId),
  ],
);

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  avatar: text('avatar').notNull(),
  createdAt: integer('created_at').notNull(),
  skinId: text('skin_id'),
});

export const accountCosmetics = sqliteTable('account_cosmetics', {
  accountId: text('account_id').primaryKey(),
  nameColor: text('name_color').notNull().default('default'),
  avatarFrame: text('avatar_frame').notNull().default('none'),
});

export const soloProgress = sqliteTable('solo_progress', {
  owner: text('owner').primaryKey(),
  state: text('state').notNull(),
  revision: integer('revision').notNull().default(0),
});

export const soloRuns = sqliteTable(
  'solo_runs',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    stage: integer('stage').notNull(),
    status: text('status').notNull(),
    attempts: integer('attempts').notNull(),
    stars: integer('stars').notNull(),
    startedAt: integer('started_at').notNull(),
    endsAt: integer('ends_at'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('solo_runs_owner').on(t.owner), index('solo_runs_updated').on(t.updatedAt)],
);

export const inquiries = sqliteTable(
  'inquiries',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    requestId: text('request_id').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull().default('new'),
    answer: text('answer').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    revision: integer('revision').notNull().default(0),
  },
  (t) => [
    uniqueIndex('inquiries_owner_request').on(t.owner, t.requestId),
    index('inquiries_owner_created').on(t.owner, t.createdAt),
    index('inquiries_updated').on(t.updatedAt),
  ],
);

export const lobbyMessages = sqliteTable(
  'lobby_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    owner: text('owner').notNull(),
    requestId: text('request_id').notNull(),
    name: text('name').notNull(),
    avatar: text('avatar').notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
    deleted: integer('deleted').notNull().default(0),
  },
  (t) => [
    uniqueIndex('lobby_message_request').on(t.owner, t.requestId),
    index('lobby_message_time').on(t.owner, t.createdAt),
  ],
);

export const announcements = sqliteTable('announcements', {
  id: integer('id').primaryKey(),
  body: text('body').notNull(),
  active: integer('active').notNull().default(0),
  revision: integer('revision').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const drawingHints = sqliteTable(
  'drawing_hints',
  {
    roundId: text('round_id').notNull(),
    memberId: text('member_id').notNull(),
    strokes: text('strokes').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('hint_round_member').on(t.roundId, t.memberId)],
);

export const earnedTitles = sqliteTable(
  'earned_titles',
  {
    owner: text('owner').notNull(),
    title: text('title').notNull(),
    earnedAt: integer('earned_at').notNull(),
  },
  (t) => [uniqueIndex('earned_title_owner').on(t.owner, t.title)],
);

export const equippedTitles = sqliteTable('equipped_titles', {
  owner: text('owner').primaryKey(),
  title: text('title').notNull(),
});

export const itemEvents = sqliteTable(
  'item_events',
  {
    id: text('id').primaryKey(),
    roundId: text('round_id').notNull(),
    actor: text('actor').notNull(),
    target: text('target').notNull(),
    kind: text('kind').notNull(),
    effect: text('effect').notNull(),
    applied: integer('applied').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('item_events_round').on(t.roundId, t.createdAt)],
);

export const itemLoadouts = sqliteTable(
  'item_loadouts',
  {
    roundId: text('round_id').notNull(),
    memberId: text('member_id').notNull(),
    endsAt: integer('ends_at').notNull(),
    attackUsed: integer('attack_used').notNull().default(0),
    support: text('support').notNull(),
    supportUsed: integer('support_used').notNull().default(0),
    defense: text('defense').notNull().default(''),
    damage: integer('damage').notNull().default(0),
    protectedUntil: integer('protected_until').notNull().default(0),
    revision: integer('revision').notNull().default(0),
  },
  (t) => [uniqueIndex('loadout_round_member').on(t.roundId, t.memberId)],
);

export const spectators = sqliteTable(
  'spectators',
  {
    roundId: text('round_id').notNull(),
    memberId: text('member_id').notNull(),
  },
  (t) => [uniqueIndex('spectator_round_member').on(t.roundId, t.memberId)],
);

export const hintViews = sqliteTable(
  'hint_views',
  {
    roundId: text('round_id').notNull(),
    memberId: text('member_id').notNull(),
    viewedAt: integer('viewed_at').notNull(),
  },
  (t) => [uniqueIndex('hint_view_round_member').on(t.roundId, t.memberId)],
);

export const googleOauthAttempts = sqliteTable(
  'google_oauth_attempts',
  {
    stateHash: text('state_hash').primaryKey(),
    browserHash: text('browser_hash').notNull(),
    nonce: text('nonce').notNull(),
    expiresAt: integer('expires_at').notNull(),
    returnPath: text('return_path').notNull().default('/?lobby=1'),
  },
  (t) => [index('google_oauth_expiry').on(t.expiresAt)],
);

export const googleAccounts = sqliteTable(
  'google_accounts',
  {
    subject: text('subject').primaryKey(),
    gameAccountId: text('game_account_id').notNull(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    createdAt: integer('created_at').notNull(),
    lastLoginAt: integer('last_login_at').notNull(),
    approvalStatus: text('approval_status').notNull().default('pending'),
    approvalRevision: integer('approval_revision').notNull().default(0),
    reviewedAt: integer('reviewed_at'),
    reviewedBy: text('reviewed_by'),
  },
  (t) => [
    unique().on(t.gameAccountId),
    index('google_accounts_approval').on(t.approvalStatus, t.createdAt),
    check('google_accounts_check_1', sql`approval_status IN ('pending','approved','rejected')`),
  ],
);

export const googleSessions = sqliteTable(
  'google_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    subject: text('subject').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [
    index('google_session_expiry').on(t.expiresAt),
    foreignKey({ columns: [t.subject], foreignColumns: [googleAccounts.subject] }),
  ],
);

export const linkedGameAccounts = sqliteTable(
  'linked_game_accounts',
  {
    accountId: text('account_id').primaryKey(),
    subject: text('subject').notNull(),
    label: text('label').notNull().default(''),
    isAdmin: integer('is_admin').notNull().default(0),
    linkedAt: integer('linked_at').notNull(),
  },
  (t) => [index('linked_game_accounts_subject').on(t.subject)],
);

export const legacyLinkAttempts = sqliteTable('legacy_link_attempts', {
  challenge: text('challenge').primaryKey(),
  subject: text('subject').notNull(),
  browserHash: text('browser_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const legacyLinkReceipts = sqliteTable('legacy_link_receipts', {
  ticketId: text('ticket_id').primaryKey(),
  accountId: text('account_id').notNull(),
  subject: text('subject').notNull(),
  linkedAt: integer('linked_at').notNull(),
});

export const derivedRevision = sqliteTable('derived_revision', {
  id: integer('id').primaryKey(),
  version: integer('version').notNull(),
});

export const speedRounds = sqliteTable(
  'speed_rounds',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id').notNull(),
    theme: text('theme').notNull(),
    answers: text('answers').notNull(),
    startsAt: integer('starts_at').notNull(),
    endsAt: integer('ends_at').notNull(),
  },
  (t) => [index('speed_room_time').on(t.roomId, sql`${t.startsAt} desc`)],
);

export const speedPlays = sqliteTable(
  'speed_plays',
  {
    roundId: text('round_id').notNull(),
    memberId: text('member_id').notNull(),
    state: text('state').notNull(),
    revision: integer('revision').notNull().default(0),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roundId, t.memberId] })],
);

export const friendships = sqliteTable(
  'friendships',
  {
    id: text('id').primaryKey(),
    requester: text('requester').notNull(),
    recipient: text('recipient').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('friendships_pair').on(
      sql`min(requester,recipient)`,
      sql`max(requester,recipient)`,
    ),
    index('friendships_recipient').on(t.recipient, t.status),
    index('friendships_requester').on(t.requester, t.status),
    check('friendships_check_1', sql`status IN('pending','accepted','declined')`),
    check('friendships_check_2', sql`requester<>recipient`),
  ],
);

export const accountPresence = sqliteTable('account_presence', {
  accountId: text('account_id').primaryKey(),
  lastSeen: integer('last_seen').notNull(),
});

export const roomInvitations = sqliteTable(
  'room_invitations',
  {
    id: text('id').primaryKey(),
    sender: text('sender').notNull(),
    recipient: text('recipient').notNull(),
    roomId: text('room_id').notNull(),
    status: text('status').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [
    unique().on(t.sender, t.recipient, t.roomId),
    index('room_invitations_inbox').on(t.recipient, t.status, t.expiresAt),
    index('room_invitations_sender').on(t.sender, t.createdAt),
    check('room_invitations_check_1', sql`status IN ('pending','accepted','dismissed')`),
    check('room_invitations_check_2', sql`sender<>recipient`),
  ],
);

export const goldRewards = sqliteTable(
  'gold_rewards',
  {
    playId: text('play_id').primaryKey(),
    memberId: text('member_id').notNull(),
    amount: integer('amount').notNull(),
    won: integer('won').notNull(),
    day: text('day').notNull(),
  },
  (t) => [
    index('gold_rewards_member').on(t.memberId),
    check('gold_rewards_check_1', sql`amount IN(10,30)`),
  ],
);

export const skinPurchases = sqliteTable(
  'skin_purchases',
  {
    accountId: text('account_id').notNull(),
    skinId: text('skin_id').notNull(),
    price: integer('price').notNull(),
    purchasedAt: integer('purchased_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.skinId] }),
    check('skin_purchases_check_1', sql`price>=0`),
  ],
);

export const equippedCardSkins = sqliteTable(
  'equipped_card_skins',
  {
    accountId: text('account_id').primaryKey(),
    skinId: text('skin_id').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.accountId, t.skinId],
      foreignColumns: [skinPurchases.accountId, skinPurchases.skinId],
    }),
  ],
);

export const roomJoinAttempts = sqliteTable(
  'room_join_attempts',
  {
    roomId: text('room_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    window: integer('window').notNull(),
    attempts: integer('attempts').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.fingerprint] })],
);

export const kongalHomes = sqliteTable('kongal_homes', {
  accountId: text('account_id').primaryKey(),
  layout: text('layout').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: integer('updated_at').notNull(),
});

export const homeCare = sqliteTable(
  'home_care',
  {
    accountId: text('account_id').notNull(),
    day: text('day').notNull(),
    action: text('action').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.day, t.action] }),
    check('home_care_check_1', sql`action IN ('pet','snack','play','visit')`),
  ],
);

export const homeVisits = sqliteTable(
  'home_visits',
  {
    owner: text('owner').notNull(),
    visitor: text('visitor').notNull(),
    day: text('day').notNull(),
    stamp: text('stamp').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.owner, t.visitor, t.day] }),
    index('home_visits_recent').on(t.owner, sql`${t.createdAt} desc`),
    check('home_visits_check_1', sql`stamp IN ('heart','paw','star')`),
  ],
);

export const safetyBlocks = sqliteTable(
  'safety_blocks',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    target: text('target').notNull(),
    targetAlias: text('target_alias'),
    name: text('name').notNull(),
    mode: text('mode').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    unique().on(t.owner, t.target),
    index('safety_blocks_target').on(t.target),
    index('safety_blocks_alias').on(t.targetAlias),
    check('safety_blocks_check_1', sql`mode IN ('block','mute')`),
  ],
);

export const safetyReports = sqliteTable(
  'safety_reports',
  {
    id: text('id').primaryKey(),
    reporter: text('reporter').notNull(),
    requestId: text('request_id').notNull(),
    kind: text('kind').notNull(),
    reference: text('reference').notNull(),
    subject: text('subject').notNull(),
    subjectAlias: text('subject_alias'),
    name: text('name').notNull(),
    reason: text('reason').notNull(),
    details: text('details').notNull(),
    evidence: text('evidence').notNull(),
    status: text('status').notNull().default('new'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    revision: integer('revision').notNull().default(0),
    lastAction: text('last_action'),
  },
  (t) => [
    unique().on(t.reporter, t.requestId),
    unique().on(t.reporter, t.kind, t.reference),
    index('safety_reports_status').on(t.status, sql`${t.updatedAt} desc`),
    check('safety_reports_check_1', sql`status IN ('new','reviewing','closed')`),
  ],
);

export const safetyRestrictions = sqliteTable(
  'safety_restrictions',
  {
    subject: text('subject').primaryKey(),
    kind: text('kind').notNull(),
    reason: text('reason').notNull(),
    expiresAt: integer('expires_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [check('safety_restrictions_check_1', sql`kind IN ('warn','chat_mute','suspend')`)],
);

export const safetyActions = sqliteTable(
  'safety_actions',
  {
    id: text('id').primaryKey(),
    reportId: text('report_id').notNull(),
    actor: text('actor').notNull(),
    kind: text('kind').notNull(),
    reason: text('reason').notNull(),
    expiresAt: integer('expires_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('safety_actions_report').on(t.reportId, t.createdAt)],
);

export const safetyRate = sqliteTable(
  'safety_rate',
  {
    key: text('key').primaryKey(),
    hits: integer('hits').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('safety_rate_expiry').on(t.expiresAt)],
);

export const dailyPuzzles = sqliteTable('daily_puzzles', {
  day: text('day').primaryKey(),
  answer: text('answer').notNull(),
  resetsAt: integer('resets_at').notNull(),
  dictionaryVersion: integer('dictionary_version').notNull().default(1),
});

export const dailyPlays = sqliteTable(
  'daily_plays',
  {
    owner: text('owner').notNull(),
    day: text('day').notNull(),
    guesses: text('guesses').notNull().default('[]'),
    status: text('status').notNull().default('playing'),
    revision: integer('revision').notNull().default(0),
    finishedAt: integer('finished_at'),
  },
  (t) => [
    primaryKey({ columns: [t.owner, t.day] }),
    foreignKey({ columns: [t.day], foreignColumns: [dailyPuzzles.day] }),
    check('daily_plays_check_1', sql`status IN ('playing','won','lost')`),
  ],
);

export const deletionPreviews = sqliteTable('deletion_previews', {
  id: text('id').primaryKey(),
  inquiryId: text('inquiry_id').notNull(),
  actor: text('actor').notNull(),
  snapshot: text('snapshot').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const deletionAudit = sqliteTable(
  'deletion_audit',
  {
    inquiryId: text('inquiry_id').primaryKey(),
    actor: text('actor').notNull(),
    completedAt: integer('completed_at').notNull(),
    counts: text('counts').notNull(),
    valid: integer('valid').notNull(),
  },
  (t) => [check('deletion_audit_check_1', sql`valid=1`)],
);

export const deletionReceipts = sqliteTable(
  'deletion_receipts',
  {
    tokenHash: text('token_hash').primaryKey(),
    inquiryId: text('inquiry_id').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('deletion_receipt_inquiry').on(t.inquiryId)],
);

export const deletedIdentifiers = sqliteTable(
  'deleted_identifiers',
  {
    kind: text('kind').notNull(),
    value: text('value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.value] })],
);

export const productEvents = sqliteTable(
  'product_events',
  {
    id: text('id').primaryKey(),
    run: text('run').notNull(),
    mode: text('mode').notNull(),
    name: text('name').notNull(),
    outcome: text('outcome'),
    day: text('day').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [
    unique().on(t.run, t.mode, t.name),
    index('product_events_expiry').on(t.expiresAt),
    index('product_events_time').on(t.createdAt, t.mode),
    check(
      'product_events_check_1',
      sql`mode IN ('home','lobby','hub','daily','word','exit','stack','toktok','room','practice','speed')`,
    ),
    check(
      'product_events_check_2',
      sql`name IN ('view','start','first_action','complete','retry','next')`,
    ),
    check('product_events_check_3', sql`outcome IN ('won','lost','timeout','abandoned')`),
  ],
);

export const serviceNews = sqliteTable(
  'service_news',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull(),
    gold: integer('gold').notNull().default(0),
    startsAt: integer('starts_at'),
    endsAt: integer('ends_at'),
    revision: integer('revision').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('service_news_feed').on(t.status, sql`${t.createdAt} desc`),
    check('service_news_check_1', sql`kind IN('notice','update','event')`),
    check('service_news_check_2', sql`length(title) BETWEEN 1 AND 80`),
    check('service_news_check_3', sql`length(body) BETWEEN 1 AND 6000`),
    check('service_news_check_4', sql`status IN('draft','published','archived')`),
    check('service_news_check_5', sql`gold BETWEEN 0 AND 10000`),
    check('service_news_check_6', sql`kind='event' OR gold=0`),
    check(
      'service_news_check_7',
      sql`kind<>'event' OR (gold>0 AND starts_at IS NOT NULL AND ends_at>starts_at)`,
    ),
  ],
);

export const serviceGoldClaims = sqliteTable(
  'service_gold_claims',
  {
    subject: text('subject').notNull(),
    accountId: text('account_id').notNull(),
    kind: text('kind').notNull(),
    claimKey: text('claim_key').notNull(),
    amount: integer('amount').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.subject, t.kind, t.claimKey] }),
    index('service_gold_account').on(t.accountId),
    index('service_gold_event').on(t.kind, t.claimKey),
    check('service_gold_claims_check_1', sql`kind IN('attendance','event')`),
    check('service_gold_claims_check_2', sql`amount BETWEEN 1 AND 10000`),
  ],
);
