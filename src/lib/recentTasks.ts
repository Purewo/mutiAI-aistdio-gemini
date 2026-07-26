/**
 * Local record of recently submitted Tasks.
 *
 * The current OpenAPI snapshot has no route that lists an organization's Tasks, so after
 * navigation away the browser has no contracted way to rediscover a task_id. This module keeps a
 * small localStorage list purely as a frontend convenience for finding recently submitted Tasks
 * again. It is explicitly not product data: the Task resource itself is always refetched from the
 * backend, and this list is labeled as a local record in the UI.
 *
 * Remove this once the backend exposes a Task list contract (gap reported to the backend owner).
 */

export interface RecentTaskRecord {
  task_id: string;
  organization_id: string;
  /** First 200 characters of the request, for display only. */
  request_preview: string;
  submitted_at: string;
}

/**
 * Storage key kept at the historical working name on purpose: renaming it would silently discard
 * records users already have, and it is never shown in the UI.
 */
const STORAGE_KEY = 'mutiai.recent-tasks.v1';
const MAX_RECORDS = 20;

export function listRecentTasks(organizationId?: string): RecentTaskRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentTaskRecord[];
    if (!Array.isArray(parsed)) return [];
    return organizationId
      ? parsed.filter((record) => record.organization_id === organizationId)
      : parsed;
  } catch {
    return [];
  }
}

export function rememberTask(record: RecentTaskRecord): void {
  try {
    const existing = listRecentTasks().filter((item) => item.task_id !== record.task_id);
    const next = [record, ...existing].slice(0, MAX_RECORDS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A full or unavailable localStorage only loses the convenience list, never product data.
  }
}
