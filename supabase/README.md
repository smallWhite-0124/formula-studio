# Supabase setup

1. Open Supabase Dashboard -> SQL Editor.
2. Paste and run `supabase/schema.sql`.
3. Open Authentication -> URL Configuration.
4. Set Site URL to `https://smallwhite-0124.github.io/formula-studio/`.
5. Add redirect URLs:
   - `https://smallwhite-0124.github.io/formula-studio/`
   - `http://127.0.0.1:5173/`
6. In Authentication -> Providers -> Email, enable Email provider.
7. The frontend uses only the public `publishable` key. Never expose the secret/service role key.

## Tables

- `documents`: one row per cloud document, protected by RLS.
- `document_shares`: unguessable share tokens; public access is only through `get_shared_document`.

## Frontend variables

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

The GitHub Actions workflow reads these from repository variables.
