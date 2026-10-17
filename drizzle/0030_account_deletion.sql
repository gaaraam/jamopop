-- Additive only. No existing user rows are changed by this migration.
CREATE TABLE deletion_previews (
 id TEXT PRIMARY KEY, inquiry_id TEXT NOT NULL, actor TEXT NOT NULL,
 snapshot TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE deletion_audit (
 inquiry_id TEXT PRIMARY KEY, actor TEXT NOT NULL, completed_at INTEGER NOT NULL,
 counts TEXT NOT NULL, valid INTEGER NOT NULL CHECK(valid=1)
);
CREATE TABLE deletion_receipts (
 token_hash TEXT PRIMARY KEY, inquiry_id TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX deletion_receipt_inquiry ON deletion_receipts(inquiry_id);
-- Minimal technical tombstones prevent stale writes and old profile re-linking.
-- No names, emails, credentials or mapping to an audit/Google identity are stored here.
CREATE TABLE deleted_identifiers (kind TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,value));
CREATE TRIGGER deletion_guard_profiles_insert BEFORE INSERT ON profiles WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_profiles_update BEFORE UPDATE ON profiles WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_account_cosmetics_insert BEFORE INSERT ON account_cosmetics WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.account_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_account_cosmetics_update BEFORE UPDATE ON account_cosmetics WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.account_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_skin_purchases_insert BEFORE INSERT ON skin_purchases WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.account_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_skin_purchases_update BEFORE UPDATE ON skin_purchases WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.account_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_equipped_card_skins_insert BEFORE INSERT ON equipped_card_skins WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.account_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_equipped_card_skins_update BEFORE UPDATE ON equipped_card_skins WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.account_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_kongal_homes_insert BEFORE INSERT ON kongal_homes WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.account_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_kongal_homes_update BEFORE UPDATE ON kongal_homes WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.account_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_home_care_insert BEFORE INSERT ON home_care WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.account_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_home_care_update BEFORE UPDATE ON home_care WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.account_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_account_presence_insert BEFORE INSERT ON account_presence WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.account_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_account_presence_update BEFORE UPDATE ON account_presence WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.account_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_linked_game_accounts_insert BEFORE INSERT ON linked_game_accounts WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.account_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_linked_game_accounts_update BEFORE UPDATE ON linked_game_accounts WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.account_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_members_insert BEFORE INSERT ON members WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.account_id) OR EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_members_update BEFORE UPDATE ON members WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.account_id) OR EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_solo_progress_insert BEFORE INSERT ON solo_progress WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value=NEW.owner) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_solo_progress_update BEFORE UPDATE ON solo_progress WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value=NEW.owner) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_solo_runs_insert BEFORE INSERT ON solo_runs WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value=NEW.owner) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_solo_runs_update BEFORE UPDATE ON solo_runs WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value=NEW.owner) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_earned_titles_insert BEFORE INSERT ON earned_titles WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value=NEW.owner) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_earned_titles_update BEFORE UPDATE ON earned_titles WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value=NEW.owner) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_equipped_titles_insert BEFORE INSERT ON equipped_titles WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value=NEW.owner) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_equipped_titles_update BEFORE UPDATE ON equipped_titles WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value=NEW.owner) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_lobby_messages_insert BEFORE INSERT ON lobby_messages WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value=NEW.owner) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_lobby_messages_update BEFORE UPDATE ON lobby_messages WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value=NEW.owner) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_daily_plays_insert BEFORE INSERT ON daily_plays WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value=NEW.owner) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_daily_plays_update BEFORE UPDATE ON daily_plays WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value=NEW.owner) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_inquiries_insert BEFORE INSERT ON inquiries WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value=NEW.owner) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_inquiries_update BEFORE UPDATE ON inquiries WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value=NEW.owner) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_plays_insert BEFORE INSERT ON plays WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_plays_update BEFORE UPDATE ON plays WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_speed_plays_insert BEFORE INSERT ON speed_plays WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_speed_plays_update BEFORE UPDATE ON speed_plays WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_chat_messages_insert BEFORE INSERT ON chat_messages WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_chat_messages_update BEFORE UPDATE ON chat_messages WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_drawing_hints_insert BEFORE INSERT ON drawing_hints WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_drawing_hints_update BEFORE UPDATE ON drawing_hints WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_gold_rewards_insert BEFORE INSERT ON gold_rewards WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_gold_rewards_update BEFORE UPDATE ON gold_rewards WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_reactions_insert BEFORE INSERT ON reactions WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_reactions_update BEFORE UPDATE ON reactions WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_live_participants_insert BEFORE INSERT ON live_participants WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_live_participants_update BEFORE UPDATE ON live_participants WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_item_loadouts_insert BEFORE INSERT ON item_loadouts WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_item_loadouts_update BEFORE UPDATE ON item_loadouts WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_spectators_insert BEFORE INSERT ON spectators WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_spectators_update BEFORE UPDATE ON spectators WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_hint_views_insert BEFORE INSERT ON hint_views WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_hint_views_update BEFORE UPDATE ON hint_views WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value=NEW.member_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_friendships_insert BEFORE INSERT ON friendships WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.requester) OR EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.recipient) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_friendships_update BEFORE UPDATE ON friendships WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.requester) OR EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.recipient) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_room_invitations_insert BEFORE INSERT ON room_invitations WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.sender) OR EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.recipient) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_room_invitations_update BEFORE UPDATE ON room_invitations WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.sender) OR EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.recipient) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_home_visits_insert BEFORE INSERT ON home_visits WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.owner) OR EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.visitor) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_home_visits_update BEFORE UPDATE ON home_visits WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.owner) OR EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.visitor) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_google_accounts_insert BEFORE INSERT ON google_accounts WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.game_account_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_google_accounts_update BEFORE UPDATE ON google_accounts WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='account' AND value=NEW.game_account_id) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_item_events_insert BEFORE INSERT ON item_events WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value IN(NEW.actor,NEW.target)) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_item_events_update BEFORE UPDATE ON item_events WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='member' AND value IN(NEW.actor,NEW.target)) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_audit_no_update BEFORE UPDATE ON deletion_audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_AUDIT'); END;
CREATE TRIGGER deletion_audit_no_delete BEFORE DELETE ON deletion_audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_AUDIT'); END;
CREATE TRIGGER deletion_guard_reports_insert BEFORE INSERT ON safety_reports WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value IN(NEW.reporter,NEW.subject,NEW.subject_alias)) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_reports_update BEFORE UPDATE ON safety_reports WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value IN(NEW.reporter,NEW.subject,NEW.subject_alias)) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_blocks_insert BEFORE INSERT ON safety_blocks WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value IN(NEW.owner,NEW.target,NEW.target_alias)) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
CREATE TRIGGER deletion_guard_blocks_update BEFORE UPDATE ON safety_blocks WHEN EXISTS(SELECT 1 FROM deleted_identifiers WHERE kind='owner' AND value IN(NEW.owner,NEW.target,NEW.target_alias)) BEGIN SELECT RAISE(ABORT,'ACCOUNT_DELETED'); END;
