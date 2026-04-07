CREATE TABLE "Submission" (
  "id"        INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name"      TEXT     NOT NULL,
  "email"     TEXT     NOT NULL,
  "body"      TEXT     NOT NULL,
  "ipAddress" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Submission_createdAt_idx" ON "Submission"("createdAt");
