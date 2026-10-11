# BillSplit

Split group expenses with friends: a Tricount-style app that runs on Cloudflare Workers and D1.

**Live:** https://billsplit.atlesque.dev

## Features

- **Passwordless accounts.** Enter your email and get a 6-digit code plus a one-tap sign-in link. A new email address creates an account on first sign-in.
- **Groups** with a currency, a description and any number of participants (up to 50). Participants don't need an account.
- **Invite links.** Friends open the link, sign in, and claim their participant name (or add themselves). Links can be reset at any time.
- **Flexible splits.** Split equally, by shares (e.g. 2 for a couple), or by exact amounts. Leftover cents are distributed fairly, so shares always add up to the total.
- **Payments between people** ("money given") to record reimbursements.
- **Balances and settle-up.** See who is owed what and a short list of payments that settles everyone. "Mark paid" records the payment in one tap.
- **CSV export** of a group's expenses with the share per participant.
- Mobile-first UI with dark mode, installable as a web app.

## Stack

- One Cloudflare Worker (`src/`) serving a JSON API under `/api/*`, with no runtime dependencies.
- A static, dependency-free SPA in `public/`, served by Workers Static Assets.
- **D1** for users, sessions, groups, participants and expenses (`migrations/`).
- **Cloudflare Email Service** (`send_email` binding) for sign-in emails.
- A daily cron trigger removes expired sign-in codes and sessions.

## Security notes

- Sign-in codes, link tokens and session tokens are stored only as SHA-256 hashes.
- Codes expire after 15 minutes, allow 5 wrong attempts, and work once. Each email address can request at most 5 codes per 15 minutes.
- Sign-in links open a confirmation page instead of signing in on GET, so email link scanners can't use them up.
- Sessions are `HttpOnly; Secure; SameSite=Lax` cookies valid for 90 days. Cross-origin mutating requests are refused.
- Every group endpoint checks that the signed-in user is a participant of that group.

## Development

```bash
pnpm install
pnpm db:migrate:local
pnpm dev
```

In local dev, the email binding doesn't send mail. Wrangler prints each sign-in email (including the code) to the terminal.

```bash
pnpm test        # split and settle-up math
pnpm typecheck
```

## Deploying your own

1. `pnpm exec wrangler d1 create billsplit` and put the returned `database_id` in `wrangler.jsonc`.
2. Onboard your sending domain to Cloudflare Email Sending (`pnpm exec wrangler email sending enable example.com`).
3. In `wrangler.jsonc`, set the `routes` pattern, `APP_URL`, and `EMAIL_FROM` (an address on that domain).
4. `pnpm run deploy` applies the D1 migrations and deploys the Worker.

## License

MIT
