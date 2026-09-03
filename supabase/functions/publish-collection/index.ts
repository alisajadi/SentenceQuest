import { createClient } from
  "https://esm.sh/@supabase/supabase-js@2";


const corsHeaders = {

  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",

  "Access-Control-Allow-Methods":
    "POST, OPTIONS"

};


const db =
  createClient(

    Deno.env.get(
      "SUPABASE_URL"
    )!,

    Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    )!,

    {
      auth: {

        autoRefreshToken: false,

        persistSession: false

      }
    }

  );


function response(
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
          "application/json"

      }

    }

  );

}


/* =========================================================
   ADMIN CHECK
========================================================= */

async function requireAdmin(
  req: Request
) {

  const authorization =
    req.headers.get(
      "Authorization"
    );


  if (
    !authorization ||
    !authorization.startsWith(
      "Bearer "
    )
  ) {

    throw new Error(
      "Missing authorization."
    );

  }


  const token =
    authorization.substring(7);


  const {
    data,
    error
  } =
    await db.auth.getUser(
      token
    );


  if (
    error ||
    !data.user
  ) {

    throw new Error(
      "Invalid authentication session."
    );

  }


  const {
    data: profile,
    error: profileError
  } =
    await db
      .from("profiles")
      .select("role")
      .eq(
        "id",
        data.user.id
      )
      .maybeSingle();


  if (profileError) {

    throw new Error(
      profileError.message
    );

  }


  if (
    profile?.role !==
    "admin"
  ) {

    throw new Error(
      "Admin access required."
    );

  }


  return data.user;

}


/* =========================================================
   VERSION
========================================================= */

function versionString(
  major: number,
  minor: number
) {

  return (
    `${major}.` +
    String(minor)
      .padStart(2, "0")
  );

}


/* =========================================================
   MAIN
========================================================= */

Deno.serve(
  async (
    req
  ) => {

    if (
      req.method ===
      "OPTIONS"
    ) {

      return new Response(
        "ok",
        {
          headers:
            corsHeaders
        }
      );

    }


    try {

      const user =
        await requireAdmin(
          req
        );


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


      /* -----------------------------------------------------
         COLLECTION
      ----------------------------------------------------- */

      const {
        data: collection,
        error:
          collectionError
      } =
        await db
          .from("collections")
          .select("*")
          .eq(
            "id",
            collectionId
          )
          .single();


      if (
        collectionError
      ) {

        throw collectionError;

      }


      /* -----------------------------------------------------
         LESSON IDS
      ----------------------------------------------------- */

      const {
        data: items,
        error: itemsError
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


      if (
        itemsError
      ) {

        throw itemsError;

      }


      const lessonIds =
        (
          items || []
        )
          .map(
            item =>
              item.lesson_id
          )
          .filter(
            Boolean
          );


      if (
        lessonIds.length ===
        0
      ) {

        throw new Error(
          "Collection has no lessons."
        );

      }


      /* -----------------------------------------------------
         LESSON VALIDATION
      ----------------------------------------------------- */

      const {
        data: lessons,
        error: lessonsError
      } =
        await db
          .from("lessons")
          .select(
            `
            id,
            title,
            grammar_id,
            pattern_id,
            target_sentence
            `
          )
          .in(
            "id",
            lessonIds
          );


      if (
        lessonsError
      ) {

        throw lessonsError;

      }


      for (
        const lesson of
        lessons || []
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


      /* -----------------------------------------------------
         CURRENT DATABASE VERSION
      ----------------------------------------------------- */

      const {
        data: currentVersion,
        error:
          versionError
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


      if (
        versionError
      ) {

        throw versionError;

      }


      const major =
        Number(
          currentVersion.major_version
        );


      const minor =
        Number(
          currentVersion.minor_version
        ) + 1;


      if (
        minor > 99
      ) {

        throw new Error(
          "Minor version reached 99. Increase major version manually before publishing again."
        );

      }


      const newVersion =
        versionString(
          major,
          minor
        );


      /* -----------------------------------------------------
         PUBLISH COLLECTION
      ----------------------------------------------------- */

      const {
        error:
          collectionUpdateError
      } =
        await db
          .from("collections")
          .update({

            is_published:
              true,

            version:
              Number(
                collection.version || 0
              ) + 1,

            updated_at:
              new Date()
                .toISOString()

          })
          .eq(
            "id",
            collectionId
          );


      if (
        collectionUpdateError
      ) {

        throw collectionUpdateError;

      }


      /* -----------------------------------------------------
         PUBLISH LESSONS
      ----------------------------------------------------- */

      const {
        error:
          lessonUpdateError
      } =
        await db
          .from("lessons")
          .update({

            is_published:
              true,

            updated_at:
              new Date()
                .toISOString()

          })
          .in(
            "id",
            lessonIds
          );


      if (
        lessonUpdateError
      ) {

        throw lessonUpdateError;

      }


      /* -----------------------------------------------------
         DATABASE RELEASE
      ----------------------------------------------------- */

      const {
        error:
          releaseUpdateError
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
              new Date()
                .toISOString(),

            published_by:
              user.id

          })
          .eq(
            "id",
            true
          );


      if (
        releaseUpdateError
      ) {

        throw releaseUpdateError;

      }


      /* -----------------------------------------------------
         DATABASE HISTORY
      ----------------------------------------------------- */

      const {
        error:
          clearHistoryError
      } =
        await db
          .from(
            "database_versions"
          )
          .update({

            is_current:
              false

          })
          .eq(
            "is_current",
            true
          );


      if (
        clearHistoryError
      ) {

        throw clearHistoryError;

      }


      const {
        error:
          historyInsertError
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
              "Published collection " +
              collection.slug,

            checksum:
              newVersion,

            is_current:
              true

          });


      if (
        historyInsertError
      ) {

        throw historyInsertError;

      }


      /* -----------------------------------------------------
         UPDATE MANIFEST
      ----------------------------------------------------- */

      const {
        error:
          manifestError
      } =
        await db
          .from(
            "app_update_manifest"
          )
          .update({

            minimum_database_version:
              newVersion,

            updated_at:
              new Date()
                .toISOString()

          })
          .eq(
            "id",
            true
          );


      if (
        manifestError
      ) {

        throw manifestError;

      }


      /* -----------------------------------------------------
         RESPONSE
      ----------------------------------------------------- */

      return response({

        success:
          true,

        collection:
          collection.slug,

        database_version:
          newVersion,

        published_lessons:
          lessonIds.length

      });


    } catch (
      error
    ) {

      console.error(
        "PUBLISH ERROR:",
        error
      );


      return response(

        {

          success:
            false,

          error:
            error instanceof Error
              ? error.message
              : String(error)

        },

        400

      );

    }

  }
);
