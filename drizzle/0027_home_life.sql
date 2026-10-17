CREATE TABLE home_care (
 account_id TEXT NOT NULL,
 day TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('pet','snack','play','visit')),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(account_id,day,action)
);
CREATE TABLE home_visits (
 owner TEXT NOT NULL,
 visitor TEXT NOT NULL,
 day TEXT NOT NULL,
 stamp TEXT NOT NULL CHECK(stamp IN ('heart','paw','star')),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(owner,visitor,day)
);
CREATE INDEX home_visits_recent ON home_visits(owner,created_at DESC);
