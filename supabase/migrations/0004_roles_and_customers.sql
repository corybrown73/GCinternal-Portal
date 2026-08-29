-- 0004 — Extend portal_user_role with the new role values.
--
-- This migration must contain ONLY these ADD VALUE statements: a new enum
-- value cannot be used in the same transaction that added it, so every
-- statement that USES these values lives in 0005. Each ADD VALUE is its own
-- statement on its own line.

alter type portal_user_role add value if not exists 'super_admin';

alter type portal_user_role add value if not exists 'sales';

alter type portal_user_role add value if not exists 'implementation';

alter type portal_user_role add value if not exists 'tam_se';

alter type portal_user_role add value if not exists 'manager';

alter type portal_user_role add value if not exists 'customer';
