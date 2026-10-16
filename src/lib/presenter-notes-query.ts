import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  choosePresenterNote,
  dropPresenterNote,
  getNotesFeatures,
  getPresenterNotes,
} from "@/lib/presenter-notes.functions";
import type { PresenterNotesView } from "@/lib/presenter-notes";

/** The caller's selections for one deal. Shared by the notes card and the Presenter Workspace. */
export const presenterNotesKey = (dealId: string) => ["presenter-notes", dealId] as const;

export function usePresenterNotes(dealId: string) {
  const load = useServerFn(getPresenterNotes);
  return useQuery<PresenterNotesView>({
    queryKey: presenterNotesKey(dealId),
    queryFn: () => load({ data: { dealId } } as never),
  });
}

export function usePresenterSelection(dealId: string) {
  const qc = useQueryClient();
  const choose = useServerFn(choosePresenterNote);
  const drop = useServerFn(dropPresenterNote);
  const refresh = () => qc.invalidateQueries({ queryKey: presenterNotesKey(dealId) });
  const add = useMutation({
    mutationFn: (journalEntryId: string) => choose({ data: { dealId, journalEntryId } } as never),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (journalEntryId: string) => drop({ data: { dealId, journalEntryId } } as never),
    onSuccess: refresh,
  });
  return { add, remove };
}

export type NotesFeatures = { customerMeetings: boolean; presenterSelections: boolean };

/** Which features this database serves. Until it answers, nothing is offered. */
export const NO_NOTES_FEATURES: NotesFeatures = {
  customerMeetings: false,
  presenterSelections: false,
};

export function useNotesFeatures(): NotesFeatures {
  const load = useServerFn(getNotesFeatures);
  const q = useQuery<NotesFeatures>({
    queryKey: ["notes-features"],
    queryFn: () => load({} as never),
    staleTime: 60_000,
  });
  return q.data ?? NO_NOTES_FEATURES;
}
