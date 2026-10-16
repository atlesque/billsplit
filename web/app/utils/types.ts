// Shapes returned by the Worker API (src/).

export interface BankDetails {
  name: string;
  iban: string;
  bic: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  bank: BankDetails | null;
}

export interface GroupSummary {
  id: string;
  name: string;
  currency: string;
  member_count: number;
  total: number;
  my_balance: number;
  /** Payments to you that are waiting for you to confirm. */
  to_confirm: number;
  archived_at: number | null;
}

export interface Group {
  id: string;
  name: string;
  currency: string;
  description: string;
  isOwner: boolean;
  /** The owner or an admin: may change the group's details and see or reset its share link. */
  canManage: boolean;
  shareToken: string | null;
  /** Archived groups are read-only. */
  archived_at: number | null;
  /** When the daily cleanup removed this archived group's attachments. */
  attachments_removed_at: number | null;
  /** Every balance is zero and no payment is waiting to be confirmed, so it can be archived. */
  settled: boolean;
}

export interface Member {
  id: string;
  name: string;
  isMe: boolean;
  isOwner: boolean;
  claimed: boolean;
  email: string | null;
  bank: BankDetails | null;
  balance: number;
  paid: number;
  spent: number;
}

export interface Share {
  memberId: string;
  weight: number;
  amount?: number;
}

/** A receipt or invoice on an expense, opened from /api/groups/:id/attachments/:attachmentId. */
export interface Attachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

export type SplitMode = "equal" | "shares" | "amounts";

export interface Expense {
  id?: string;
  kind: "expense" | "transfer";
  title: string;
  amount: number;
  date: string;
  paidBy: string;
  category?: string;
  splitMode: SplitMode;
  shares: Share[];
  /** Whoever added it, the group owner or an admin. Missing on a new or prefilled expense. */
  canEdit?: boolean;
  attachments?: Attachment[];
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

export type PaymentStatus = "sent" | "not_received" | "failed" | "received";

/** A settle-up payment that isn't complete yet (received ones are transfer expenses). */
export interface Payment {
  id: string;
  from: string;
  to: string;
  amount: number;
  status: PaymentStatus;
  createdAt: number;
  updatedAt: number;
  canConfirm: boolean;
  canCancel: boolean;
}

export interface GroupData {
  group: Group;
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
  payments: Payment[];
  meId: string;
}

export interface AuditEntry {
  id: string;
  at: number;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  group_id: string | null;
  group_name: string | null;
  details: string | null;
  ip: string | null;
}

export interface SignInRow {
  id: string;
  created_at: number;
  email: string;
  user_id: string | null;
  registered: number | boolean;
  status: string;
  used_at: number | null;
  email_status: string | null;
  email_error: string | null;
  attempts: number;
  next_path: string;
}

/** Admin API rows are shown as they come. */
export type AdminRow = Record<string, any>;
