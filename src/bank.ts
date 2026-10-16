// Bank details and the SEPA transfer QR code. Pure functions, shared by the API, the front end and the tests.

/** IBAN length per country, for the countries in the SEPA scheme (EU, EEA and the other SEPA members). */
export const SEPA_IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AL: 28, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18,
  FR: 27, GB: 22, GI: 23, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21,
  MC: 27, MD: 24, ME: 22, MK: 19, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, RS: 22, SE: 24, SI: 19,
  SK: 24, SM: 27, VA: 22,
};

/** Upper case without spaces, the way IBANs and BICs are stored. */
export const compact = (value: string) => value.replace(/[\s-]+/g, "").toUpperCase();

/** "BE71096123456769" -> "BE71 0961 2345 6769" */
export const formatIban = (iban: string) => compact(iban).replace(/(.{4})(?=.)/g, "$1 ");

export type IbanProblem = "format" | "country" | "length" | "checksum";

/** Why an IBAN is not a valid SEPA IBAN, or null when it is. Expects compact() input. */
export function ibanProblem(iban: string): IbanProblem | null {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return "format";
  const length = SEPA_IBAN_LENGTHS[iban.slice(0, 2)];
  if (!length) return "country";
  if (iban.length !== length) return "length";
  // ISO 13616: move the first four characters to the end, turn letters into 10..35, and the number mod 97 must be 1.
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1 ? null : "checksum";
}

/** BIC (SWIFT code): 4 letters bank, 2 letters country, 2 location, optional 3 branch. Expects compact() input. */
export const isBic = (bic: string) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic);

export const MAX_HOLDER_NAME = 70;
const MAX_REMITTANCE = 140;

/**
 * The payload of an EPC QR code ("SEPA QR", "GiroCode"), which European banking apps scan to fill in
 * a SEPA credit transfer. Version 002 lets the BIC be left out. See EPC069-12.
 */
export function epcPayload(p: { name: string; iban: string; bic?: string; amountCents: number; text?: string }): string {
  const clip = (s: string, max: number) => [...s.replace(/\s+/g, " ").trim()].slice(0, max).join("");
  return [
    "BCD", // service tag
    "002", // version
    "1", // character set: UTF-8
    "SCT", // SEPA credit transfer
    compact(p.bic ?? ""),
    clip(p.name, MAX_HOLDER_NAME),
    compact(p.iban),
    `EUR${(p.amountCents / 100).toFixed(2)}`,
    "", // purpose code
    "", // structured reference (not used, so the free text below is allowed)
    clip(p.text ?? "", MAX_REMITTANCE),
  ].join("\n");
}
