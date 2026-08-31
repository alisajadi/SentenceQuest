# Sentence Quest — Admin + Database Starter

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. Create an Auth email/password user for yourself.
4. Put the project's URL and public ANON key in `admin/admin.js`.
5. Serve this folder with a local static server and open `/admin/`.

Never put the Supabase service-role key in the browser or mobile app.

The collection import format is in:
`collections/a1-food-present-simple-001.json`

The schema is already prepared for:
- vocabulary
- word forms and relations
- grammar and patterns
- lessons
- approved alternative sentences
- collections
- gifts
- front-end configuration
- database versions
- incremental sync changes
- user progress and vocabulary

The secure collection-import Edge Function, publish function, sync endpoint,
and the Flutter mobile client are the next build steps.
