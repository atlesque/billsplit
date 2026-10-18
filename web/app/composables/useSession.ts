/** The signed-in user (null when signed out), loaded once by plugins/session.client.ts. */
export function useSession() {
  const me = useState<User | null>("me", () => null);
  const isAdmin = useState<boolean>("isAdmin", () => false);
  // On staging, people sign in as a test user (pages/test-login.vue) instead of by email.
  const staging = useState<boolean>("staging", () => false);

  function signedIn(res: { user: User | null; isAdmin?: boolean; staging?: boolean }) {
    me.value = res.user;
    isAdmin.value = Boolean(res.isAdmin);
    if (res.staging !== undefined) staging.value = res.staging;
  }
  function signedOut() {
    me.value = null;
    isAdmin.value = false;
  }
  return { me, isAdmin, staging, signedIn, signedOut };
}
