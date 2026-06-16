# Sacrament Meeting Planner

An internal planning tool for a ward bishopric (The Church of Jesus Christ of
Latter-day Saints). It tracks who has spoken in sacrament meeting and when,
helps plan upcoming meetings, and keeps a browsable archive of past meetings.

> Built for one ward's bishopric. Real member data is never committed — see
> [Data & privacy](#data--privacy).

## Features

- **Members** — every member with a color-coded "how long since they last
  spoke" indicator, filters by recency / age group (primary, youth, adult) /
  gender, and inline-editable **preferred names** ("Alex Hui" shown over the
  official "Alexander Gabriel Hui").
- **Upcoming** — plan each Sunday: assign speakers (with topics and an
  invited → confirmed → spoke status), opening/closing prayers, presiding,
  conducting, chorister, and the four hymns.
- **History** — search and browse past meetings by year/month, with a clean
  read-only program view and a "Correct" mode for fixing records.
- **Activity** — an audit log attributing every change to the signed-in user.
- **Roster import** — upload a CSV roster, preview a diff against the current
  list, and apply changes (with version history).
- **Auth** — Google sign-in (restricted to an allowlist) behind an additional
  shared-password gate, so member data isn't exposed by sign-in alone.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) · React 19 · TypeScript
- [Tailwind CSS v4](https://tailwindcss.com)
- [Drizzle ORM](https://orm.drizzle.team)
- [PGlite](https://pglite.dev) for local dev, [Neon](https://neon.tech)
  Postgres in production — the database driver switches automatically based on
  whether `DATABASE_URL` is set
- [Auth.js v5](https://authjs.dev) (`next-auth@beta`)

## Getting started

```bash
npm install
npm run db:setup   # runs migrations + seeds a small SAMPLE ward
npm run dev        # http://localhost:3000
```

With no environment variables set, the app runs entirely locally: an in-process
PGlite database (persisted to `./.pglite`) and a "dev sign-in" button that
stands in for Google. Seed data is fake — see `sample-roster.csv`.

## Environment variables

All optional for local dev; required (except `ACCESS_PASSWORD`) for a real
deployment. Put them in `.env.local` (gitignored).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string. When set, the app uses the Neon HTTP driver; when blank it uses local PGlite. |
| `AUTH_SECRET` | Auth.js session secret (`openssl rand -base64 33`). |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client. When present, the login page shows "Sign in with Google" instead of the dev button. |
| `ALLOWED_EMAILS` | Comma-separated emails allowed to sign in. Blank = anyone may sign in. |
| `ACCESS_PASSWORD` | Shared passphrase every signed-in user must enter before seeing member data. Blank disables the gate. |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server (PGlite). |
| `npm run build` | Production build. |
| `npm run db:generate` | Generate a Drizzle migration from schema changes. |
| `npm run db:migrate` | Apply migrations to the local PGlite database. |
| `npm run db:seed` | Seed the sample ward. |
| `npm run db:setup` | `db:migrate` + `db:seed`. |

The `scripts/` folder also contains data-import and back-fill utilities
(`import-schedule`, `import-trello`, `link-nicknames`, etc.). These read from a
gitignored `private/` folder specific to this ward's data sources (an LCR roster
export, a Google Sheet, and a Trello board) and aren't needed to run the app.

## Project structure

```
src/
  app/            App Router routes (members, upcoming, history, activity, login)
  components/     UI + feature components (members table, meeting card, ...)
  lib/            data access, auth, server actions, domain helpers
  lib/db/         Drizzle schema + driver (PGlite ↔ Neon)
  proxy.ts        auth + shared-password gate (Next.js "proxy"/middleware)
scripts/          migrations, seed, and data-import utilities
drizzle/          generated SQL migrations
```

## Deployment

Deployed on [Vercel](https://vercel.com) with a Neon database. Set the
environment variables above in the Vercel project, then push (or
`vercel deploy --prod`). Run migrations against Neon with
`DATABASE_URL=... npx drizzle-kit push` before first use.

## Data & privacy

This repository contains **no real member data and no secrets**. The following
are gitignored and never committed:

- `private/` — the real roster and source-data exports
- `.pglite/` — the local database (holds real data once imported)
- `.env*` — all credentials
- `.playwright-mcp/` — browser-test snapshots

The only roster in the repo, `sample-roster.csv`, is fabricated.
