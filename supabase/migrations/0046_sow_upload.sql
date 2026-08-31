-- 0046 — the SOW is a file, not a link
--
-- 0045 gave the deal a SOW with a `sow_document_url`, on the assumption that
-- the signed PDF lives in Docusign or Drive and a link is enough. It is not
-- what people have: they have the countersigned PDF, and asking them to first
-- put it somewhere else and then paste a URL is the reason a field stays
-- empty.
--
-- WHY A SECOND COLUMN AND NOT A REUSED ONE. A storage path and a URL are
-- different things — one is signed on demand out of a private bucket, the
-- other is opened as-is — and a column named `_url` holding sometimes one and
-- sometimes the other is a bug waiting for whoever reads it next. Both stay:
-- an uploaded PDF and a link to a system of record are both legitimate, and
-- some SOWs really do live in Docusign.
--
-- Mirrored onto `implementations` so the handoff carry stays a straight copy
-- of identically named columns, exactly as 0045 set up.

alter table portal_accounts add column if not exists sow_document_path text;
alter table implementations add column if not exists sow_document_path text;

comment on column portal_accounts.sow_document_path is
  'The signed SOW, uploaded. A path into the private attachments bucket, never '
  'a public URL — the server mints a short-lived signed link per download. '
  'sow_document_url remains for a SOW that lives in another system.';
