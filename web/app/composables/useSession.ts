/** The signed-in user (null when signed out), loaded once by plugins/session.client.ts. */
export function useSession() {
  const me = useState<User | null>("me", () => null);
  const isAdmin = useState<boolean>("isAdmin", () => false);

  function signedIn(res: { user: User | null; isAdmin?: boolean }) {
    me.value = res.user;
    isAdmin.value = Boolean(res.isAdmin);
  }
  function signedOut() {
    me.value = null;
    isAdmin.value = false;
  }
  return { me, isAdmin, signedIn, signedOut };
}
