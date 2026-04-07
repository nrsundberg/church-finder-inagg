-- Migration: add SearchLog table for usage analytics
CREATE TABLE "SearchLog" (
  "id"          INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "lat"         REAL    NOT NULL,
  "lng"         REAL    NOT NULL,
  "radiusMiles" INTEGER NOT NULL,
  "searchedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "SearchLog_searchedAt_idx" ON "SearchLog"("searchedAt");
