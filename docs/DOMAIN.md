# Pointing the portal at a domain

The app has no hard-coded domain anywhere in its code. Moving it is four
changes in three consoles, and one of them is easy to forget in a way that
fails silently. This is the order to do them in and the reason for each.

Working example throughout: **gcinternalportal.com**, replacing
`g-cinternal-portal.vercel.app`.

---

## 1. Vercel — add the domain

Project → Settings → Domains → **Add**.

Add both `gcinternalportal.com` and `www.gcinternalportal.com`, and set the
apex (`gcinternalportal.com`) as **primary**. Vercel then 308-redirects the
other names to it, including the old `*.vercel.app` one.

That redirect is not cosmetic. Plan links and invites already sent to
customers contain the old host, and they are the reason to keep it resolving
rather than remove it. A customer who saved a link in February should still
land on their plan.

## 2. Registrar — DNS

Vercel will show one of two sets of records for the domain you added. Enter
them at whoever the domain was bought from.

| Record | Name  | Value                  |
| ------ | ----- | ---------------------- |
| A      | `@`   | `76.76.21.21`          |
| CNAME  | `www` | `cname.vercel-dns.com` |

Vercel shows the values to use — take them from the dashboard rather than
from this table, which is here to say what shape the answer has. Some
registrars call the apex record `@`, some leave the name blank, and some
(Cloudflare in particular) need the proxy turned OFF or the certificate
cannot be issued.

Propagation is usually minutes. Vercel issues the TLS certificate on its own
once the records resolve; there is nothing to do for HTTPS.

## 3. Vercel — set `APP_URL`

Project → Settings → Environment Variables → `APP_URL` →
`https://gcinternalportal.com` (no trailing slash), Production scope.
**Redeploy** — environment variables are read at build and boot, so an
existing deployment keeps the old value until it is rebuilt.

**This is the step that fails silently.** `APP_URL` is the origin every
*outbound* link is built from — customer plan links, internal invites, TAM
approve/decline buttons, ticket notifications, sequence tracked links. Links
the browser builds (magic links from the sign-in page, password reset) use
the current origin and are correct automatically, so the app looks entirely
fine after the cutover while every email it sends still says
`g-cinternal-portal.vercel.app`. Nothing errors. The links even work, via
the redirect from step 1. They are just wrong in front of customers.

`src/lib/app-url.ts` is the single reader. It shouts `APP_URL_UNSET` once per
process if the variable is missing in production, which covers the unset case
but cannot detect a *stale* value — that one is on whoever does the cutover.

## 4. Supabase — auth URLs

Dashboard → Authentication → URL Configuration.

- **Site URL** → `https://gcinternalportal.com`
- **Redirect URLs** → add `https://gcinternalportal.com/auth/callback`

Keep the old `https://g-cinternal-portal.vercel.app/auth/callback` in the
list until you are sure no unopened invite emails are still out there. An
invite sent before the cutover carries the old callback, and a redirect URL
that is not on the allow list does not fail loudly — Supabase silently sends
the visitor to the Site URL instead, so the person clicking gets a sign-in
page rather than the thing they were invited to.

Every auth link in the app lands on `/auth/callback`; there is no second path
to allow.

---

## Checking it worked

1. `https://gcinternalportal.com` loads and the padlock is clean.
2. The old `*.vercel.app` address redirects to it rather than serving a
   second copy.
3. Invite somebody on **Admin → Users** and read the link in the email: it
   must start with the new domain. This is the only check that covers step 3,
   and it is the step that fails quietly.
4. Sign in with a magic link from the new domain — that exercises step 4.

## What does not need changing

- Application code. No route, component or server function contains a
  domain; the only reference outside `APP_URL` was a line of prose in
  `docs/V2-BRIEF.md`.
- `PLAN_SESSION_SECRET` and the `gc_plan` cookie. Cookies do not travel
  between domains, so a customer with an open plan session on the old host
  clicks their link again and gets a new one. Nothing to rotate.
- Supabase project URL, keys, or the database. The domain is a front door.
