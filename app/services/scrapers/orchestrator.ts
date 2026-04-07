import { PrismaClient } from "~/db/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { normalizeName } from "./normalize";
import { scrapeNineMarks } from "./nine-marks";
import { scrapeFounders } from "./founders";
import { scrapeSbcBatch } from "./sbc";
import { runCrossReference } from "./cross-reference";
import type { ChurchInput } from "./types";

function getPrismaFromD1(d1: D1Database): PrismaClient {
  const adapter = new PrismaD1(d1);
  return new PrismaClient({ adapter });
}

// D1 batch upsert — 1 HTTP call per 100 rows vs 1 call per row with Prisma
const BATCH_SIZE = 100;

function buildStatement(d1: D1Database, c: ChurchInput, now: string): D1PreparedStatement {
  const nameNorm = normalizeName(c.name);

  if (c.source === "9marks") {
    return d1
      .prepare(
        `INSERT INTO "Church" (name, nameNorm, lat, lng, isNineMarks, nineMarksId, nineMarksUrl,
           address, city, state, zip, phone, email, website, sourceCount, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(nineMarksId) DO UPDATE SET
           name=excluded.name, nameNorm=excluded.nameNorm, lat=excluded.lat, lng=excluded.lng,
           address=COALESCE(excluded.address, address),
           city=COALESCE(excluded.city, city), state=COALESCE(excluded.state, state),
           zip=COALESCE(excluded.zip, zip), phone=COALESCE(excluded.phone, phone),
           email=COALESCE(excluded.email, email), website=COALESCE(excluded.website, website),
           nineMarksUrl=excluded.nineMarksUrl, updatedAt=excluded.updatedAt`,
      )
      .bind(
        c.name, nameNorm, c.lat, c.lng,
        c.sourceId, c.profileUrl ?? null,
        c.address ?? null, c.city ?? null, c.state ?? null, c.zip ?? null,
        c.phone ?? null, c.email ?? null, c.website ?? null,
        now, now,
      );
  }

  if (c.source === "founders") {
    return d1
      .prepare(
        `INSERT INTO "Church" (name, nameNorm, lat, lng, isFounders, foundersId, foundersUrl,
           address, city, state, zip, phone, email, website, sourceCount, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(foundersId) DO UPDATE SET
           name=excluded.name, nameNorm=excluded.nameNorm, lat=excluded.lat, lng=excluded.lng,
           state=COALESCE(excluded.state, state),
           foundersUrl=excluded.foundersUrl, updatedAt=excluded.updatedAt`,
      )
      .bind(
        c.name, nameNorm, c.lat, c.lng,
        c.sourceId, c.profileUrl ?? null,
        c.address ?? null, c.city ?? null, c.state ?? null, c.zip ?? null,
        c.phone ?? null, c.email ?? null, c.website ?? null,
        now, now,
      );
  }

  // SBC
  return d1
    .prepare(
      `INSERT INTO "Church" (name, nameNorm, lat, lng, isSbc, sbcId, sbcUrl,
         address, city, state, zip, phone, email, website, sourceCount, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(sbcId) DO UPDATE SET
         name=excluded.name, nameNorm=excluded.nameNorm, lat=excluded.lat, lng=excluded.lng,
         address=COALESCE(excluded.address, address),
         city=COALESCE(excluded.city, city), state=COALESCE(excluded.state, state),
         zip=COALESCE(excluded.zip, zip), phone=COALESCE(excluded.phone, phone),
         website=COALESCE(excluded.website, website),
         sbcUrl=excluded.sbcUrl, updatedAt=excluded.updatedAt`,
    )
    .bind(
      c.name, nameNorm, c.lat, c.lng,
      c.sourceId, c.profileUrl ?? null,
      c.address ?? null, c.city ?? null, c.state ?? null, c.zip ?? null,
      c.phone ?? null, c.email ?? null, c.website ?? null,
      now, now,
    );
}

export async function batchUpsertChurches(d1: D1Database, churches: ChurchInput[]): Promise<number> {
  if (churches.length === 0) return 0;
  const now = new Date().toISOString();
  for (let i = 0; i < churches.length; i += BATCH_SIZE) {
    await d1.batch(churches.slice(i, i + BATCH_SIZE).map((c) => buildStatement(d1, c, now)));
  }
  return churches.length;
}

// source: "all" | "9marks" | "founders" | "sbc"
// The HTTP endpoint passes "9marks" or "founders" (separate calls, each under 30s).
// The cron trigger passes "all" and has a 15-minute budget.
// force=true bypasses the 7-day SBC TTL (used for manual admin/API triggers).
export async function runScrape(d1: D1Database, source = "all", force = false): Promise<void> {
  const prisma = getPrismaFromD1(d1);

  if (source === "9marks" || source === "all") {
    const t = Date.now();
    console.log("Starting 9Marks scrape...");
    try {
      const churches = await scrapeNineMarks();
      const count = await batchUpsertChurches(d1, churches);
      await prisma.scrapeLog.create({
        data: { source: "9marks", status: "success", count, duration: Date.now() - t },
      });
      console.log(`9Marks: upserted ${count} churches in ${Date.now() - t}ms`);
    } catch (err) {
      await prisma.scrapeLog.create({
        data: { source: "9marks", status: "error", error: String(err), duration: Date.now() - t },
      });
      console.error("9Marks failed:", err);
    }
  }

  if (source === "founders" || source === "all") {
    const t = Date.now();
    console.log("Starting Founders scrape...");
    try {
      const churches = await scrapeFounders();
      const count = await batchUpsertChurches(d1, churches);
      await prisma.scrapeLog.create({
        data: { source: "founders", status: "success", count, duration: Date.now() - t },
      });
      console.log(`Founders: upserted ${count} churches in ${Date.now() - t}ms`);
    } catch (err) {
      await prisma.scrapeLog.create({
        data: { source: "founders", status: "error", error: String(err), duration: Date.now() - t },
      });
      console.error("Founders failed:", err);
    }
  }

  if (source === "sbc" || source === "all") {
    const t = Date.now();
    const SBC_TTL_MS = 30 * 24 * 60 * 60 * 1000;
    const lastSuccess = await prisma.scrapeLog.findFirst({
      where: { source: "sbc", status: "success" },
      orderBy: { startedAt: "desc" },
    });
    if (!force && lastSuccess && Date.now() - lastSuccess.startedAt.getTime() < SBC_TTL_MS) {
      console.log(`SBC data is fresh (last success: ${lastSuccess.startedAt.toISOString()}), skipping`);
      return;
    }
    console.log("Starting SBC batch scrape...");
    const runningLog = await prisma.scrapeLog.create({
      data: { source: "sbc", status: "running" },
    });
    try {
      const result = await scrapeSbcBatch(1, null);
      const count = await batchUpsertChurches(d1, result.churches);

      await prisma.scrapeLog.update({
        where: { id: runningLog.id },
        data: { status: "success", count, duration: Date.now() - t },
      });
      console.log(`SBC: upserted ${count} churches in ${Date.now() - t}ms`);

      const merged = await runCrossReference(prisma);
      console.log(`Cross-reference: merged ${merged} records`);
    } catch (err) {
      await prisma.scrapeLog.update({
        where: { id: runningLog.id },
        data: { status: "error", error: String(err), duration: Date.now() - t },
      });
      console.error("SBC failed:", err);
    }
  }
}
