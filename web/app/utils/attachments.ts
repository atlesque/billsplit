/** Uploads one file to an expense. `api` is the function useApi() returns. */
export async function uploadAttachment(
  api: <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>,
  groupId: string,
  expenseId: string,
  file: File,
): Promise<Attachment> {
  const body = new FormData();
  body.append("file", file, file.name);
  return api<Attachment>(`/groups/${groupId}/expenses/${expenseId}/attachments`, { method: "POST", body });
}
