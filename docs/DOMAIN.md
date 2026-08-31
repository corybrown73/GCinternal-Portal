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

Do step 1 first. Vercel shows you the exact records for the domain you added,
and those are the values to enter — not the ones in this document, which are
here to say what shape the answer has. Vercel has shipped more than one apex
IP over the years (`76.76.21.21` on older projects, `216.198.79.1` on newer
ones), so copy from the dashboard rather than from memory.

| Record | Host  | Value                  |
| ------ | ----- | ---------------------- |
| A      | `@`   | *(IP Vercel shows)*    |
| CNAME  | `www` | `cname.vercel-dns.com` |

Propagation is usually minutes. Vercel issues the TLS certificate itself once
the records resolve; there is nothing to do for HTTPS.

### Namecheap specifically

This domain is registered at Namecheap, whose defaults actively fight the
records you are about to add.

1. namecheap.com → sign in → **Domain List** → **MANAGE** beside the domain.
2. On the **Domain** tab, check **NAMESERVERS** reads *Namecheap BasicDNS*.
   If it says *Custom DNS*, the records live wherever those nameservers
   point and the rest of this section does not apply.
3. Open the **Advanced DNS** tab.
4. **Delete Namecheap's two default records first.** A new domain ships with
   a parking page wired up, usually as `CNAME | www | parkingpage.cash` and
   `URL Redirect Record | @ | http://www.<domain>/`. Both collide with what
   you are adding — a host cannot have a CNAME and another record type at
   once, and Namecheap will either refuse the save or silently keep serving
   the parking page. Hover each row and use the bin icon on the right.
5. **ADD NEW RECORD** → **A Record** → Host `@` → Value: the IP from Vercel →
   TTL *Automatic*.
6. **ADD NEW RECORD** → **CNAME Record** → Host `www` → Value
   `cname.vercel-dns.com` → TTL *Automatic*. Namecheap appends the trailing
   dot itself.
7. **Click the green tick at the right of each row.** Namecheap does not
   save a record until you do, and a half-entered row looks identical to a
   saved one. This is the single commonest reason a Namecheap cutover
   "doesn't propagate".
8. Check the **Redirect Domain** tab is empty. An entry there overrides the
   host records.

TTL *Automatic* is 30 minutes on BasicDNS. If you are iterating, set both
records to 1 minute first and put them back to Automatic once it works —
otherwise a mistake costs half an hour to observe.

**The alternative**, if you would rather Vercel ran DNS: Domain tab →
NAMESERVERS → *Custom DNS* → `ns1.vercel-dns.com` and `ns2.vercel-dns.com`.
That hands Vercel the whole zone, which is fewer steps now and one more
place to go for any future MX or verification record. Not recommended unless
the domain will only ever serve this app.

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

Run these yourself; each covers a step that nothing else does.

1. **DNS resolves.** `dig gcinternalportal.com +short` returns the IP Vercel
   gave you, and `dig www.gcinternalportal.com +short` ends at a Vercel
   host. Or use dnschecker.org if you would rather see it from several
   places at once. Until this passes, everything below fails for a reason
   that has nothing to do with the app.
2. **The site loads** at `https://gcinternalportal.com` with a clean padlock,
   and Vercel's Domains page shows *Valid Configuration* on both entries.
3. **The old address redirects** rather than serving a second copy — visit
   the `*.vercel.app` URL and watch the address bar change. If it does not,
   the apex is not set as primary in step 1, and every previously emailed
   customer link is now a second, divergent copy of the app.
4. **An outbound link carries the new domain.** Invite somebody on
   **Admin → Users** and read the URL in the email. This is the ONLY check
   that covers `APP_URL`, and `APP_URL` is the step that fails silently.
5. **Auth completes.** Sign in with a magic link requested from the new
   domain. That exercises the Supabase redirect allow list.

## What does not need changing

- Application code. No route, component or server function contains a
  domain; the only reference outside `APP_URL` was a line of prose in
  `docs/V2-BRIEF.md`.
- `PLAN_SESSION_SECRET` and the `gc_plan` cookie. Cookies do not travel
  between domains, so a customer with an open plan session on the old host
  clicks their link again and gets a new one. Nothing to rotate.
- Supabase project URL, keys, or the database. The domain is a front door.
