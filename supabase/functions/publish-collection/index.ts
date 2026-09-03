import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
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

function json(
  data: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );
}

async function adminUser(
  req: Request
) {
  const header =
    req.headers.get(
      "Authorization"
    );

  if (
    !header?.startsWith(
      "Bearer "
    )
  ) {
    throw new Error(
      "Missing authorization."
    );
  }

  const token =
    header.slice(7);

  const {
    data,
    error,
  } =
    await db.auth.getUser(
      token
    );

  if (
    error ||
    !data.user
  ) {
    throw new Error(
      "Invalid session."
    );
  }

  const {
    data: profile,
  } =
    await db
      .from("profiles")
      .select("role")
      .eq(
        "id",
        data.user.id
      )
      .maybeSingle();

  if (
    profile?.role !== "admin"
  ) {
    throw new Error(
      "Admin access required."
    );
  }

  return data.user;
}

Deno.serve(
  async (req) => {

    if (
      req.method === "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers:
            corsHeaders,
        }
      );
    }

    try {

      const user =
        await adminUser(req);

      const body =
        await req.json();

      const collectionId =
        body.collection_id;

      if (
        !collectionId
      ) {
        throw new Error(
          "collection_id is required."
        );
      }

      /*
       * COLLECTION
       */

      const {
        data: collection,
        error:
          collectionError,
      } =
        await db
          .from("collections")
          .select("*")
          .eq(
            "id",
            collectionId
          )
          .single();

      if (collectionError)
        throw collectionError;

      /*
       * VALIDATE LESSONS
       */

      const {
        data: items,
        error:
          itemsError,
      } =
        await db
          .from("collection_items")
          .select(
            "lesson_id"
          )
          .eq(
            "collection_id",
            collectionId
          )
          .not(
            "lesson_id",
            "is",
            null
          );

      if (itemsError)
        throw itemsError;

      const lessonIds =
        (
          items ?? []
        )
          .map(
            x =>
              x.lesson_id
          )
          .filter(Boolean);

      if (
        lessonIds.length === 0
      ) {
        throw new Error(
          "Collection has no lessons."
        );
      }

      const {
        data: lessons,
        error:
          lessonsError,
      } =
        await db
          .from("lessons")
          .select(
            "id,title,grammar_id,pattern_id,target_sentence"
          )
          .in(
            "id",
            lessonIds
          );

      if (lessonsError)
        throw lessonsError;

      for (
        const lesson of
        lessons ?? []
      ) {

        if (
          !lesson.target_sentence ||
          !Array.isArray(
            lesson.target_sentence
          ) ||
          lesson.target_sentence.length ===
            0
        ) {
          throw new Error(
            "Lesson has no target sentence: " +
            lesson.title
          );
        }

        if (
          !lesson.grammar_id
        ) {
          throw new Error(
            "Lesson has no grammar: " +
            lesson.title
          );
        }

        if (
          !lesson.pattern_id
        ) {
          throw new Error(
            "Lesson has no pattern: " +
            lesson.title
          );
        }
      }

      /*
       * NEXT DATABASE VERSION
       */

      const {
        data: currentVersion,
        error:
          versionError,
      } =
        await db
          .from(
            "database_release"
          )
          .select(
            "major_version,minor_version"
          )
          .eq(
            "id",
            true
          )
          .single();

      if (versionError)
        throw versionError;

      let major =
        currentVersion.major_version;

      let minor =
        currentVersion.minor_version + 1;

      if (minor > 99) {
        throw new Error(
          "Minor database version reached 99. Major version must be increased manually."
        );
      }

      /*
       * PUBLISH COLLECTION
       */

      const {
        error:
          collectionUpdateError,
      } =
        await db
          .from("collections")
          .update({
            is_published: true,

            version:
              collection.version + 1,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            collectionId
          );

      if (collectionUpdateError)
        throw collectionUpdateError;

      /*
       * PUBLISH LESSONS
       */

      const {
        error:
          lessonUpdateError,
      } =
        await db
          .from("lessons")
          .update({
            is_published: true,

            updated_at:
              new Date().toISOString(),
          })
          .in(
            "id",
            lessonIds
          );

      if (lessonUpdateError)
        throw lessonUpdateError;

      /*
       * DATABASE VERSION
       */

      const {
        error:
          releaseError,
      } =
        await db
          .from(
            "database_release"
          )
          .update({

            major_version:
              major,

            minor_version:
              minor,

            release_name:
              collection.name,

            notes:
              "Published collection: " +
              collection.name,

            published_at:
              new Date().toISOString(),

            published_by:
              user.id,

          })
          .eq(
            "id",
            true
          );

      if (releaseError)
        throw releaseError;

      /*
       * HISTORY
       */

      const {
        error:
          historyError,
      } =
        await db
          .from(
            "database_versions"
          )
          .update({
            is_current:
              false,
          })
          .neq(
            "id",
            0
          );

      if (historyError)
        throw historyError;

      const {
        error:
          insertHistoryError,
      } =
        await db
          .from(
            "database_versions"
          )
          .insert({
            version:
              minor,

            release_name:
              collection.name,

            notes:
              "Published " +
              collection.slug,

            created_at:
              new Date().toISOString(),

            is_current:
              true,
          });

      if (insertHistoryError)
        throw insertHistoryError;

      /*
       * UPDATE MANIFEST
       */

      const {
        data: appRelease,
      } =
        await db
          .from(
            "app_release"
          )
          .select(
            "app_version"
          )
          .eq(
            "id",
            true
          )
          .single();

      const {
        error:
          manifestError,
      } =
        await db
          .from(
            "app_update_manifest"
          )
          .update({
            minimum_database_version:
              `${major}.${String(minor).padStart(2, "0")}`,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            true
          );

      if (manifestError)
        throw manifestError;

      return json({
        success: true,

        collection:
          collection.slug,

        database_version:
          `${major}.${String(minor).padStart(2, "0")}`,

        app_version:
          appRelease?.app_version ??
          null,

        published_lessons:
          lessonIds.length,
      });

    } catch (error) {

      return json(
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
  }
);
