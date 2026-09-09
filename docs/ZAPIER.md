# Closed won → onboarding, from a Google Sheet

Closed-won lands in Slack, a Zap writes it to a sheet, and a new row in that
sheet becomes a deal at Closed Won **and** a kicked-off implementation — the
customer record, the project, its journey template and plan, and the deal
linked to it — in one call. Nobody presses anything.

**Endpoint:** `POST https://www.gcinternalportal.com/api/v1/closed-won`
**Auth:** `Authorization: Bearer gcp_live_…` — a key with the `accounts:write` scope
**Setup screen:** Admin → Integrations → Zapier (copy-paste values)

## The Zap

1. **Trigger** — Google Sheets → *New Spreadsheet Row*, on the closed-won sheet.
2. **Action** — Webhooks by Zapier → *POST*.
   - URL: the endpoint above
   - Payload type: `json`
   - Headers: `Authorization` = `Bearer gcp_live_…`
   - Data: one key per column you have. Only `company` is required.

```json
{
  "company":        "{{Account Name}}",
  "opportunity":    "{{Opportunity Name}}",
  "amount":         "{{Amount}}",
  "products":       "{{Products}}",
  "rep_email":      "{{Rep Email}}",
  "close_date":     "{{Close Date}}",
  "contact_name":   "{{Contact Name}}",
  "contact_email":  "{{Contact Email}}",
  "contact_role":   "{{Contact Title}}",
  "salesforce_url": "{{Salesforce Link}}",
  "notes":          "{{Slack Message}}"
}
```

## What the endpoint accepts

Column names are forgiving, because a sheet has whatever columns somebody gave it:

| Means | Accepted names |
| --- | --- |
| company | `company`, `account`, `account_name`, `customer`, `name` |
| amount | `amount`, `arr`, `value`, `acv`, `deal_value` — `"$48,000"` is read as `48000` |
| products | `products`, `product` — `"Forms, Dispatch"` becomes a list |
| rep | `rep_email`, `rep`, `owner_email`, `ae_email`, `closed_by` |
| contact | `contact_name` / `champion`, `contact_email`, `contact_role` / `title` |
| notes | `notes`, `summary`, `slack_message`, `message` |
| Salesforce | `salesforce_id`, or a `salesforce_url` — the **account** id (001…) is taken from a Lightning link |

Keys are matched case- and separator-insensitively: `Account Name`, `account-name`
and `accountName` are the same column. Blank cells are ignored. A malformed email
is dropped rather than failing the row.

## What happens

1. The deal is upserted at **Closed Won** — matched by Salesforce account id if
   one came through, otherwise by company name.
2. The contact is recorded on it.
3. Onboarding starts under the API key: the customer, the implementation, the
   journey template and its plan, the deal↔customer link, and the deal moves to
   the next stage. This is the **same code** the Start onboarding button runs.

## Delivering the same row twice

Zapier retries, and an edited row re-triggers. A second call for a company that
is already onboarding updates the deal's facts and answers with the project it
already has — `kicked_off: false`, with a note saying so. It never creates a
second project.

## The response

```json
{
  "deal_id": "…", "deal_created": true,
  "customer_id": "…", "implementation_id": "…",
  "kicked_off": true, "note": null,
  "deal_url": "https://www.gcinternalportal.com/deals/…",
  "project_url": "https://www.gcinternalportal.com/customers/…"
}
```

`201` when the deal was created, `200` when it already existed. A `422` names
the problem in plain words; a `401`/`403` is the key or its scope.

## When a person is still needed

If the company already exists as a customer under a different name, the endpoint
creates the deal but does not guess which account it belongs to — the response
says so (`note`), and somebody opens the deal and presses Start onboarding to
choose. Guessing wrong there would file a new customer's project under an old one.
