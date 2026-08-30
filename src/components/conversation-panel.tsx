import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Lock, MessageSquare, Send, UserMinus, UserPlus } from "lucide-react";

import { NoRows, Panel } from "@/components/record";
import {
  addConversationParticipant,
  getConversation,
  markConversationRead,
  postConversationMessage,
  removeConversationParticipant,
} from "@/lib/conversation.functions";
import { segmentBody, type MentionParticipant } from "@/lib/mentions";
import type { ConversationView, Message, Participant } from "@/lib/conversation";
import { fmtDateTime } from "@/lib/hub-format";
import { cn } from "@/lib/utils";

/**
 * The project conversation, internal side.
 *
 * The design problem this panel exists to solve is that one thread carries two
 * audiences. A note about a customer and a message TO that customer sit two
 * lines apart, and getting them the wrong way round is the mistake that matters
 * — so the composer states which one it is about to send, in words, at the
 * moment of sending, and an internal message is visually unmistakable in the
 * transcript.
 *
 * Nothing here is the security boundary. The server refuses an internal mention
 * of a customer contact and the database refuses it again (0029). What this
 * gives is the third thing neither of those can: a person seeing what they are
 * about to do before they do it.
 */

const REFRESH_MS = 30_000;

export function ConversationPanel({
  implementationId,
  projectName,
}: {
  implementationId: string;
  projectName?: string;
}) {
  const qc = useQueryClient();
  const [visibility, setVisibility] = useState<"shared" | "internal">("shared");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPeople, setShowPeople] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);

  const thread = useQuery({
    queryKey: ["conversation", implementationId],
    queryFn: () => getConversation({ data: { implementationId } }),
    // Polled rather than pushed. A conversation whose messages arrive only on a
    // page reload is a conversation people stop using; a socket is the right
    // answer and is not this change.
    refetchInterval: REFRESH_MS,
  });

  const data = thread.data as ConversationView | undefined;
  const refresh = () => qc.invalidateQueries({ queryKey: ["conversation", implementationId] });

  const post = useMutation({
    mutationFn: (input: { body: string; visibility: "shared" | "internal" }) =>
      postConversationMessage({ data: { implementationId, ...input } }),
    onSuccess: () => {
      setDraft("");
      setError(null);
      refresh();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "That didn't send."),
  });

  const addPerson = useMutation({
    mutationFn: (input: { profileId?: string; contactId?: string }) =>
      addConversationParticipant({ data: { implementationId, ...input } }),
    onSuccess: refresh,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Could not add them."),
  });

  const removePerson = useMutation({
    mutationFn: (participantId: string) =>
      removeConversationParticipant({ data: { implementationId, participantId } }),
    onSuccess: refresh,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Could not remove them."),
  });

  // Mark read once the thread has been on screen. Not on every render, and not
  // on mount before the data arrives — either would clear the unread badge for
  // messages nobody has actually seen.
  const markedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!data || data.unread === 0) return;
    const key = `${implementationId}:${data.messages.length}`;
    if (markedFor.current === key) return;
    markedFor.current = key;
    const t = setTimeout(() => {
      void markConversationRead({ data: { implementationId } })
        .then(refresh)
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.messages.length, data?.unread, implementationId]);

  const live = useMemo(
    () => (data?.participants ?? []).filter((p) => p.removed_at === null),
    [data?.participants],
  );
  const audience = useMemo(
    () => (visibility === "internal" ? live.filter((p) => p.party_kind === "internal") : live),
    [live, visibility],
  );

  // What the composer is about to do, computed from the draft as it is typed.
  // The room is built inside the memo so the dependency is the audience itself
  // rather than a fresh array identity on every render.
  const preview = useMemo(() => {
    const room: MentionParticipant[] = audience.map((p) => ({
      id: p.id,
      handle: p.handle,
      display_name: p.display_name,
    }));
    return segmentBody(draft, room);
  }, [draft, audience]);
  const named = preview.filter((s) => s.kind === "mention").length;
  const unknownHandles = [
    ...new Set(preview.filter((s) => s.kind === "unknown").map((s) => s.text)),
  ];
  const everyone = preview.some((s) => s.kind === "everyone");

  // A handle that belongs to somebody on the OTHER side of the line the current
  // visibility draws. Warned about here, refused by the server, refused again
  // by the database — this layer is the one that stops it being typed.
  const outOfAudience = useMemo(() => {
    if (visibility !== "internal") return [];
    const all = live.map((p) => ({ id: p.id, handle: p.handle, display_name: p.display_name }));
    const mentioned = segmentBody(draft, all).filter(
      (s): s is { kind: "mention"; text: string; participant: MentionParticipant } =>
        s.kind === "mention",
    );
    const externalIds = new Set(live.filter((p) => p.party_kind === "external").map((p) => p.id));
    return [
      ...new Set(mentioned.filter((s) => externalIds.has(s.participant.id)).map((s) => s.text)),
    ];
  }, [draft, live, visibility]);

  const insertHandle = (handle: string) => {
    setDraft((d) => (d.endsWith(" ") || d.length === 0 ? `${d}@${handle} ` : `${d} @${handle} `));
    composer.current?.focus();
  };

  if (thread.isError) {
    return (
      <Panel title="Project conversation">
        <NoRows label="Conversations are not switched on for this deployment yet." />
      </Panel>
    );
  }

  const messages = data?.messages ?? [];

  return (
    <Panel
      title="Project conversation"
      meta={
        projectName
          ? `${projectName} · one thread, both sides`
          : "One thread the customer and the team both write in"
      }
      action={
        <div className="flex items-center gap-1">
          {data && data.unread > 0 ? (
            <span className="rounded-sm bg-foreground px-1.5 py-0.5 font-mono text-[10px] text-background">
              {data.unread} new
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setShowPeople((v) => !v)}
            className="rounded-sm border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
          >
            {live.length} in the room
          </button>
        </div>
      }
    >
      {error ? (
        <p role="alert" className="mx-3 mt-3 rounded-md bg-destructive/10 px-3 py-2 text-[12px]">
          {error}
        </p>
      ) : null}

      {showPeople ? (
        <PeopleList
          participants={data?.participants ?? []}
          onRemove={(id) => removePerson.mutate(id)}
          onAdd={(input) => addPerson.mutate(input)}
          busy={addPerson.isPending || removePerson.isPending}
        />
      ) : null}

      {messages.length === 0 ? (
        <NoRows label="Nothing here yet. Post a shared message and the customer sees it in their plan; post an internal note and only the team does." />
      ) : (
        <ul className="divide-y divide-border">
          {messages.map((m) => (
            <MessageRow key={m.id} message={m} participants={data?.participants ?? []} />
          ))}
        </ul>
      )}

      <form
        className="border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const body = draft.trim();
          if (!body) return;
          post.mutate({ body, visibility });
        }}
      >
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {(["shared", "internal"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisibility(v)}
              className={cn(
                "flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px]",
                visibility === v ? "border-foreground" : "border-border text-muted-foreground",
              )}
            >
              {v === "internal" ? (
                <Lock className="h-3 w-3" />
              ) : (
                <MessageSquare className="h-3 w-3" />
              )}
              {v === "internal" ? "Internal note" : "Shared with the customer"}
            </button>
          ))}
          {audience.length > 0 ? (
            <span className="ml-auto flex flex-wrap items-center gap-1">
              <AtSign className="h-3 w-3 text-muted-foreground" />
              {audience.slice(0, 6).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => insertHandle(p.handle)}
                  className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  title={p.display_name}
                >
                  @{p.handle}
                </button>
              ))}
            </span>
          ) : null}
        </div>

        <textarea
          ref={composer}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={20000}
          placeholder={
            visibility === "internal"
              ? "A note for the team. The customer never sees this."
              : "A message the customer will see in their plan."
          }
          className={cn(
            "w-full resize-y rounded-md border bg-background px-3 py-2 text-[13px]",
            visibility === "internal"
              ? "border-dashed border-muted-foreground/50"
              : "border-border",
          )}
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-muted-foreground">
            {visibility === "internal" ? (
              <>
                Internal note — {audience.length} teammate{audience.length === 1 ? "" : "s"} can see
                it.
              </>
            ) : (
              <>
                Shared — {audience.filter((p) => p.party_kind === "external").length} on the
                customer side will see it.
              </>
            )}
            {named > 0 || everyone ? (
              <> Notifying {everyone ? "everyone in the audience" : `${named} named`}.</>
            ) : null}
          </p>
          <button
            type="submit"
            disabled={post.isPending || draft.trim().length === 0 || outOfAudience.length > 0}
            className="ml-auto flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[12px] disabled:opacity-40"
          >
            <Send className="h-3 w-3" />
            {visibility === "internal" ? "Post note" : "Send"}
          </button>
        </div>

        {outOfAudience.length > 0 ? (
          <p role="alert" className="mt-2 text-[11px] text-destructive">
            {outOfAudience.join(", ")} {outOfAudience.length === 1 ? "is" : "are"} on the customer
            side and cannot be named in an internal note — they would be notified about something
            they cannot read. Switch to a shared message, or drop the mention.
          </p>
        ) : null}
        {unknownHandles.length > 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {unknownHandles.join(", ")} {unknownHandles.length === 1 ? "matches" : "match"} nobody
            in this thread and will not notify anyone.
          </p>
        ) : null}
      </form>
    </Panel>
  );
}

