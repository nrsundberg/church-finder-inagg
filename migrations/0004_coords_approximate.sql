ALTER TABLE "Church" ADD COLUMN "coordsApproximate" INTEGER NOT NULL DEFAULT 0;
-- Flag all existing SBC-only churches as approximate (city-center coords from zip lookup)
UPDATE "Church" SET "coordsApproximate" = 1
  WHERE isSbc = 1 AND isFounders = 0 AND isNineMarks = 0;
