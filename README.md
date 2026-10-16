# BillSplit

Split group expenses with friends: a Tricount-style app that runs on Cloudflare Workers and D1.

**Live:** https://billsplit.atlesque.dev

## How it works

**Starting a group.** Enter your email and open the sign-in link (or type the 6-digit code). The first sign-in creates your account. Create a group, and you get its share link straight away. Drop it into your group chat.

**Joining a group.** Open the group's link. If you're signed out, the page shows the group and asks for your email, and after signing in you land back on the link, even if you opened the email on another device. Pick your name if someone already added you, or join under your own name.

## Features

- **One email sign-in flow** for new and existing accounts: a magic link plus a 6-digit code.
- **One share link per group.** Everyone uses the same link. It has a random 144-bit token and doesn't expire on its own. Anyone in the group can copy it, and the group's creator can reset it, which makes the old link stop working. Personal single-use links from earlier versions keep working until used.
- **People without the app** can be added by name and included in splits. If they join later, they pick their name from the list.
- **Flexible splits.** Split equally, by shares, or by exact amounts. Leftover cents are spread fairly, so shares always add up to the total. You can also record payments between people.
- **Balances and settle-up.** See who is owed what and a short list of payments that settles everyone. “Mark paid” records a payment.
- **CSV export** per group.
- **English and Dutch.** The app follows the browser language and has a language switcher in the header; the choice is remembered on that device. Error messages, the sign-in email and the CSV export follow the same language.
- **Admin area** at `/admin`, behind Cloudflare Access and limited to emails listed in `ADMIN_EMAILS`. It shows users, groups with their people and links (including how many joined through each), every sign-in request with its email delivery and verification status, and the full audit log.
- **Audit log** of every action: sign-in emails sent or failed, wrong codes, sign-ins, registrations, group/person/link/expense changes. Entries record who did what, in which group, and from which IP address.

## Stack

- One Cloudflare Worker (`src/`) serving a JSON API under `/api/*`, with no runtime dependencies.
- A **Nuxt 4** single-page app with **Nuxt UI** in `web/` (translations via `@nuxtjs/i18n` in `web/i18n/locales/`). It is client-rendered: `pnpm build` (`nuxt generate`) writes static files to `web/.output/public`, which Workers Static Assets serves, falling back to `index.html` for app routes.
- **D1** for users, sessions, groups, people, invites, expenses, the email log and the audit log (`migrations/`).
- **Cloudflare Email Service** (`send_email` binding) for sign-in emails.
- **R2** (`FILES` binding, bucket `billsplit-attachments`) for expense attachments: PDFs and images up to 10 MB, served only to the group's members.
- A daily cron trigger removes expired sessions and sign-in requests older than 90 days, and the attachments of archived groups that have had no activity for 90 days.

## Security notes

- Sign-in codes, link tokens and session tokens are stored only as SHA-256 hashes. The email log never stores the code.
- Codes expire after 15 minutes, allow 5 wrong attempts, and work once. Each email address can request at most 5 codes per 15 minutes.
- Sign-in links open a confirmation page instead of signing in on GET, so email link scanners can't use them up.
- Sessions are `HttpOnly; Secure; SameSite=Lax` cookies valid for 90 days. Cross-origin mutating requests are refused.
- Every group endpoint checks that the signed-in user is in that group. The admin area needs two things: a Cloudflare Access login (an Access application covers `/admin` and `/api/admin`) and a BillSplit session, both for an `ADMIN_EMAILS` address. The Worker verifies the Access JWT (`Cf-Access-Jwt-Assertion`) itself, so the admin API stays closed even if a request gets past Access. It returns 404 to non-admins and fails closed while `ACCESS_AUD` is empty. Invite tokens are masked in admin views and logs.

## Development

```bash
pnpm install
pnpm db:migrate:local
pnpm dev          # builds the front end, then runs the Worker on http://localhost:8787
```

For front-end work with hot reload, run `pnpm exec wrangler dev` in one terminal and `pnpm dev:web` in another, then open http://localhost:3000. Nuxt sends `/api` to the Worker on port 8787.

In local dev, the email binding doesn't send mail. Wrangler prints each sign-in email (including the code) to the terminal.

```bash
pnpm test        # split, settle-up and invite-status logic
pnpm typecheck   # Worker (tsc) and front end (vue-tsc)
pnpm build       # front end into web/.output/public
```

## Deploying your own

1. `pnpm exec wrangler d1 create billsplit` and put the returned `database_id` in `wrangler.jsonc`. Create the attachments bucket with `pnpm exec wrangler r2 bucket create billsplit-attachments`.
2. Onboard your sending domain to Cloudflare Email Sending (`pnpm exec wrangler email sending enable example.com`).
3. In `wrangler.jsonc`, set the `routes` pattern, `APP_URL`, `EMAIL_FROM` (an address on that domain), and `ADMIN_EMAILS`.
4. Create a Cloudflare Access self-hosted application with destinations `<host>/admin` and `<host>/api/admin`, then set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` (the application's AUD tag). For local dev, `.dev.vars` can set `DEV_DISABLE_ACCESS=true` while `ACCESS_AUD` is empty.
5. `pnpm run deploy` builds the front end, applies the D1 migrations and deploys the Worker.

## License

MIT
