// Pure helpers with no imports, so they can be unit tested in plain Node.

export type InviteRow = {
  id: string;
  group_id: string;
  token: string;
  member_id: string | null;
  label: string;
  created_by: string | null;
  created_at: number;
  expires_at: number;
  used_by: string | null;
  used_at: number | null;
  revoked_at: number | null;
};
export type InviteStatus = "active" | "used" | "revoked" | "expired";

export function inviteStatus(i: Pick<InviteRow, "used_at" | "revoked_at" | "expires_at">, at = Date.now()): InviteStatus {
  if (i.used_at) return "used";
  if (i.revoked_at) return "revoked";
  if (i.expires_at <= at) return "expired";
  return "active";
}
