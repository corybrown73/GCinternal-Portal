/**
 * What a deal is worth, once: its ARR when sales entered one, else the
 * value its SOW states. The pipeline's header and columns, Home's cards and
 * the customer page all read this, so a deal never shows two numbers.
 */
export function dealValue(a: {
  arr?: number | null | undefined;
  sow_value?: number | null | undefined;
}): number | null {
  if (a.arr != null && Number.isFinite(Number(a.arr))) return Number(a.arr);
  if (a.sow_value != null && Number.isFinite(Number(a.sow_value))) return Number(a.sow_value);
  return null;
}
