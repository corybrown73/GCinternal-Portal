# Pointing the portal at a domain

The app has no hard-coded domain anywhere in its code. Moving it is four
changes in three consoles, and one of them is easy to forget in a way that
fails silently. This is the order to do them in and the reason for each.

Working example throughout: **gcinternalportal.com**, replacing
`g-cinternal-portal.vercel.app`.

---

## 1. Vercel — add the domain

Project → Settings → Domains → **Add**.

Add both `gcinternalportal.com` and `www.gcinternalportal.com`. One of them
serves and the other 308-redirects to it. Vercel defaults to the apex
redirecting to `www`, which is what this deployment kept.

The choice between them is cosmetic — the DNS is identical either way, the
apex reads better in a customer's inbox, `www` is one fewer thing to change.
What is NOT cosmetic is that `APP_URL` in step 3 must name whichever one
SERVES. Point it at the redirecting name and every emailed link takes a
pointless hop, and breaks outright if that redirect is ever removed.

Decide before any links go out. Afterwards it is permanent in practice:
links already sitting in customers' inboxes resolve through whatever
redirect exists at the time.

Keep the old `*.vercel.app` domain attached either way. Plan links and
invites already sent contain that host, and it is the reason to leave it
resolving rather than remove it — a customer who saved a link in February
should still land on their plan. Leaving it serving directly (rather than
redirecting) is fine here: the app is `noindex`, so two live hosts cost
nothing and old links skip a hop.

## 2. Registrar — DNS

Do step 1 first, then take the values from Vercel's own **View DNS
configuration** panel. Not from this document, and not from a tutorial.

| Record | Host  | Value                   |
| ------ | ----- | ----------------------- |
| A      | `@`   | *(IP Vercel shows)*     |
| CNAME  | `www` | *(target Vercel shows)* |

What gcinternalportal.com actually got, recorded for shape rather than for
copying:

| Record | Host  | Value                                 |
| ------ | ----- | ------------------------------------- |
| A      | `@`   | `216.150.1.1`                         |
| CNAME  | `www` | `95dfe09ebb64aa61.vercel-dns-016.com` |

Neither is the value the internet will tell you to use. The apex IP was
`76.76.21.21` for years, and Vercel's own panel now describes that and
`cname.vercel-dns.com` as legacy records that merely continue to work. The
`www` target carries a per-project hash, so it is not shared between domains
and cannot be guessed at all.

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

### The email record already sitting there

Namecheap's **Mail Settings → Email Forwarding** leaves a TXT record on `@`:
`v=spf1 include:spf.efwd.registrar-servers.com ~all`. It does not conflict
with anything above and can be left alone while the app sends mail from
another domain.

It stops being inert the day `EMAIL_FROM` points at this domain. Resend then
needs its own SPF and DKIM records, and a second unmerged SPF record on the
same host is the classic way invites start landing in spam — silently, with
nothing in the app to show for it. Handle it deliberately at that point,
rather than learning it from a customer who never got their link.

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
