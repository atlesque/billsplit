# BillSplit

Split group expenses with friends: a Tricount-style app that runs on Cloudflare Workers and D1.

**Live:** https://billsplit.atlesque.dev

## How it works

**Starting a group.** Enter your email and open the sign-in link (or type the 6-digit code). The first sign-in creates your account. Then create a group, add the people you share costs with, and send each person their invite link. A checklist on the group page walks you through these steps.

**Joining a group.** Open the invite link. If you're signed out, the page shows the group and asks for your email, and after you sign in you land back on the invite, even if you opened the email on another device. Tap “Join as …” and you're in.

## Features

- **One email sign-in flow** for new and existing accounts: a magic link plus a 6-digit code.
- **Single-use invite links.** Each link has a random 144-bit token and is usually tied to one person in the group. It stops working once someone joins with it, can be cancelled, and expires after 30 days. Used, cancelled and expired links stay in the group's invite history.
- **Flexible splits.** Split equally, by shares, or by exact amounts. Leftover cents are spread fairly, so shares always add up to the total. You can also record payments between people.
- **Balances and settle-up.** See who is owed what and a short list of payments that settles everyone. “Mark paid” records a payment.
- **CSV export** per group.
- **Admin area** at `/admin` for emails listed in `ADMIN_EMAILS`. It shows users, groups and their people and invites, every sign-in request with its email delivery and verification status, and the full audit log.
- **Audit log** of every action: sign-in emails sent or failed, wrong codes, sign-ins, registrations, group/person/invite/expense changes. Entries record who did what, in which group, and from which IP address.

## Stack

- One Cloudflare Worker (`src/`) serving a JSON API under `/api/*`, with no runtime dependencies.
- A static, dependency-free SPA in `public/`, served by Workers Static Assets.
- **D1** for users, sessions, groups, people, invites, expenses, the email log and the audit log (`migrations/`).
- **Cloudflare Email Service** (`send_email` binding) for sign-in emails.
- A daily cron trigger removes expired sessions and sign-in requests older than 90 days.

## Security notes

- Sign-in codes, link tokens and session tokens are stored only as SHA-256 hashes. The email log never stores the code.
- Codes expire after 15 minutes, allow 5 wrong attempts, and work once. Each email address can request at most 5 codes per 15 minutes.
- Sign-in links open a confirmation page instead of signing in on GET, so email link scanners can't use them up.
- Sessions are `HttpOnly; Secure; SameSite=Lax` cookies valid for 90 days. Cross-origin mutating requests are refused.
- Every group endpoint checks that the signed-in user is in that group. Admin endpoints return 404 to non-admins. Invite tokens are masked in admin views and logs.

## Development

```bash
pnpm install
pnpm db:migrate:local
pnpm dev
```

In local dev, the email binding doesn't send mail. Wrangler prints each sign-in email (including the code) to the terminal.

```bash
pnpm test        # split, settle-up and invite-status logic
pnpm typecheck
```

## Deploying your own

1. `pnpm exec wrangler d1 create billsplit` and put the returned `database_id` in `wrangler.jsonc`.
2. Onboard your sending domain to Cloudflare Email Sending (`pnpm exec wrangler email sending enable example.com`).
3. In `wrangler.jsonc`, set the `routes` pattern, `APP_URL`, `EMAIL_FROM` (an address on that domain), and `ADMIN_EMAILS`.
4. `pnpm run deploy` applies the D1 migrations and deploys the Worker.

## License

MIT
