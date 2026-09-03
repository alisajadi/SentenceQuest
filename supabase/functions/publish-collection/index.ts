import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function requireAdmin(req: Request) {
  const authorization = req.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing authorization.");
  }

  const token = authorization.substring(7);

  const { data, error } = await db.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Invalid authentication session.");
  }

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (profile?.role !== "admin") {
    throw new Error("Admin access required.");
  }

  return data.user;
}

function versionString(major: number, minor: number) {
  return `${major}.${String(minor).padStart(2, "0")}`;
}

function numericVersion(major: number, minor: number) {
  return major * 100 + minor;
}

function nextVersion(major: number, minor: number) {
  if (minor >= 99) {
    return {
      major: major + 1,
      minor: 0,
    };
  }

  return {
    major,
    minor: minor + 1,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return response(
      {
        success: false,
        error: "POST required.",
      },
      405
    );
  }

  try {
    const user = await requireAdmin(req);

    const body = await req.json();
    const collectionId = body.collection_id;

    if (!collectionId) {
      throw new Error("collection_id is required.");
    }

    const { data: collection, error: collectionError } = await db
      .from("collections")
      .select("*")
      .eq("id", collectionId)
      .single();

    if (collectionError || !collection) {
      throw new Error("Collection not found.");
    }

    const { data: items, error: itemsError } = await db
      .from("collection_items")
      .select("lesson_id")
      .eq("collection_id", collectionId)
      .not("lesson_id", "is", null);

    if (itemsError) {
      throw itemsError;
    }

    const lessonIds = [...new Set(
      (items ?? [])
        .map((item: any) => item.lesson_id)
        .filter(Boolean)
    )];

    if (lessonIds.length === 0) {
      throw new Error("Collection has no lessons.");
    }

    const { data: lessons, error: lessonsError } = await db
      .from("lessons")
      .select(`
        id,
        title,
        grammar_id,
        pattern_id,
        target_sentence
      `)
      .in("id", lessonIds);

    if (lessonsError) {
      throw lessonsError;
    }

    if (!lessons || lessons.length !== lessonIds.length) {
      throw new Error(
        "One or more collection lessons could not be found."
      );
    }

    for (const lesson of lessons) {
      if (
        !lesson.target_sentence ||
        !Array.isArray(lesson.target_sentence) ||
        lesson.target_sentence.length === 0
      ) {
        throw new Error(
          `Lesson has no target sentence: ${lesson.title}`
        );
      }

      if (!lesson.grammar_id) {
        throw new Error(
          `Lesson has no grammar: ${lesson.title}`
        );
      }

      if (!lesson.pattern_id) {
        throw new Error(
          `Lesson has no pattern: ${lesson.title}`
        );
      }
    }

    const { data: current, error: currentError } = await db
      .from("database_release")
      .select("major_version, minor_version, database_version")
      .eq("id", true)
      .single();

    if (currentError || !current) {
      throw new Error(
        currentError?.message ?? "Database release not found."
      );
    }

    let major = Number(current.major_version ?? 1);
    let minor = Number(current.minor_version ?? 0);

    if (!Number.isInteger(major) || major < 1) {
      major = 1;
    }

    if (!Number.isInteger(minor) || minor < 0 || minor > 99) {
      minor = 0;
    }

    const next = nextVersion(major, minor);

    major = next.major;
    minor = next.minor;

    const newVersion = versionString(major, minor);
    const numericDbVersion = numericVersion(major, minor);
    const now = new Date().toISOString();

    /*
     * PUBLISH COLLECTION
     */

    const { error: collectionUpdateError } = await db
      .from("collections")
      .update({
        is_published: true,
        version: Number(collection.version ?? 0) + 1,
        updated_at: now,
      })
      .eq("id", collectionId);

    if (collectionUpdateError) {
      throw collectionUpdateError;
    }

    /*
     * PUBLISH LESSONS
     */

    const { error: lessonUpdateError } = await db
      .from("lessons")
      .update({
        is_published: true,
        version: 1,
        updated_at: now,
      })
      .in("id", lessonIds);

    if (lessonUpdateError) {
      throw lessonUpdateError;
    }

    /*
     * DATABASE RELEASE
     */

    const { error: releaseUpdateError } = await db
      .from("database_release")
.update({
  major_version: major,
  minor_version: minor,
  release_name: collection.name,
  notes: `Published collection: ${collection.name}`,
  checksum: newVersion,
  published_at: now,
  published_by: user.id,
})
      .eq("id", true);

    if (releaseUpdateError) {
      throw releaseUpdateError;
    }

    /*
     * DATABASE HISTORY
     */

    const { error: clearHistoryError } = await db
      .from("database_versions")
      .update({
        is_current: false,
      })
      .eq("is_current", true);

    if (clearHistoryError) {
      throw clearHistoryError;
    }

    const { error: historyError } = await db
      .from("database_versions")
      .insert({
        version: numericDbVersion,
        major_version: major,
        minor_version: minor,
        display_version: newVersion,
        release_name: collection.name,
        notes: `Published collection ${collection.slug}`,
        checksum: newVersion,
        is_current: true,
        published_at: now,
        published_by: user.id,
      });

    if (historyError) {
      throw historyError;
    }

    /*
     * SYNC CHANGES
     */

    const syncRows = [
      {
        db_version: numericDbVersion,
        entity_type: "collections",
        entity_id: collection.id,
        operation: "upsert",
        payload: {
          id: collection.id,
          slug: collection.slug,
          version: Number(collection.version ?? 0) + 1,
          is_published: true,
        },
      },
      ...lessonIds.map((lessonId) => ({
        db_version: numericDbVersion,
        entity_type: "lessons",
        entity_id: lessonId,
        operation: "upsert",
        payload: {
          id: lessonId,
          is_published: true,
        },
      })),
    ];

    const { error: syncError } = await db
      .from("sync_changes")
      .insert(syncRows);

    if (syncError) {
      throw syncError;
    }

    /*
     * UPDATE MANIFEST
     */

    const { error: manifestError } = await db
      .from("app_update_manifest")
      .update({
        minimum_database_version: newVersion,
        updated_at: now,
      })
      .eq("id", true);

    if (manifestError) {
      throw manifestError;
    }

    return response({
      success: true,
      collection: collection.slug,
      database_version: newVersion,
      database_version_number: numericDbVersion,
      major_version: major,
      minor_version: minor,
      published_lessons: lessonIds.length,
    });

  } catch (error) {
    console.error("PUBLISH ERROR:", error);

    return response(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      400
    );
  }
});
