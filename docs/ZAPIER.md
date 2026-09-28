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
| seats | `seats`, `users`, `licenses`, `field_users` — `"120 users"` is read as `120` |
| integration | `integration_tier`, `integration`, `tier`, `complexity` — `0`–`5`, or a name: none, standard, intermediate, advanced, complex, unknown |
| implementation owner | `implementation_owner_email`, `onboarding_owner`, `specialist_email` — names the person; skips the rule |

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
4. Seats and the integration tier land on the deal's onboarding intake, so the
   plan panel and the welcome page already know them.
5. **Somebody is assigned.** The deal is weighed (base + ARR band + seat band +
   integration tier, tuned under Admin → Assignment) and handed to whoever in
   the pool is carrying the least over the counting window — so the person who
   just took the tier-4 integration is skipped on the next small one. If the
   row named an `implementation_owner_email`, that person gets it instead. They
   receive an email with the three things to do first: grab the Gong recording,
   upload the SOW, open the welcome page. The response carries `assigned_to`.
   An empty pool never fails the row; the project is created unassigned and the
   deal page says so.

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

---

# Field Fusion request → proof-of-concept deal, from GoCanvas

Liesl fills the **New FF Client Request** form in GoCanvas for every prospective
Field Fusion client. A Zap posts each submission here, and the company opens as a
**Prospect** on the Field Fusion path, marked **POC** on the board, with the main
admin as its contact and every answer kept on the deal. The Field Fusion setup
notes are written from it once, so when the deal is Closed Won nothing she wrote
is typed a second time.

**Endpoint:** `POST https://www.gcinternalportal.com/api/v1/field-fusion-requests`
**Auth:** `Authorization: Bearer gcp_live_…` — a key with the `accounts:write` scope (the closed-won key works)
**Setup screen:** Admin → Integrations → Zapier, second card (copy-paste values)

## The Zap

1. **Trigger** — GoCanvas → *New Submission*, on the New FF Client Request form.
2. **Action** — Webhooks by Zapier → *POST*.
   - URL: the endpoint above
   - Payload type: `json`
   - Headers: `Authorization` = `Bearer gcp_live_…`
   - Data: one key per field on the form. Only `company_name` is required.

```json
{
  "submission_id":       "{{Submission ID}}",
  "submission_no":       "{{No.}}",
  "submitted_at":        "{{Date}}",
  "company_name":        "{{Company Name}}",
  "logo_url":            "{{Logo}}",
  "admin_first_name":    "{{Main Admin First Name}}",
  "admin_last_name":     "{{Main Admin Last Name}}",
  "admin_gcid":          "{{Main Admin GCID}}",
  "admin_email":         "{{Main Admin Email}}",
  "admin_phone":         "{{Main Admin Phone}}",
  "salesforce_url":      "{{SalesForce Opp/Account link}}",
  "industry":            "{{Industry}}",
  "features":            "{{Relevant Features}}",
  "analytics_needs":     "{{Describe analytics needs}}",
  "output_destinations": "{{Output Destinations}}",
  "first_use_case":      "{{First Use Case is}}",
  "process_description": "{{Description of Process}}",
  "forms_in_progress":   "{{GoCanvas Form/s In-Progress}}",
  "pdf_designer":        "{{PDF is Designer}}",
  "data_sets":           "{{Relevant Data Sets}}",
  "customers_are":       "{{Customers are}}",
  "customers_have":      "{{Customers have}}",
  "sites_are":           "{{Customer Sites have/are}}",
  "notes":               "{{Notes / Other Use Cases}}",
  "requester_name":      "{{Requester name}}",
  "requester_email":     "{{Requester email address}}"
}
```

## What the endpoint accepts

Keys are matched case- and separator-insensitively, and the form's own labels
work as keys too (`Company Name`, `Main Admin Email`, `Description of Process`…).
Blank values are ignored.

| Means | Accepted names |
| --- | --- |
| company | `company_name`, `company`, `account`, `account_name`, `customer`, `name` |
| main admin | `admin_first_name` / `main_admin_first_name`, `admin_last_name`, `admin_gcid`, `admin_email` / `email`, `admin_phone` / `phone` |
| Salesforce | `salesforce_url`, `salesforce_opp_account_link`, `salesforce_link`, `opportunity_link` |
| features | `features`, `relevant_features` — a list, or text split on commas, semicolons, pipes or line breaks |
| analytics | `analytics_needs`, `describe_analytics_needs`; `output_destinations`, `outputs` |
| use case | `first_use_case`, `first_use_case_is`, `primary_use_case`; `process_description`, `description_of_process`; `forms_in_progress`; `pdf_designer`, `pdf_is_designer` |
| data sets | `data_sets`, `relevant_data_sets` — a list, as above |
| customer context | `customers_are`, `customers_have`, `sites_are` / `customer_sites_have_are` — lists |
| notes | `notes`, `notes_other_use_cases`, `other_use_cases`, `anything_else` |
| requester | `requester_name`, `requester`; `requester_email` |
| submission | `submission_id`, `submission_no` / `no`, `submitted_at` / `date` |

Checkbox groups in GoCanvas arrive in Zapier either as a list or as one text value
with the ticked labels separated by commas or line breaks; both are read the same
way and duplicates are dropped.

## What happens

1. The deal is upserted — matched by Salesforce **account** id (001…) when the link
   is an account link, else by company name. A new deal opens as a **Prospect**. A
   deal that already exists keeps its stage: re-submitting the form after the close
   never moves it back.
2. The intake is filled in: type **Field Fusion**, the industry when the form's
   wording matches one of ours (a person's later edit stands), the current process
   in the requester's words, and the main admin as the primary contact.
3. The whole submission is kept under the deal as the **Field Fusion request**
   panel (deal page → after Notes & documents), read only and word for word.
4. The Field Fusion **setup notes** — what implementation reads at the handoff —
   are written from the answers the first time. If somebody has already typed
   setup notes on the deal, theirs stay.
5. The deal is marked **POC**: a chip on its board card and a count in the
   pipeline header, until it is Closed Won.

## Delivering the same submission twice

Zapier retries. A second delivery for the same company updates the request
panel and the fields that are still blank; it never opens a second deal, never
changes the stage, and never overwrites setup notes a person edited.

## The response

`201` when a deal was opened, `200` when an existing one was updated:

```json
{
  "deal_id": "…",
  "deal_created": true,
  "stage": "prospect",
  "poc": true,
  "contact": "Kathy Schultz",
  "fields_kept": 21,
  "deal_url": "https://www.gcinternalportal.com/deals/…"
}
```

`422 validation_failed` when `company_name` is blank; `401`/`403` for a missing or
wrong-scope key.
