-- Down for 0029_conversations.sql
--
-- Drops the five tables and the five functions. This DESTROYS the conversation
-- history — there is nowhere else it lives, and nothing above it to fall back
-- to. That is stated plainly rather than guarded, because a rollback of 0029 is
-- a rollback of the feature, and a down that refuses to run when there is data
-- would leave the schema half-applied instead.
--
-- Order matters: mentions and reads reference participants and messages, and
-- messages and participants reference the conversation.

drop table if exists conversation_mentions;
drop table if exists conversation_reads;
drop table if exists conversation_messages;
drop table if exists conversation_participants;
drop table if exists project_conversations;

-- After the tables, because each is the target of a trigger on one of them.
drop function if exists conversation_mention_enforce();
drop function if exists conversation_bump_activity();
drop function if exists conversation_message_enforce();
drop function if exists conversation_participant_enforce();
drop function if exists project_conversation_enforce();
