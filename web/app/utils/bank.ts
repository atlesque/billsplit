// IBAN checks and the SEPA QR payload are shared with the Worker, which validates bank details again.
export { compact as compactIban, epcPayload, formatIban, ibanProblem, isBic, MAX_HOLDER_NAME } from "../../../src/bank";
