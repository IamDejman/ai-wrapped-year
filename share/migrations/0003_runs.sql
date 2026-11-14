-- One row per day and version: how many times the command ran, and how many of those were a machine's first.
-- Nothing about who ran it: no ids, addresses or times.
CREATE TABLE runs (
  day TEXT NOT NULL,
  version TEXT NOT NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  firsts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, version)
);
