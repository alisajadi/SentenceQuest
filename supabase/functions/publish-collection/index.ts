import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(req: Request) {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("Missing authorization.");
  const token = header.slice(7);

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid authentication session.");

  const { data: profile, error: profileError } = await db
    .from("profiles").select("role").eq("id", data.user.id).maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (profile?.role !== "admin") throw new Error("Admin access required.");
  return data.user;
}

function versionString(major: number, minor: number) {
  return `${major}.${String(minor).padStart(2, "0")}`;
}

function numericVersion(major: number, minor: number) {
  return major * 100 + minor;
}

function nextVersion(major: number, minor: number) {
  if (minor >= 99) return { major: major + 1, minor: 0 };
  return { major, minor: minor + 1 };
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "POST required." }, 405);

  try {
    const user = await requireAdmin(req);
    const body = await req.json();
    const collectionId = body?.collection_id;

    if (!collectionId) throw new Error("collection_id is required.");

    const { data: collection, error: collectionError } = await db
      .from("collections")
      .select("*")
      .eq("id", collectionId)
      .single();

    if (collectionError || !collection) throw new Error("Collection not found.");

    const { data: items, error: itemsError } = await db
      .from("collection_items")
      .select("id,lesson_id,vocabulary_id,sort_order")
      .eq("collection_id", collectionId)
      .order("sort_order", { ascending: true });

    if (itemsError) throw itemsError;
    if (!items?.length) throw new Error("Collection has no items.");

    const lessonIds = [...new Set(
      items.map((x: any) => x.lesson_id).filter(Boolean)
    )];

    const vocabularyIds = [...new Set(
      items.map((x: any) => x.vocabulary_id).filter(Boolean)
    )];

    if (lessonIds.length) {
      const { data: lessons, error } = await db
        .from("lessons")
        .select("id,slug,title,grammar_id,pattern_id,is_published,version")
        .in("id", lessonIds);

      if (error) throw error;
      if ((lessons ?? []).length !== lessonIds.length) {
        throw new Error("Collection contains a missing lesson.");
      }
    }

    const { data: current, error: currentError } = await db
      .from("database_release")
      .select("major_version,minor_version")
      .eq("id", true)
      .single();

    if (currentError || !current) {
      throw new Error(currentError?.message ?? "Database release not found.");
    }

    let major = Number(current.major_version);
    let minor = Number(current.minor_version);

    if (!Number.isInteger(major) || major < 1) major = 1;
    if (!Number.isInteger(minor) || minor < 0 || minor > 99) minor = 0;

    const next = nextVersion(major, minor);
    major = next.major;
    minor = next.minor;

    const newVersion = versionString(major, minor);
    const numericDbVersion = numericVersion(major, minor);
    const now = new Date().toISOString();

    /*
     * PUBLISH COLLECTION
     */
    const oldCollectionVersion = Math.max(1, Number(collection.version ?? 1));
    const newCollectionVersion = collection.is_published
      ? oldCollectionVersion + 1
      : oldCollectionVersion;

    const { error: collectionUpdateError } = await db
      .from("collections")
      .update({
        is_published: true,
        version: newCollectionVersion,
        updated_at: now,
      })
      .eq("id", collectionId);

    if (collectionUpdateError) throw collectionUpdateError;

    /*
     * PUBLISH LESSONS AND INCREMENT THEIR OWN CONTENT VERSION.
     */
    const { data: lessonsToPublish, error: lessonsError } = await db
      .from("lessons")
      .select("*")
      .in("id", lessonIds);

    if (lessonsError) throw lessonsError;

    const publishedLessons: any[] = [];

    for (const lesson of lessonsToPublish ?? []) {
      const lessonVersion = Math.max(1, Number(lesson.version ?? 1));
      const nextLessonVersion = lesson.is_published
        ? lessonVersion + 1
        : lessonVersion;

      const { data: updatedLesson, error } = await db
        .from("lessons")
        .update({
          is_published: true,
          version: nextLessonVersion,
          updated_at: now,
        })
        .eq("id", lesson.id)
        .select("*")
        .single();

      if (error) throw error;
      publishedLessons.push(updatedLesson);
    }

    /*
     * LOAD RELATED CONTENT FOR A COMPLETE SYNC RELEASE.
     */
    let vocabularyRows: any[] = [];
    let grammarRows: any[] = [];
    let patternRows: any[] = [];
    let lessonWordRows: any[] = [];
    let introRows: any[] = [];

    if (vocabularyIds.length) {
      const { data, error } = await db
        .from("vocabulary")
        .select("*")
        .in("id", vocabularyIds);
      if (error) throw error;
      vocabularyRows = data ?? [];
    }

    const grammarIds = [...new Set(
      publishedLessons.map((x) => x.grammar_id).filter(Boolean)
    )];

    const patternIds = [...new Set(
      publishedLessons.map((x) => x.pattern_id).filter(Boolean)
    )];

    if (grammarIds.length) {
      const { data, error } = await db
        .from("grammar").select("*").in("id", grammarIds);
      if (error) throw error;
      grammarRows = data ?? [];
    }

    if (patternIds.length) {
      const { data, error } = await db
        .from("sentence_patterns").select("*").in("id", patternIds);
      if (error) throw error;
      patternRows = data ?? [];
    }

    if (lessonIds.length) {
      const { data, error } = await db
        .from("lesson_words").select("*").in("lesson_id", lessonIds);
      if (error) throw error;
      lessonWordRows = data ?? [];

      const { data: intros, error: introError } = await db
        .from("lesson_grammar_intro")
        .select("*")
        .in("lesson_id", lessonIds);
      if (introError) throw introError;
      introRows = intros ?? [];
    }

    /*
     * RELEASE CHECKSUM
     */
    const checksum = await sha256({
      collection_id: collection.id,
      collection_version: newCollectionVersion,
      database_version: newVersion,
      collections: [{
        id: collection.id,
        slug: collection.slug,
        version: newCollectionVersion,
      }],
      vocabulary: vocabularyRows.map((x) => x.id).sort(),
      grammar: grammarRows.map((x) => x.id).sort(),
      patterns: patternRows.map((x) => x.id).sort(),
      lessons: publishedLessons.map((x) => ({
        id: x.id,
        version: x.version,
      })).sort((a, b) => a.id.localeCompare(b.id)),
      lesson_words: lessonWordRows.map((x) => `${x.lesson_id}:${x.vocabulary_id}`).sort(),
      grammar_intro: introRows.map((x) => x.id).sort(),
    });

    /*
     * DATABASE RELEASE
     */
    const { error: releaseError } = await db
      .from("database_release")
      .update({
        major_version: major,
        minor_version: minor,
        release_name: collection.name,
        notes: `Published collection: ${collection.name}`,
        checksum,
        published_at: now,
        published_by: user.id,
        updated_at: now,
      })
      .eq("id", true);

    if (releaseError) throw releaseError;

    /*
     * DATABASE HISTORY
     */
    const { error: clearError } = await db
      .from("database_versions")
      .update({ is_current: false })
      .eq("is_current", true);

    if (clearError) throw clearError;

    const { error: historyError } = await db
      .from("database_versions")
      .insert({
        major_version: major,
        minor_version: minor,
        release_name: collection.name,
        checksum,
        notes: `Published collection ${collection.slug}`,
        is_current: true,
        published_at: now,
        published_by: user.id,
      });

    if (historyError) throw historyError;

    /*
     * SYNC CHANGES
     *
     * One release contains the complete published content needed by a client
     * that is moving from the previous DB version to this DB version.
     */
    const syncRows: any[] = [
      {
        db_version: numericDbVersion,
        entity_type: "collections",
        entity_id: collection.id,
        operation: "upsert",
        payload: {
          id: collection.id,
          language_id: collection.language_id,
          slug: collection.slug,
          name: collection.name,
          description: collection.description,
          version: newCollectionVersion,
          is_published: true,
        },
      },
      ...vocabularyRows.map((row) => ({
        db_version: numericDbVersion,
        entity_type: "vocabulary",
        entity_id: row.id,
        operation: "upsert",
        payload: row,
      })),
      ...grammarRows.map((row) => ({
        db_version: numericDbVersion,
        entity_type: "grammar",
        entity_id: row.id,
        operation: "upsert",
        payload: row,
      })),
      ...patternRows.map((row) => ({
        db_version: numericDbVersion,
        entity_type: "sentence_patterns",
        entity_id: row.id,
        operation: "upsert",
        payload: row,
      })),
      ...publishedLessons.map((row) => ({
        db_version: numericDbVersion,
        entity_type: "lessons",
        entity_id: row.id,
        operation: "upsert",
        payload: row,
      })),
      ...lessonWordRows.map((row) => ({
        db_version: numericDbVersion,
        entity_type: "lesson_words",
        entity_id: null,
        operation: "upsert",
        payload: row,
      })),
      ...introRows.map((row) => ({
        db_version: numericDbVersion,
        entity_type: "lesson_grammar_intro",
        entity_id: row.id,
        operation: "upsert",
        payload: row,
      })),
    ];

    if (syncRows.length) {
      const { error } = await db.from("sync_changes").insert(syncRows);
      if (error) throw error;
    }

    /*
     * APP UPDATE MANIFEST
     * App version is independent from database version.
     */
    const { error: manifestError } = await db
      .from("app_update_manifest")
      .update({
        minimum_database_version: newVersion,
        updated_at: now,
      })
      .eq("id", true);

    if (manifestError) throw manifestError;

    return json({
      success: true,
      collection: collection.slug,
      collection_version: newCollectionVersion,
      database_version: newVersion,
      database_version_number: numericDbVersion,
      major_version: major,
      minor_version: minor,
      published_lessons: publishedLessons.length,
      published_vocabulary: vocabularyRows.length,
      published_grammar: grammarRows.length,
      published_patterns: patternRows.length,
      sync_changes: syncRows.length,
      checksum,
      published_at: now,
    });
  } catch (error) {
    console.error("PUBLISH COLLECTION ERROR:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});
