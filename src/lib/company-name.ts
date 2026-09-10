/**
 * The company, out of the opportunity name.
 *
 * Salesforce opportunities arrive named the way reps name them:
 * "West-Com & TV-Direct NL-Demo Request-Jul 2026" — company, channel,
 * new-logo flag, lead source, close month. That string is fine as an
 * identifier in the pipeline and wrong on anything the customer sees. The
 * welcome page, the deck and the account record want "West-Com & TV".
 *
 * The rules are the conventions in the data we have, no more: cut at the
 * channel/NL marker, drop a trailing opportunity descriptor, drop a trailing
 * month-year. A name with none of those is returned as it came, so a company
 * that really is called "Summit Line Construction" is not touched.
 */

const CHANNEL_MARKER = /\s*-\s*(?:direct|partner|channel|reseller)?\s*-?\s*NL\s*-.*$/i;
const NEW_LOGO = /\s*[-–—]\s*new logo\b.*$/i;
const MONTH_YEAR =
  /\s*[-–—]\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\s*$/i;
const DESCRIPTOR =
  /\s*[-–—]\s*(?:gocanvas\s+)?(?:transition|migration|expansion|renewal|upsell|upgrade|add[- ]?on|pilot|trial|demo request|talk to an expert|contact us|inbound|outbound)\b.*$/i;

export function companyNameFrom(opportunityName: string | null | undefined): string {
  let s = (opportunityName ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(CHANNEL_MARKER, "");
  s = s.replace(NEW_LOGO, "");
  s = s.replace(MONTH_YEAR, "");
  s = s.replace(DESCRIPTOR, "");
  s = s.replace(/[\s\-–—,]+$/g, "").trim();
  return s || (opportunityName ?? "").trim();
}
