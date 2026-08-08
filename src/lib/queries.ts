/**
 * Query helpers for optimized Supabase lead queries (lazy loading).
 * Reduces query bloat by returning select strings instead of eager-loading.
 */

type SelectLevel = 'basic' | 'full' | 'extended';

/**
 * Returns a Supabase select string for leads.
 * - 'basic': id, name, phone (lightweight, most queries)
 * - 'full': + pipeline(*), stage_id, owner_id, notes
 * - 'extended': + all related (lead_tags, lead_notes, lead_tasks, etc.)
 */
export function selectLead(fields: SelectLevel = 'basic'): string {
  const basic = 'id, name, phone, created_at, updated_at';

  if (fields === 'basic') {
    return basic;
  }

  if (fields === 'full') {
    return `
      ${basic},
      stage_id,
      owner_id,
      pipeline_id,
      notes,
      profiles!leads_owner_id_fk(id, email, full_name),
      pipeline_stages!leads_stage_id_fk(id, name, color, order)
    `;
  }

  if (fields === 'extended') {
    return `
      ${basic},
      stage_id,
      owner_id,
      pipeline_id,
      notes,
      profiles!leads_owner_id_fk(id, email, full_name),
      pipeline_stages!leads_stage_id_fk(id, name, color, order),
      pipelines!leads_pipeline_id_fk(id, name),
      lead_tags(id, tag, color),
      lead_notes(id, body, created_at, profiles!lead_notes_author_id_fk(full_name)),
      lead_tasks(id, title, completed, due_date, task_type),
      lead_transfers(id, from_id, to_id, created_at)
    `;
  }

  return basic;
}

/**
 * Memoization helper for client-side lead queries.
 * Usage: const lead = useMemo(() => fetchLead(id), [id])
 * This prevents unnecessary re-fetches on re-renders.
 */
export function createLeadQueryCache<T>() {
  const cache = new Map<string, T>();

  return {
    get: (key: string) => cache.get(key),
    set: (key: string, value: T) => cache.set(key, value),
    has: (key: string) => cache.has(key),
    clear: () => cache.clear(),
  };
}
