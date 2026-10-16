// Bank details and the SEPA transfer QR code, shared by the API, the front end and the tests.

import { friendlyFormatIBAN, isSEPACountry, isValidBIC, validateIBAN, ValidationErrorsIBAN } from "ibantools";

/** Upper case without spaces, the way IBANs and BICs are stored. */
export const compact = (value: string) => value.replace(/[\s-]+/g, "").toUpperCase();

/** "BE71096123456769" -> "BE71 0961 2345 6769" */
export const formatIban = (iban: string) => friendlyFormatIBAN(compact(iban)) ?? iban;

export type IbanProblem = "format" | "country" | "length" | "checksum";

/**
 * Why an IBAN is not a valid SEPA IBAN, or null when it is. Expects compact() input.
 * The checks (per-country length and structure, mod-97 checksum, SEPA membership) come from ibantools.
 */
export function ibanProblem(iban: string): IbanProblem | null {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return "format";
  const { valid, errorCodes } = validateIBAN(iban);
  if (errorCodes.includes(ValidationErrorsIBAN.NoIBANCountry) || !isSEPACountry(iban.slice(0, 2))) return "country";
  if (valid) return null;
  if (errorCodes.includes(ValidationErrorsIBAN.WrongBBANLength)) return "length";
  return "checksum";
}

/** BIC (SWIFT code) of 8 or 11 characters, checked by ibantools. Expects compact() input. */
export const isBic = (bic: string) => isValidBIC(bic);

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
