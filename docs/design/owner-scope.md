# Whose accounts am I looking at?

## What was asked, and what this is

> "If I am Teya (an implementation lead) all my reporting/dashboards should only
> show my accounts. There however will need to be a toggle or a report that can
> be generated so in case she is covering someone she can see other accounts —
> but the main view needs to be hers only."

This is built as a **default view**, not as an access restriction, and the
difference matters enough to say twice.

Teya's first screen is her own book. She can switch to a colleague's, or to
everything, in one click, and nothing stops her. That is what the second half of
the request asks for: covering for somebody on leave is a Tuesday, not an
exception, and a permission model that turns covering into an act of
administration is a permission model people route around — usually by sharing a
login.

**Real row-level restriction is a different change.** Rows that do not exist for
Teya at all would have to be enforced in the database (triggers, or policies
that the service-role client does not bypass), it would break covering unless
covering became a grant somebody administers, and it would break every
cross-account view the leadership page is made of. If it is ever wanted it is
worth doing properly; it is not what this is.

What this does buy: a first screen about her work, a header that always names
whose book is on screen, and a URL she can send to somebody else that shows them
the same thing.

## Where it applies

| Surface | Function | Scoped on |
| --- | --- | --- |
| Today (`/`) | `getHome` | implementations |
| Customers (`/customers`) | `getHome` | implementations |
| Leadership (`/portfolio`) | `getLeadership` | implementations |
| Pipeline (`/pipeline`) | `getPipeline` | accounts |

**Not scoped: the Customer 360.** Opening a specific account from a link, a
search result or an escalation has to work whoever you are. Scoping the record
view would turn "my default view" into "I cannot help my colleague".

The pipeline scopes on the **account's** own owners rather than through
implementations, because a deal in Prospect has no implementation yet — scoping
it by delivery ownership would empty the left-hand columns of the board, which
are the ones a seller cares most about.

## What counts as mine

All four of these, because the schema keeps ownership in two vocabularies and a
person is the same human in both:

| Field | Table | Points at |
| --- | --- | --- |
| `owner_id` | `implementations` | `team_members` |
| `csm_owner_id` | `customers` | `team_members` |
| `am_owner_id` | `portal_accounts` | `portal_profiles` |
| `se_owner_id` | `portal_accounts` | `portal_profiles` |

A definition that recognised only the implementation lead would give every SE and
every AM an empty dashboard on day one.

## The rules that keep it honest

**The viewer is never taken from the client.** `resolveScope` is handed the
profile id the auth middleware put on the request context and looks up the rest.
A caller may ask to see all accounts or a named colleague's book — that is the
point — but it cannot ask to *be* somebody else.

**Anything unrecognised falls back to "mine", never to "all".** A typo in a
shared link, a stale owner id, a `person` scope with no id: all of them land on
the viewer's own book. A broken link should show somebody less than they
expected, never more.

**The scope lives in the URL.** Not in component state, not in a stored
preference. "Can you look at Teya's book with me" is answered by sending a link;
a view that exists only inside one browser session cannot be shared, bookmarked,
or pasted into the ticket where somebody is asking about it. The default is
*absent* from the URL rather than `?scope=mine`, so ordinary links stay clean and
the server's default is the single definition of what "mine" means.

**It always says whose book is on screen.** Including on the default. A filtered
list that does not mention it is how somebody concludes an account was deleted,
or that the hub has lost half the pipeline — and the first time that happens they
stop trusting every number on the page.

**Rows that fall outside the scope are removed, not orphaned.** `loadHome`
narrows the implementations first and then drops the commitments, risks, issues,
escalations and audit entries belonging to accounts outside it. Leaving them
would render rows labelled "Unknown customer", which reads as data loss rather
than as a filter.

## Cost

One extra query (`portal_accounts`) when a scope is active, and none when it is
not. The implementation list was already fetched whole and joined in memory, so
the filter itself is free.
