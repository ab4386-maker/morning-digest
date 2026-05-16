# Morning Digest

A personal information dashboard. Each morning a job pulls items from your favorite newsletters, RSS feeds, and inboxes, summarizes them with Claude, ranks them by importance, and shows the result on a clean web page.

---

## Current status — v1 (mock data)

The app runs locally with **fake sample content** so you can see the UI. Real ingestion comes next, once we have credentials.

To view it on this Mac, open a Terminal in this folder and run:

```
npm run dev
```

Then open **http://localhost:3000** in your browser. The dev server is already running in the background.

To stop it, run:

```
pkill -f "next dev"
```

---

## What you need to do

These are the credentials the app needs. None of them are coding tasks — they are signup/click-through tasks.

### 1. New Gmail (for newsletter subscriptions)

Create a fresh Gmail like `firstname.digest@gmail.com`. Then subscribe to:

- **Money Stuff** — https://www.bloomberg.com/account/newsletters/money-stuff
- **Apollo / Sløk daily chart** — https://www.apolloacademy.com (signup at bottom)
- **Clouded Judgement** — https://cloudedjudgement.substack.com (Subscribe button, free)
- **Citrini Research** — https://www.citriniresearch.com (Subscribe, free tier is fine)
- **WSJ newsletters** — log into wsj.com with your subscription → Account → Newsletters & Alerts → enable "What's News AM" and "Markets AM"

### 2. Gmail "app password" (lets the app read that inbox via IMAP)

In the new Gmail:
1. Go to https://myaccount.google.com/security
2. Turn on **2-Step Verification** (required to make app passwords).
3. Go to https://myaccount.google.com/apppasswords.
4. Generate a password named "Morning Digest". Copy the 16-character code.
5. Send me that string + the Gmail address. We'll put both into `.env.local` (never committed to git).

### 3. Anthropic API key

1. Go to https://console.anthropic.com.
2. Sign up. Buy $5 in credits.
3. Settings → API Keys → Create Key.
4. Send me the key (starts with `sk-ant-`).

### 4. GitHub & Vercel (for free hosting)

1. Make sure you have a GitHub account (https://github.com — free).
2. Sign up at https://vercel.com using "Continue with GitHub". Free tier handles this easily.

---

## How the system works

```
   Sources                Ingest                 UI
   ─────────              ──────                 ──
   RSS feeds      ─┐
                   ├──> daily cron at 8am ET ─> summarize w/ Claude Haiku ─> rank ─> dashboard
   Gmail IMAP     ─┘                                                                 │
                                                                                     └─> click-tracking refines ranking
```

### Adding a new source

Once we go live, just open the dashboard and click **+ Add source** in the top right. Paste any Substack URL, RSS feed, or website. Done.

### Cost

- Vercel hosting: **$0** (free Hobby tier)
- Database: **$0** (Vercel KV free tier)
- Claude API: **~$1–3/month** at Haiku rates for ~5 sources

---

## Project structure

```
morning-digest/
├── app/
│   ├── page.tsx              # main dashboard
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── click/route.ts    # click tracking
│       └── sources/route.ts  # add-source form handler
├── components/
│   ├── Dashboard.tsx         # tab UI + add-source form
│   └── DigestBlock.tsx       # one item card
├── lib/
│   ├── types.ts
│   └── mock-data.ts          # placeholder content, v1 only
└── scripts/
    └── ingest.ts             # (v2) the daily fetcher
```

---

## Roadmap

- **v1 (done)** — UI, mock data, click handlers, build-clean.
- **v2 (next)** — Real RSS ingestion (Clouded Judgement, Citrini, WSJ headlines).
- **v3** — Gmail IMAP ingestion (Money Stuff, Apollo/Sløk, WSJ newsletters).
- **v4** — Claude Haiku summarization pipeline.
- **v5** — Deploy to Vercel with daily cron.
- **v6** — Click tracking → ranking weights.
- **v7** — Add Twitter/X via RSS.app, podcast transcripts.
