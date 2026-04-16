import { Form, redirect, useActionData, useNavigation, useRevalidator } from "react-router";
import { useEffect, useState } from "react";
import { getPrisma } from "~/db.server";
import { SearchHeatmapWrapper } from "~/components/search-heatmap-wrapper";
import { getSessionStorage } from "~/sessions.server";
import type { Route } from "./+types/admin";

const CF_ACCOUNT_ID = "a7f63e2108d01fc6d8571772ac20f3e9";
const CF_WORKER_NAME = "church-finder-inagg";

const SBC_TOTAL_PAGES = 1556;
const SBC_CHUNK_SIZE = 389;

async function queueAndTrigger(d1: D1Database, task: string, apiToken: string) {
  await d1
    .prepare('INSERT OR REPLACE INTO "ScrapeState" (id, page, totalPages, nonce, updatedAt) VALUES (?, 0, 0, ?, CURRENT_TIMESTAMP)')
    .bind("pending-task", task)
    .run();
  await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/scripts/${CF_WORKER_NAME}/schedules/trigger`,
    { method: "POST", headers: { Authorization: `Bearer ${apiToken}` } },
  );
}

export const meta: Route.MetaFunction = () => [{ title: "Admin — Church Finder" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const adminPassword = context.cloudflare.env.ADMIN_PASSWORD;
  if (!adminPassword) throw new Error("ADMIN_PASSWORD env var not set");

  const isSecure = new URL(request.url).protocol === "https:";
  const { getSession } = getSessionStorage(adminPassword, isSecure);
  const session = await getSession(request.headers.get("Cookie"));

  const started = new URL(request.url).searchParams.get("started") ?? null;

  if (!session.get("authed")) {
    return { authed: false as const, stats: null, started: null };
  }

  const prisma = getPrisma(context);

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [total, sbcCount, foundersCount, nineMarksCount, multiSourceCount, recentLogs, searchesAllTime, searchesPastWeek, recentSearches, searchPoints, sbcState, sbcLogs, submissions] =
    await Promise.all([
      prisma.church.count(),
      prisma.church.count({ where: { isSbc: true } }),
      prisma.church.count({ where: { isFounders: true } }),
      prisma.church.count({ where: { isNineMarks: true } }),
      prisma.church.count({ where: { sourceCount: { gte: 2 } } }),
      prisma.scrapeLog.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
      prisma.searchLog.count(),
      prisma.searchLog.count({ where: { searchedAt: { gte: oneWeekAgo } } }),
      prisma.searchLog.findMany({ orderBy: { searchedAt: "desc" }, take: 20 }),
      prisma.searchLog.findMany({ select: { lat: true, lng: true } }),
      prisma.scrapeState.findUnique({ where: { id: "sbc-progress" } }),
      prisma.scrapeLog.findMany({
        where: { source: "sbc", status: { in: ["partial", "success", "running"] } },
        orderBy: { startedAt: "asc" },
        take: 10,
      }),
      prisma.submission.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, email: true, body: true, createdAt: true, ipAddress: true },
      }),
    ]);

  return {
    authed: true as const,
    started,
    stats: { total, sbcCount, foundersCount, nineMarksCount, multiSourceCount, recentLogs, searchesAllTime, searchesPastWeek, recentSearches, searchPoints, sbcState, sbcLogs, submissions },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const adminPassword = context.cloudflare.env.ADMIN_PASSWORD;
  if (!adminPassword) throw new Error("ADMIN_PASSWORD env var not set");

  const isSecure = new URL(request.url).protocol === "https:";
  const { getSession, commitSession, destroySession } = getSessionStorage(adminPassword, isSecure);

  const formData = await request.formData();
  const intent = formData.get("intent");

  const session = await getSession(request.headers.get("Cookie"));

  if (intent === "logout") {
    return redirect("/admin", {
      headers: { "Set-Cookie": await destroySession(session) },
    });
  }

  if (intent === "cross-reference") {
    if (!session.get("authed")) return redirect("/admin");
    await queueAndTrigger(context.cloudflare.env.D1_DATABASE, "cross-reference", context.cloudflare.env.CF_API_TOKEN);
    return redirect("/admin?started=cross-reference");
  }

  if (intent === "sbc-scrape") {
    if (!session.get("authed")) return redirect("/admin");
    await queueAndTrigger(context.cloudflare.env.D1_DATABASE, "sbc-force", context.cloudflare.env.CF_API_TOKEN);
    return redirect("/admin?started=sbc-scrape");
  }

  if (intent === "founders-scrape") {
    if (!session.get("authed")) return redirect("/admin");
    await queueAndTrigger(context.cloudflare.env.D1_DATABASE, "founders-scrape", context.cloudflare.env.CF_API_TOKEN);
    return redirect("/admin?started=founders-scrape");
  }

  // Login
  const password = formData.get("password");
  if (password !== adminPassword) {
    return { error: "Incorrect password" };
  }

  session.set("authed", true);
  return redirect("/admin", {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData();
  if (!loaderData.authed) {
    return <LoginForm error={(actionData as any)?.error} />;
  }

  const { stats, started } = loaderData;
  const { revalidate } = useRevalidator();
  const hasRunning = stats?.recentLogs.some((l) => l.status === "running") ?? false;

  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(revalidate, 3000);
    return () => clearInterval(id);
  }, [hasRunning, revalidate]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-zinc-100">Admin</h1>
          <form method="post">
            <input type="hidden" name="intent" value="logout" />
            <button
              type="submit"
              className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Log out
            </button>
          </form>
        </div>

        {/* Search stats */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Searches
          </h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <StatCard label="All time" value={stats!.searchesAllTime} />
            <StatCard label="Past 7 days" value={stats!.searchesPastWeek} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Heat map */}
            <div className="h-72 rounded-lg overflow-hidden border border-zinc-800">
              <SearchHeatmapWrapper points={stats!.searchPoints} />
            </div>
            {/* Recent searches table */}
            <div className="rounded-lg border border-zinc-800 overflow-y-auto max-h-72">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-zinc-400 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Lat</th>
                    <th className="px-4 py-2 text-left font-medium">Lng</th>
                    <th className="px-4 py-2 text-left font-medium">Radius</th>
                    <th className="px-4 py-2 text-left font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {stats!.recentSearches.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                        No searches yet
                      </td>
                    </tr>
                  ) : (
                    stats!.recentSearches.map((s) => (
                      <tr key={s.id} className="bg-zinc-950 hover:bg-zinc-900 transition-colors">
                        <td className="px-4 py-2 font-mono text-zinc-300">{s.lat.toFixed(4)}</td>
                        <td className="px-4 py-2 font-mono text-zinc-300">{s.lng.toFixed(4)}</td>
                        <td className="px-4 py-2 text-zinc-400">{s.radiusMiles} mi</td>
                        <td className="px-4 py-2 text-zinc-400 text-xs">
                          {new Date(s.searchedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Church counts */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Church Counts
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Total" value={stats!.total} />
            <StatCard label="SBC" value={stats!.sbcCount} />
            <StatCard label="Founders" value={stats!.foundersCount} />
            <StatCard label="9Marks" value={stats!.nineMarksCount} />
            <StatCard label="Multi-source (2+)" value={stats!.multiSourceCount} />
          </div>
        </section>

        {/* SBC Cycle status */}
        <SbcCycleStatus sbcState={stats!.sbcState} sbcLogs={stats!.sbcLogs} />

        {/* Maintenance actions */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Maintenance
          </h2>
          <div className="flex flex-col gap-3">
            <MaintenanceCard
              title="SBC Scrape"
              description="Scrapes ~9,750 SBC churches (pages 1–389 of 1,556 total) per run. Click once to start a 4-day cycle; subsequent cron runs handle days 2–4 automatically. Full 37k refresh completes once every 30 days."
              intent="sbc-scrape"
              started={started === "sbc-scrape"}
            />
            <MaintenanceCard
              title="Founders Scrape"
              description="Queues a nationwide fetch from church.founders.org and upserts Founders churches into the database. Runs in the background (same job queue as SBC / cross-reference); check Recent Scrape Logs for status."
              intent="founders-scrape"
              started={started === "founders-scrape"}
            />
            <MaintenanceCard
              title="Cross-Reference Merge"
              description="Scans all churches for duplicate records that refer to the same physical location (same normalized name, within 0.5 mi). Merges same-source duplicates first, then combines records across sources into a single multi-badge entry."
              intent="cross-reference"
              started={started === "cross-reference"}
            />
          </div>
        </section>

        {/* Submissions */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Submissions ({stats!.submissions.length})
          </h2>
          <SubmissionsSection submissions={stats!.submissions} />
        </section>

        {/* Scrape logs */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Recent Scrape Logs
          </h2>
          <div className="rounded-lg border border-zinc-800 overflow-y-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-400 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Source</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Count</th>
                  <th className="px-4 py-2 text-right font-medium">Duration</th>
                  <th className="px-4 py-2 text-left font-medium">Started</th>
                  <th className="px-4 py-2 text-left font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {stats!.recentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                      No scrape logs yet
                    </td>
                  </tr>
                ) : (
                  stats!.recentLogs.map((log) => (
                    <tr key={log.id} className="bg-zinc-950 hover:bg-zinc-900 transition-colors">
                      <td className="px-4 py-2 font-mono text-zinc-300">{log.source}</td>
                      <td className="px-4 py-2">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-zinc-300">
                        {log.count.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-zinc-400">
                        {log.duration != null ? `${(log.duration / 1000).toFixed(1)}s` : "—"}
                      </td>
                      <td className="px-4 py-2 text-zinc-400 text-xs">
                        {new Date(log.startedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-red-400 text-xs max-w-xs truncate">
                        {log.error ?? ""}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

type SbcStateRow = { page: number; totalPages: number; updatedAt: Date | string } | null;
type SbcLogRow = { status: string; count: number; startedAt: Date | string };

function SbcCycleStatus({ sbcState, sbcLogs }: { sbcState: SbcStateRow; sbcLogs: SbcLogRow[] }) {
  const noActiveCycle = !sbcState || sbcState.page > SBC_TOTAL_PAGES;

  const completedLogs = sbcLogs.filter((l) => l.status !== "running");
  const isRunning = sbcLogs[sbcLogs.length - 1]?.status === "running";

  const daysComplete = sbcState
    ? Math.min(4, Math.floor((sbcState.page - 1) / SBC_CHUNK_SIZE))
    : 0;

  const updatedAt = sbcState ? new Date(sbcState.updatedAt) : null;
  const nextRun = updatedAt
    ? (() => {
        const d = new Date(updatedAt);
        d.setUTCDate(d.getUTCDate() + 1);
        d.setUTCHours(3, 0, 0, 0);
        return d;
      })()
    : null;

  const isStale =
    !noActiveCycle &&
    daysComplete < 4 &&
    !isRunning &&
    updatedAt != null &&
    Date.now() - updatedAt.getTime() > 25 * 60 * 60 * 1000;

  const currentDay = isRunning ? daysComplete + 1 : daysComplete + 1;

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
        SBC Cycle
      </h2>

      {noActiveCycle ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-6 text-center text-zinc-500 text-sm">
          No active SBC cycle. Use the SBC Scrape button below to start one.
        </div>
      ) : (
        <>
          {isStale && nextRun && (
            <div className="bg-amber-950 border border-amber-800 rounded-lg px-4 py-3 mb-4 text-sm text-amber-300">
              Warning: Day {daysComplete + 1} was expected around{" "}
              {nextRun.toUTCString()} but has not run. The cron may have been
              missed — you can trigger it manually below.
            </div>
          )}

          <div className="grid grid-cols-4 gap-3 mb-3">
            {[1, 2, 3, 4].map((day) => {
              const isDone = day <= daysComplete;
              const isThisRunning = isRunning && day === currentDay;
              const isPending = !isDone && !isThisRunning;
              const isNext = isPending && day === daysComplete + 1;
              const logEntry = completedLogs[day - 1];

              let borderCls = "border-zinc-800 opacity-50";
              if (isDone) borderCls = "border-green-800";
              else if (isThisRunning) borderCls = "border-yellow-800";
              else if (isNext) borderCls = "border-zinc-700";

              return (
                <div
                  key={day}
                  className={`bg-zinc-900 border ${borderCls} rounded-lg px-3 py-3`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {isDone && (
                      <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                    )}
                    {isThisRunning && (
                      <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
                    )}
                    {isPending && (
                      <span className="w-2 h-2 rounded-full border border-zinc-600 shrink-0" />
                    )}
                    <span className="text-xs font-medium text-zinc-300">Day {day}</span>
                  </div>
                  {isDone && logEntry ? (
                    <div className="text-xs text-green-400 tabular-nums">
                      {logEntry.count.toLocaleString()} churches
                    </div>
                  ) : isThisRunning ? (
                    <div className="text-xs text-yellow-300">Running…</div>
                  ) : (
                    <div className="text-xs text-zinc-500">Pending</div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-zinc-500">
            {daysComplete === 4 ? (
              "Cycle complete — all 4 days finished."
            ) : isRunning ? (
              `Day ${currentDay} is running…`
            ) : nextRun ? (
              <>
                Day {daysComplete + 1} pending — next cron run at{" "}
                <span className="text-zinc-400">{nextRun.toUTCString()}</span>
              </>
            ) : null}
          </p>
        </>
      )}
    </section>
  );
}

function LoginForm({ error }: { error?: string }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-zinc-100 mb-6 text-center">Admin Login</h1>
        <form method="post" className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm text-zinc-400 mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoFocus
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-md px-4 py-2 text-sm font-medium transition-colors"
          >
            Log in
          </button>
        </form>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
      <div className="text-xs text-zinc-400 mb-1">{label}</div>
      <div className="text-2xl font-bold tabular-nums text-zinc-100">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function MaintenanceCard({
  title,
  description,
  intent,
  started,
}: {
  title: string;
  description: string;
  intent: string;
  started: boolean;
}) {
  const navigation = useNavigation();
  const isSubmitting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === intent;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-zinc-200 mb-1">{title}</p>
        <p className="text-xs text-zinc-400">{description}</p>
        {started && (
          <p className="text-xs text-green-400 mt-2">
            Running in background — refresh in a moment to see updated stats.
          </p>
        )}
      </div>
      <Form method="post" className="shrink-0">
        <input type="hidden" name="intent" value={intent} />
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-100 rounded-md px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap"
        >
          {isSubmitting ? "Starting…" : "Run"}
        </button>
      </Form>
    </div>
  );
}

type SubmissionItem = {
  id: number;
  name: string;
  email: string;
  body: string;
  createdAt: Date | string;
  ipAddress: string | null;
};

function SubmissionsSection({ submissions }: { submissions: SubmissionItem[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (submissions.length === 0) {
    return (
      <p className="text-zinc-500 text-sm bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-6 text-center">
        No submissions yet.
      </p>
    );
  }

  const grouped = submissions.reduce<Record<string, SubmissionItem[]>>((acc, s) => {
    const day = new Date(s.createdAt).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    (acc[day] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.keys(grouped).map((day) => (
        <div key={day}>
          <p className="text-xs text-zinc-500 font-medium mb-2">{day}</p>
          <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800 overflow-hidden">
            {grouped[day].map((s) => {
              const isExpanded = expanded.has(s.id);
              const toggle = () =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  isExpanded ? next.delete(s.id) : next.add(s.id);
                  return next;
                });
              const preview = s.body.length > 120 ? s.body.slice(0, 120) + "…" : s.body;
              return (
                <div key={s.id} className="bg-zinc-950 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200">{s.name}</p>
                      <p className="text-xs text-zinc-400">{s.email}</p>
                    </div>
                    <p className="text-xs text-zinc-600 flex-shrink-0">
                      {new Date(s.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <p className="text-sm text-zinc-300 mt-2 whitespace-pre-wrap break-words">
                    {isExpanded ? s.body : preview}
                  </p>
                  {s.body.length > 120 && (
                    <button
                      type="button"
                      onClick={toggle}
                      className="text-xs text-blue-400 hover:text-blue-300 mt-1 transition-colors"
                    >
                      {isExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: "bg-green-900 text-green-300",
    error: "bg-red-900 text-red-300",
    running: "bg-yellow-900 text-yellow-300",
    partial: "bg-blue-900 text-blue-300",
  };
  const cls = colors[status] ?? "bg-zinc-800 text-zinc-300";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
