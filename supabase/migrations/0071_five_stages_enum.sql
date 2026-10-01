-- 0071: the operating model's three middle stages, as enum values.
--
-- "Onboarding" was one stage holding three meetings. The operating model
-- names the stages the team, the customer and the Hub all use: Get it
-- working, Make it yours, Make it run — each ending at a gate, not after a
-- number of meetings. Pre-Kickoff and Implementation Complete keep their
-- enum values and are relabelled in 0072.
--
-- This migration contains ONLY the ADD VALUEs: a new enum value cannot be
-- used in the transaction that adds it (see 0056). The pipeline rows, the
-- data move and the journey resync live in 0072.
alter type portal_account_stage add value if not exists 'get_it_working' after 'onboarding_kickoff';
alter type portal_account_stage add value if not exists 'make_it_yours' after 'get_it_working';
alter type portal_account_stage add value if not exists 'make_it_run' after 'make_it_yours';
