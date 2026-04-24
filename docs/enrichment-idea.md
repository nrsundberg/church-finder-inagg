# Church Enrichment — Design Notes

Status: idea / design sketch. Not implemented.

## The idea

In the background, scrape each church's website (Firecrawl, Cloudflare Browser
Rendering, or plain `fetch` + `cheerio`) to pull structured information —
primarily the leadership page (elders, deacons, pastoral staff) and "about" /
"what to expect" pages. Use that information to surface flags on each church
card, e.g.:

- "Likely has a female pastor" — in violation of 1 Timothy 3 / Titus 1
- Worship style / dress signals (e.g. senior pastor appears to preach in
  sneakers and a baseball cap, or conversely, "reverent / Sunday best" language)
- Elder plurality vs. single-pastor model
- Confessional subscription
- Expository vs. topical preaching (from sermon titles)

Flags should always be evidence-backed and surfaced with a citation, not just a
bare label.

## Architecture shape

Treat enrichment as an async pipeline, separate from the existing
SBC / Founders / 9Marks scrapers:

1. When a `Church` row is created or updated, enqueue an enrichment job on a
   Cloudflare Queue.
2. A consumer worker pulls the job, crawls the church's website, and writes
   structured facts + signals back to a new `ChurchEnrichment` row.
3. The card on the frontend just reads whatever is in `ChurchEnrichment`. If
   enrichment hasn't run yet, no flags render — nothing blocks page load.

For the crawler, Firecrawl is worth it mainly for its structured-extraction
feature (hand it a schema, it returns JSON). Otherwise plain `fetch` +
`cheerio` in a Worker is cheaper and keeps us in the Cloudflare ecosystem.
Most church sites do not need JS rendering.

## Inference layer (the risky part)

Going from "a leadership page exists" to "this church likely has a female
pastor" is an **inference**, not a scrape. Keep the two layers separate:

- **Scraper** collects raw evidence: a list of staff with `name`, `title`, and
  the source `URL`; links to the statement of faith; presence of words like
  "elder," "pastor," "preaching pastor," "teaching elder," "women's minister,"
  "pastor of women."
- **Inference pass** — a cheap LLM call with the evidence as input — produces
  tagged signals like:

  ```json
  {
    "tag": "likelyHasFemalePastor",
    "confidence": 0.85,
    "evidence": [
      {
        "text": "Sarah Smith — Pastor of Discipleship",
        "url": "https://example.org/staff"
      }
    ]
  }
  ```

The card surfaces the tag **with the evidence link**, so a user clicking the
flag sees exactly which page and which title drove it.

### Why "show your work" matters

Two real risks otherwise:

1. **False positives.** A woman listed as "Children's Minister" or "Women's
   Director" isn't a pastor in the 1 Tim 3 sense, and an LLM without tight
   instructions will sometimes flag her anyway. Titles like "Executive Pastor
   of Operations" can also confuse a naive classifier.
2. **Reputational harm.** Quietly labeling a church as disqualified when it
   isn't is damaging to them and to our credibility. A citation means the user
   can verify, and the church has something concrete to dispute if they want.

## The "sneakers and baseball cap" signal

Text scraping can't see this directly. Options, in order of effort:

1. **Proxy via "about" / "what to expect" pages** — look for phrases like
   "come as you are," "casual, jeans welcome" vs. "reverent," "Sunday best."
   Cheap, defensible, weak signal. Start here.
2. **Crowdsourced observations** through the existing `Submission` model, with
   moderation before anything shows up on a card.
3. **Vision model on sermon thumbnails** pulled from YouTube / Vimeo /
   SermonAudio. Real signal but expensive per church and introduces video
   platform ToS concerns. Skip until the directory has real traffic.

## Data model sketch

```prisma
model ChurchEnrichment {
  churchId      Int      @id
  church        Church   @relation(fields: [churchId], references: [id])

  lastCrawledAt DateTime?
  crawlStatus   String   // ok | failed | partial
  rawPages      Json?    // { leadershipUrl, aboutUrl, sofUrl, ... }
  staff         Json?    // [{ name, title, pageUrl }]
  signals       Json?    // [{ tag, confidence, evidence: [...] }]

  updatedAt     DateTime @updatedAt
}
```

Signals are intentionally a flexible JSON blob, not boolean columns, so new
tags (elder plurality, confessional subscription, expository preaching, etc.)
can be added without migrations.

## Refresh cadence

Most churches update staff pages once or twice a year. A cron that re-crawls
each church every 60–90 days is plenty. An admin route should allow a manual
re-crawl — especially useful when someone submits a correction via the
existing `Submission` flow.

## Suggested starting point

Don't build the queue or the DB first. Do a small prototype against 10–20
churches we already know well:

1. Write a script that pulls the leadership page.
2. Pass the text to a cheap model with a tight extraction schema.
3. Dump the result to a JSON file.
4. Grade it by hand. False positives? Misses? Does it correctly ignore
   "Children's Minister" and "Executive Pastor of Operations"?

If accuracy is good enough on that sample, wire the queue and the DB. If it
isn't, the fix is almost certainly in the prompt and the schema — not in the
plumbing — and we'll know exactly where to spend effort.

## Open questions

- How should multiple low-confidence signals combine on a card? One badge per
  tag, or a single "concerns" badge that expands?
- Do we want a "verified by a human" bit on each signal so maintainers can
  promote or suppress automated flags?
- Is there a charitable-neutral tone for flag copy, or is blunt better? (See
  `design:ux-copy` skill when we get to this.)
- How do we handle churches whose website is effectively just a Facebook page?
