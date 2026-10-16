// Server-side translations. English text is the key; other languages map it to their own text.
// Placeholders look like {name} and are filled in by `tr`.

export type Lang = "en" | "nl";
export const LANGS: Lang[] = ["en", "nl"];

const nl: Record<string, string> = {
  // Errors
  "Something went wrong": "Er ging iets mis",
  "Invalid JSON body": "Ongeldige JSON-body",
  "Expected a JSON object": "JSON-object verwacht",
  "{field} is required": "{field} is verplicht",
  "{field} is too long (max {max} characters)": "{field} is te lang (max. {max} tekens)",
  "{field} must be a positive amount": "{field} moet een positief bedrag zijn",
  "{field} is too large": "{field} is te groot",
  "Not found": "Niet gevonden",
  "Missing Cloudflare Access assertion": "Cloudflare Access-bevestiging ontbreekt",
  "Invalid Cloudflare Access assertion": "Ongeldige Cloudflare Access-bevestiging",
  "User not found": "Gebruiker niet gevonden",
  "Group not found": "Groep niet gevonden",
  "Please sign in": "Log in om verder te gaan",
  "This Cloudflare Access identity is not an admin": "Deze Cloudflare Access-identiteit is geen beheerder",
  "Enter a valid email address": "Vul een geldig e-mailadres in",
  "Too many sign-in emails. Wait a few minutes and try again.": "Te veel inlogmails. Wacht een paar minuten en probeer het opnieuw.",
  "Could not send the sign-in email. Try again in a moment.": "De inlogmail kon niet worden verstuurd. Probeer het zo opnieuw.",
  "This sign-in was already used. Request a new one.": "Deze inlog is al gebruikt. Vraag een nieuwe aan.",
  "Could not create account": "Het account kon niet worden aangemaakt",
  "This code has expired. Request a new one.": "Deze code is verlopen. Vraag een nieuwe aan.",
  "Too many wrong codes. Request a new one.": "Te veel foute codes. Vraag een nieuwe aan.",
  "Wrong code. 1 attempt left.": "Foute code. Nog 1 poging over.",
  "Wrong code. {left} attempts left.": "Foute code. Nog {left} pogingen over.",
  "This sign-in link has expired or was already used. Request a new one.": "Deze inloglink is verlopen of al gebruikt. Vraag een nieuwe aan.",
  "Choose who paid": "Kies wie er heeft betaald",
  "Choose who to split with": "Kies met wie je verdeelt",
  "The payer is not in this group": "De betaler zit niet in deze groep",
  "Unknown participant in split": "Onbekende deelnemer in de verdeling",
  "Split values must be whole, non-negative numbers": "Verdeelwaarden moeten hele getallen van 0 of hoger zijn",
  "A payment goes from one person to one other person": "Een betaling gaat van één persoon naar één andere persoon",
  "Pick at least one person to split with": "Kies minstens één persoon om mee te verdelen",
  "The amounts per person must add up to the total": "De bedragen per persoon moeten samen het totaal zijn",
  "Expense not found": "Uitgave niet gevonden",
  '"{name}" is listed twice': '"{name}" staat er twee keer in',
  "A group can have at most {max} people": "Een groep kan maximaal {max} personen hebben",
  'There is already someone called "{name}" in this group': 'Er zit al iemand met de naam "{name}" in deze groep',
  "{name} is in some expenses. Remove them from those expenses first.": "{name} staat in een of meer uitgaven. Haal deze persoon daar eerst uit.",
  "Currency must be a 3-letter code such as EUR": "Valuta moet een code van 3 letters zijn, zoals EUR",
  "Only the person who created the group can delete it": "Alleen wie de groep heeft gemaakt, kan hem verwijderen",
  "Person not found": "Persoon niet gevonden",
  "Use “Leave group” to remove yourself": "Gebruik “Groep verlaten” om jezelf te verwijderen",
  "Cross-origin request refused": "Verzoek van een ander domein geweigerd",
  "Method not allowed": "Methode niet toegestaan",
  "Only the group owner can do this": "Alleen de eigenaar van de groep kan dit doen",
  "Only the person who added this, the group owner or an admin can change it":
    "Alleen wie dit heeft toegevoegd, de eigenaar van de groep of een beheerder kan dit wijzigen",
  "This invite can no longer be cancelled": "Deze uitnodiging kan niet meer worden ingetrokken",
  "This link doesn't exist. Check the link or ask the group for it again.": "Deze link bestaat niet. Controleer de link of vraag de groep er opnieuw om.",
  "This link no longer works. Ask the group for the current link.": "Deze link werkt niet meer. Vraag de groep om de huidige link.",
  "This group is locked, so nobody new can join. Ask the group owner to unlock it.":
    "Deze groep is vergrendeld, dus er kan niemand nieuw bij. Vraag de eigenaar van de groep om hem te ontgrendelen.",
  "This link was just used. Ask the group for the current link.": "Deze link is net gebruikt. Vraag de groep om de huidige link.",
  "Someone else already joined as that person. Pick another name.": "Iemand anders doet al mee als die persoon. Kies een andere naam.",
  "Enter an IBAN, such as BE71 0961 2345 6769": "Vul een IBAN in, zoals BE71 0961 2345 6769",
  "Only IBANs from SEPA countries (the EU, EEA, UK and Switzerland, among others) are supported":
    "Alleen IBAN's uit SEPA-landen (onder meer de EU, de EER, het VK en Zwitserland) worden ondersteund",
  "This IBAN has the wrong number of characters for its country": "Deze IBAN heeft het verkeerde aantal tekens voor zijn land",
  "This IBAN isn't valid. Check it for typos.": "Deze IBAN klopt niet. Controleer hem op tikfouten.",
  "Enter a BIC of 8 or 11 characters, such as GKCCBEBB, or leave it empty":
    "Vul een BIC van 8 of 11 tekens in, zoals GKCCBEBB, of laat het leeg",
  "Unknown participant in payment": "Onbekende deelnemer in de betaling",
  "Only {name} can mark this payment as sent": "Alleen {name} kan deze betaling als verstuurd markeren",
  "A payment from {from} to {to} is already waiting to be confirmed": "Een betaling van {from} aan {to} wacht al op bevestiging",
  "Payment not found": "Betaling niet gevonden",
  "Unknown payment status": "Onbekende betalingsstatus",
  "Only {name} can confirm this payment": "Alleen {name} kan deze betaling bevestigen",
  "This payment is already closed": "Deze betaling is al afgerond",
  "Only {name} can cancel this payment": "Alleen {name} kan deze betaling annuleren",

  // Field names used in validation errors
  Email: "E-mailadres",
  Request: "Verzoek",
  Code: "Code",
  Token: "Token",
  Name: "Naam",
  Title: "Titel",
  Amount: "Bedrag",
  Category: "Categorie",
  "Group name": "Groepsnaam",
  Description: "Beschrijving",
  "Your name": "Je naam",
  "Account holder": "Rekeninghouder",

  // Sign-in email
  "Sign in to BillSplit (code {code})": "Inloggen bij BillSplit (code {code})",
  "Sign in to BillSplit": "Inloggen bij BillSplit",
  "Sign in to BillSplit with this link:": "Log in bij BillSplit met deze link:",
  "Or enter this code:": "Of vul deze code in:",
  "The link and code expire in 15 minutes and work once. If you didn't ask for this, ignore this email.":
    "De link en code verlopen na 15 minuten en werken één keer. Heb je hier niet om gevraagd? Dan kun je deze e-mail negeren.",

  // CSV export
  Date: "Datum",
  Type: "Soort",
  "Amount ({currency})": "Bedrag ({currency})",
  "Paid by": "Betaald door",
  expense: "uitgave",
  transfer: "betaling",
  Payment: "Betaling",
  "Food & drinks": "Eten & drinken",
  Groceries: "Boodschappen",
  Transport: "Vervoer",
  Accommodation: "Verblijf",
  Activities: "Activiteiten",
  Shopping: "Winkelen",
  Bills: "Rekeningen",
  Other: "Overig",
};

const dictionaries: Record<Lang, Record<string, string>> = { en: {}, nl };

/** Translates English text (with {placeholders}) into `lang`, falling back to English. */
export function tr(lang: Lang, text: string, params: Record<string, string | number> = {}): string {
  const template = dictionaries[lang][text] ?? text;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

/** The language for a request: `?lang=` first, then the Accept-Language header, then English. */
export function requestLang(request: Request): Lang {
  const param = new URL(request.url).searchParams.get("lang");
  if (param && (LANGS as string[]).includes(param)) return param as Lang;
  const ranked = (request.headers.get("Accept-Language") ?? "")
    .split(",")
    .map((part, i) => {
      const [tag, ...rest] = part.trim().split(";");
      const q = rest.map((p) => /^\s*q=([\d.]+)/.exec(p)?.[1]).find(Boolean);
      return { base: tag.toLowerCase().split("-")[0], q: q === undefined ? 1 : Number(q), i };
    })
    .filter((x) => x.base && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  return (ranked.find((x) => (LANGS as string[]).includes(x.base))?.base as Lang) ?? "en";
}

export const dictionary = (lang: Lang) => dictionaries[lang];
