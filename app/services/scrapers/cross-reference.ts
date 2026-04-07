import type { PrismaClient } from "~/db/client";
import { normalizeName } from "./normalize";

function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find churches from different sources (or same source with duplicate listings)
 * that refer to the same physical church, then merge them into one record.
 *
 * Phase 1: Same-source dedup — merge co-located records from the same source
 *   (e.g. Founders lists "Saints Baptist Church" and "Saints Church" separately)
 * Phase 2: Cross-source dedup — merge records from different sources
 *   (no sourceCount restriction, so already-merged records can absorb stragglers)
 */
export async function runCrossReference(prisma: PrismaClient): Promise<number> {
  let mergedCount = 0;

  // ── Phase 1: same-source dedup ────────────────────────────────────────────
  const churches = await prisma.church.findMany({ orderBy: { id: "asc" } });

  const byNameNorm = new Map<string, typeof churches>();
  for (const c of churches) {
    if (!byNameNorm.has(c.nameNorm)) byNameNorm.set(c.nameNorm, []);
    byNameNorm.get(c.nameNorm)!.push(c);
  }

  for (const [, group] of byNameNorm) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];

        // Phase 1: only same-source pairs
        const aSource = a.isSbc ? "sbc" : a.isFounders ? "founders" : "9marks";
        const bSource = b.isSbc ? "sbc" : b.isFounders ? "founders" : "9marks";
        if (aSource !== bSource) continue;

        if (a.lat === 0 || b.lat === 0) continue;
        if (haversine(a.lat, a.lng, b.lat, b.lng) > 0.5) continue;

        // Pick keeper: whichever has more populated contact fields
        const score = (c: typeof a) =>
          [c.address, c.city, c.zip, c.phone, c.website].filter(Boolean).length;
        // loser is either a (at index i) or b (at index j) — use known indices, not indexOf
        const [keeper, loser, loserIdx] = score(a) >= score(b) ? [a, b, j] : [b, a, i];

        // Fill keeper's nulls from loser; keep keeper's source ID/URL
        await prisma.church.update({
          where: { id: keeper.id },
          data: {
            address: keeper.address ?? loser.address,
            city: keeper.city ?? loser.city,
            state: keeper.state ?? loser.state,
            zip: keeper.zip ?? loser.zip,
            phone: keeper.phone ?? loser.phone,
            website: keeper.website ?? loser.website,
          },
        });
        await prisma.church.delete({ where: { id: loser.id } });

        group.splice(loserIdx, 1);
        mergedCount++;
        if (loserIdx <= i) {
          i--;
          break; // a was removed; restart inner loop after outer i++ lands on the new element
        }
        if (loserIdx <= j) j--;
      }
    }
  }

  // ── Phase 2: cross-source dedup ───────────────────────────────────────────
  // Re-fetch after Phase 1 so deleted records aren't referenced
  const churches2 = await prisma.church.findMany({ orderBy: { id: "asc" } });

  const byNameNorm2 = new Map<string, typeof churches2>();
  for (const c of churches2) {
    if (!byNameNorm2.has(c.nameNorm)) byNameNorm2.set(c.nameNorm, []);
    byNameNorm2.get(c.nameNorm)!.push(c);
  }

  for (const [, group] of byNameNorm2) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];

        // Phase 2: only cross-source pairs
        const aSource = a.isSbc ? "sbc" : a.isFounders ? "founders" : "9marks";
        const bSource = b.isSbc ? "sbc" : b.isFounders ? "founders" : "9marks";
        if (aSource === bSource) continue;

        if (a.lat === 0 || b.lat === 0) continue;
        if (haversine(a.lat, a.lng, b.lat, b.lng) > 0.5) continue;

        // Merge b into a (a may already be sourceCount=2)
        const merged = {
          isSbc: a.isSbc || b.isSbc,
          isFounders: a.isFounders || b.isFounders,
          isNineMarks: a.isNineMarks || b.isNineMarks,
          sbcId: a.sbcId ?? b.sbcId,
          foundersId: a.foundersId ?? b.foundersId,
          nineMarksId: a.nineMarksId ?? b.nineMarksId,
          sbcUrl: a.sbcUrl ?? b.sbcUrl,
          foundersUrl: a.foundersUrl ?? b.foundersUrl,
          nineMarksUrl: a.nineMarksUrl ?? b.nineMarksUrl,
          address: a.address ?? b.address,
          city: a.city ?? b.city,
          state: a.state ?? b.state,
          zip: a.zip ?? b.zip,
          phone: a.phone ?? b.phone,
          website: a.website ?? b.website,
          sourceCount:
            ((a.isSbc || b.isSbc) ? 1 : 0) +
            ((a.isFounders || b.isFounders) ? 1 : 0) +
            ((a.isNineMarks || b.isNineMarks) ? 1 : 0),
        };
        // Delete b first so its unique IDs (foundersId etc.) are free before assigning to a
        await prisma.church.delete({ where: { id: b.id } });
        await prisma.church.update({ where: { id: a.id }, data: merged });
        // Update in-memory a so subsequent iterations see the merged state
        Object.assign(a, merged);
        group.splice(j, 1);
        j--;
        mergedCount++;
      }
    }
  }

  return mergedCount;
}
