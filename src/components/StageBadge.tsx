import { STAGE_LABELS, STAGE_STYLES, type AccountStage } from "@/lib/stages";

export function StageBadge({ stage }: { stage: AccountStage }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_STYLES[stage].badge}`}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
