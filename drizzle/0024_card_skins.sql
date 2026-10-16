-- Separate slot; character skins and historical game records are unchanged.
CREATE TABLE equipped_card_skins (
 account_id TEXT PRIMARY KEY,
 skin_id TEXT NOT NULL,
 FOREIGN KEY(account_id,skin_id) REFERENCES skin_purchases(account_id,skin_id)
);
