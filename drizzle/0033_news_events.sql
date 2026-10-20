-- Additive: game records, earned gold and purchases remain unchanged.
CREATE TABLE service_news (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN('notice','update','event')),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 6000),
 status TEXT NOT NULL CHECK(status IN('draft','published','archived')),
 gold INTEGER NOT NULL DEFAULT 0 CHECK(gold BETWEEN 0 AND 10000),
 starts_at INTEGER, ends_at INTEGER,
 revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 CHECK(kind='event' OR gold=0),
 CHECK(kind<>'event' OR (gold>0 AND starts_at IS NOT NULL AND ends_at>starts_at))
);
CREATE INDEX service_news_feed ON service_news(status,created_at DESC);
CREATE TABLE service_gold_claims (
 subject TEXT NOT NULL, account_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('attendance','event')),
 claim_key TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 10000), created_at INTEGER NOT NULL,
 PRIMARY KEY(subject,kind,claim_key)
);
CREATE INDEX service_gold_account ON service_gold_claims(account_id);
CREATE INDEX service_gold_event ON service_gold_claims(kind,claim_key);
INSERT INTO service_news(id,kind,title,body,status,gold,revision,created_at,updated_at)
 SELECT 'legacy-banner','notice','이전 전체 공지',body,'published',0,1,updated_at,updated_at FROM announcements WHERE length(trim(body))>0;
