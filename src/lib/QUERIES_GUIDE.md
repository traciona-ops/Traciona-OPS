# Query Optimization Guide: `selectLead()`

Lazy-load lead data to reduce query bloat and improve performance. Use `selectLead()` instead of hardcoding field lists.

## API

```ts
import { selectLead } from '@/lib/queries';

// Returns Supabase select string for leads table
selectLead(fields?: 'basic' | 'full' | 'extended') → string
```

### Levels

| Level | Fields | When to Use |
|-------|--------|-----------|
| **basic** | `id, name, phone, created_at, updated_at` | Default. Quick lookups, lists, checks. |
| **full** | basic + `stage_id, owner_id, pipeline_id, notes, profiles(*), pipeline_stages(*)` | Need pipeline/stage/owner context. |
| **extended** | full + `lead_tags, lead_notes, lead_tasks, lead_transfers` | Detail page, need all related. |

## Examples

### Quick Fetch (Most Common)
```ts
// Fetch just for phone validation
const { data: lead } = await supabase
  .from("leads")
  .select(selectLead('basic'))
  .eq("id", leadId)
  .single();

if (!lead?.phone) return { error: "Lead sem telefone." };
```

### With Owner & Stage (Kanban Board)
```ts
// Need to display owner name and current stage
const { data: leads } = await supabase
  .from("leads")
  .select(selectLead('full'))
  .eq("pipeline_id", pipelineId)
  .eq("stage_id", stageId);
```

### Full Detail Page (Lazy-Load Related)
```ts
// Page component fetches basic, loads notes/tasks on demand
const { data: lead } = await supabase
  .from("leads")
  .select(selectLead('extended'))
  .eq("id", leadId)
  .single();

// Later: fetch specific related if needed
const { data: notes } = await supabase
  .from("lead_notes")
  .select("*, author:profiles(name)")
  .eq("lead_id", lead.id)
  .order("created_at", { ascending: false });
```

## Client-Side Caching Pattern

For React components that fetch the same lead multiple times:

```ts
import { useMemo } from 'react';

export function LeadCard({ leadId }) {
  const lead = useMemo(async () => {
    const res = await fetch(`/api/leads/${leadId}`);
    return res.json();
  }, [leadId]);
  
  // Prevent re-fetch on parent re-render if leadId unchanged
}
```

## Best Practices

1. **Start with `'basic'`** — fetch more only if you need it.
2. **Defer related queries** — don't eager-load 10 tables on page load.
3. **Cache in React** — `useMemo()` for client-side data (even if server-cached).
4. **Batch requests** — use `Promise.all()` for multiple independent queries.

## When NOT to Use

- Already fetching `SELECT *` (use `selectLead('extended')` instead).
- Need custom field subset (write inline `.select("id, name, ...")` — that's fine).
- Eager-loading from a decision-tree query (go ahead, optimize later).

## Adding New Fields

If the lead schema changes (new column added), update `selectLead()` in `src/lib/queries.ts`:

```ts
const basic = 'id, name, phone, created_at, updated_at, new_field';
```

Then queries automatically include it.