function MessageRow({ message, participants }: { message: Message; participants: Participant[] }) {
  const room: MentionParticipant[] = participants.map((p) => ({
    id: p.id,
    handle: p.handle,
    display_name: p.display_name,
  }));
  const internal = message.visibility === "internal";

  return (
    <li className={cn("px-4 py-3", internal && "bg-muted/40")}>
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="text-[12px] font-medium">{message.author_name}</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {message.author_kind === "external" ? "customer" : "GoCanvas"}
        </span>
        {internal ? (
          <span className="flex items-center gap-1 rounded-sm border border-dashed border-muted-foreground/50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <Lock className="h-2.5 w-2.5" /> internal
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {fmtDateTime(message.created_at)}
        </span>
      </p>
      {message.withdrawn ? (
        <p className="mt-1 text-[13px] italic text-muted-foreground">This message was withdrawn.</p>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-[13px]">
          {segmentBody(message.body, room).map((seg, i) =>
            seg.kind === "mention" || seg.kind === "everyone" ? (
              <span key={i} className="rounded-sm bg-foreground/10 px-1 font-medium">
                {seg.text}
              </span>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
      )}
      {message.edited_at ? (
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">edited</p>
      ) : null}
    </li>
  );
}

function PeopleList({
  participants,
  onRemove,
  busy,
}: {
  participants: Participant[];
  onRemove: (participantId: string) => void;
  onAdd: (input: { profileId?: string; contactId?: string }) => void;
  busy: boolean;
}) {
  const live = participants.filter((p) => p.removed_at === null);
  const gone = participants.filter((p) => p.removed_at !== null);

  return (
    <div className="border-b border-border bg-muted/30 px-4 py-3">
      <ul className="space-y-1">
        {live.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-[12px]">
            <span
              className={cn(
                "font-mono text-[10px] uppercase tracking-wider",
                p.party_kind === "external" ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {p.party_kind === "external" ? "customer" : "team"}
            </span>
            <span>{p.display_name}</span>
            <span className="font-mono text-[10px] text-muted-foreground">@{p.handle}</span>
            {!p.notify ? (
              <span className="font-mono text-[10px] text-muted-foreground">muted</span>
            ) : null}
            <button
              type="button"
              onClick={() => onRemove(p.id)}
              disabled={busy}
              className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground disabled:opacity-40"
              title="Remove from this conversation"
            >
              <UserMinus className="h-3 w-3" />
              Remove
            </button>
          </li>
        ))}
      </ul>
      {gone.length > 0 ? (
        // Shown, not hidden: past messages address these people by handle, and
        // a reader who cannot see who "@dana" was is reading an incomplete
        // record.
        <p className="mt-2 text-[11px] text-muted-foreground">
          Previously in this thread:{" "}
          {gone.map((p) => `${p.display_name} (@${p.handle})`).join(", ")}
        </p>
      ) : null}
      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        <UserPlus className="h-3 w-3" />
        Customer contacts join automatically when they are issued a plan link.
      </p>
    </div>
  );
}
