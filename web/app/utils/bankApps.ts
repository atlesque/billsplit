// Banking apps offered in the pay dialog on phones. No Belgian bank (nor Wise, Revolut or bunq) has a public link that
// opens a transfer with the details filled in, so each opens through its store page, which shows "Open" when the app is installed.
export type BankApp = { name: string; ios: number; android: string };

export const BANK_APPS: BankApp[] = [
  { name: "KBC", ios: 458066754, android: "com.kbc.mobile.android.phone.kbc" },
  { name: "ING", ios: 1364967778, android: "com.ing.banking" },
  { name: "Belfius", ios: 572835707, android: "be.belfius.directmobile.android" },
  { name: "BNP Paribas Fortis", ios: 516502006, android: "com.bnpp.easybanking" },
  { name: "Argenta", ios: 893585833, android: "be.argenta.bankieren" },
  { name: "Crelan", ios: 893189359, android: "be.crelan.channels.mobile.android.store" },
  { name: "Beobank", ios: 1008666594, android: "com.beobank_prod.bad" },
  { name: "Wise", ios: 612261027, android: "com.transferwise.android" },
  { name: "Revolut", ios: 932493382, android: "com.revolut.revolut" },
  { name: "bunq", ios: 1021178150, android: "com.bunq.android" },
];

const isApple = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const bankAppUrl = (app: BankApp) =>
  isApple() ? `https://apps.apple.com/app/id${app.ios}` : `https://play.google.com/store/apps/details?id=${app.android}`;
