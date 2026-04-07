-- Migration: initial schema
CREATE TABLE "Church" (
  "id"           INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name"         TEXT NOT NULL,
  "nameNorm"     TEXT NOT NULL,
  "address"      TEXT,
  "city"         TEXT,
  "state"        TEXT,
  "zip"          TEXT,
  "lat"          REAL NOT NULL,
  "lng"          REAL NOT NULL,
  "phone"        TEXT,
  "email"        TEXT,
  "website"      TEXT,
  "isSbc"        INTEGER NOT NULL DEFAULT 0,
  "isFounders"   INTEGER NOT NULL DEFAULT 0,
  "isNineMarks"  INTEGER NOT NULL DEFAULT 0,
  "sbcId"        TEXT UNIQUE,
  "foundersId"   TEXT UNIQUE,
  "nineMarksId"  TEXT UNIQUE,
  "sbcUrl"       TEXT,
  "foundersUrl"  TEXT,
  "nineMarksUrl" TEXT,
  "sourceCount"  INTEGER NOT NULL DEFAULT 1,
  "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Church_lat_lng_idx" ON "Church"("lat", "lng");
CREATE INDEX "Church_sourceCount_idx" ON "Church"("sourceCount");

CREATE TABLE "ScrapeLog" (
  "id"        INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "source"    TEXT NOT NULL,
  "status"    TEXT NOT NULL,
  "count"     INTEGER NOT NULL DEFAULT 0,
  "error"     TEXT,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "duration"  INTEGER
);

CREATE TABLE "ScrapeState" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "page"       INTEGER NOT NULL DEFAULT 1,
  "totalPages" INTEGER NOT NULL DEFAULT 0,
  "nonce"      TEXT,
  "updatedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
