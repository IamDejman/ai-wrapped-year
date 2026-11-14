-- One row per day and version: how many times the command ran.
CREATE TABLE runs (
  day TEXT NOT NULL,
  version TEXT NOT NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, version)
);
-- One row per day and machine that ran it, to count the people behind the runs.
-- The id is random and made only for this: no addresses or times, and nothing ties it to a wrap's totals.
CREATE TABLE seen (
  day TEXT NOT NULL,
  id TEXT NOT NULL,
  PRIMARY KEY (day, id)
);
