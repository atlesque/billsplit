// Loads the signed-in user before the first render, so pages never flash the sign-in form.
export default defineNuxtPlugin(async () => {
  const { signedIn, signedOut } = useSession();
  try {
    const res = await fetch("/api/me", { headers: { Accept: "application/json" } });
    if (res.ok) signedIn(await res.json());
    else signedOut();
  } catch {
    signedOut();
  }
});
