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
        "Content-Type": "application/json",
      },
    }
  );
}

async function requireAdmin(
  req: Request
) {
  const authorization =
    req.headers.get(
      "Authorization"
    );

  if (
    !authorization?.startsWith(
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
    error,
  } =
    await db.auth.getUser(token);

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
    error: profileError,
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

function versionString(
  major: number,
  minor: number
) {
  return (
    `${major}.` +
    `${String(minor).padStart(2, "0")}`
  );
}

function numericVersion(
  major: number,
  minor: number
) {
  return (
    major * 100 +
    minor
  );
}

function nextVersion(
  major: number,
  minor: number
) {
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

Deno.serve(
  async (req) => {
    if (
      req.method ===
      "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers:
            corsHeaders,
        }
      );
    }

    if (
      req.method !==
      "POST"
    ) {
      return response(
        {
          success: false,
          error:
            "POST required.",
        },
        405
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

      if (!collectionId) {
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
          .from(
            "collections"
          )
          .select("*")
          .eq(
            "id",
            collectionId
          )
          .single();

      if (
        collectionError ||
        !collection
      ) {
        throw new Error(
          "Collection not found."
        );
      }

      /*
       * COLLECTION ITEMS
       */

      const {
        data: items,
        error:
          itemsError,
      } =
        await db
          .from(
            "collection_items"
          )
          .select(
            "lesson_id,vocabulary_id"
          )
          .eq(
            "collection_id",
            collectionId
          );

      if (itemsError) {
        throw itemsError;
      }

      const lessonIds =
        [
          ...new Set(
            (items ?? [])
              .map(
                (
                  item: any
                ) =>
                  item.lesson_id
              )
              .filter(
                Boolean
              )
          ),
        ];

      /*
       * CURRENT DATABASE VERSION
       */

      const {
        data: current,
        error:
          currentError,
      } =
        await db
          .from(
            "database_release"
          )
          .select(
            `
              major_version,
              minor_version
            `
          )
          .eq(
            "id",
            true
          )
          .single();

      if (
        currentError ||
        !current
      ) {
        throw new Error(
          currentError?.message ??
          "Database release not found."
        );
      }

      let major =
        Number(
          current.major_version
        );

      let minor =
        Number(
          current.minor_version
        );

      if (
        !Number.isInteger(
          major
        ) ||
        major < 1
      ) {
        major = 1;
      }

      if (
        !Number.isInteger(
          minor
        ) ||
        minor < 0 ||
        minor > 99
      ) {
        minor = 0;
      }

      /*
       * NEXT DATABASE VERSION
       */

      const next =
        nextVersion(
          major,
          minor
        );

      major =
        next.major;

      minor =
        next.minor;

      const newVersion =
        versionString(
          major,
          minor
        );

      const numericDbVersion =
        numericVersion(
          major,
          minor
        );

      const now =
        new Date().toISOString();

      /*
       * PUBLISH COLLECTION
       */

      const newCollectionVersion =
        Number(
          collection.version ??
          0
        ) + 1;

      const {
        error:
          collectionUpdateError,
      } =
        await db
          .from(
            "collections"
          )
          .update({
            is_published:
              true,
            version:
              newCollectionVersion,
            updated_at:
              now,
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

      /*
       * PUBLISH LESSONS
       */

      if (
        lessonIds.length
      ) {
        const {
          error:
            lessonUpdateError,
        } =
          await db
            .from(
              "lessons"
            )
            .update({
              is_published:
                true,
              updated_at:
                now,
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
      }

      /*
       * DATABASE RELEASE
       *
       * app_version/database_version
       * are generated columns.
       *
       * NEVER write to them.
       */

      const {
        error:
          releaseUpdateError,
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
              `Published collection: ${collection.name}`,
            checksum:
              newVersion,
            published_at:
              now,
            published_by:
              user.id,
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

      /*
       * DATABASE HISTORY
       */

      const {
        error:
          clearHistoryError,
      } =
        await db
          .from(
            "database_versions"
          )
          .update({
            is_current:
              false,
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

      /*
       * Do not insert generated fields.
       */

      const {
        error:
          historyError,
      } =
        await db
          .from(
            "database_versions"
          )
          .insert({
            version:
              numericDbVersion,
            major_version:
              major,
            minor_version:
              minor,
            release_name:
              collection.name,
            notes:
              `Published collection ${collection.slug}`,
            checksum:
              newVersion,
            is_current:
              true,
            published_at:
              now,
            published_by:
              user.id,
          });

      if (
        historyError
      ) {
        throw historyError;
      }

      /*
       * SYNC CHANGES
       */

      const syncRows =
        [
          {
            db_version:
              numericDbVersion,
            entity_type:
              "collections",
            entity_id:
              collection.id,
            operation:
              "upsert",
            payload: {
              id:
                collection.id,
              slug:
                collection.slug,
              version:
                newCollectionVersion,
              is_published:
                true,
            },
          },

          ...lessonIds.map(
            (
              lessonId
            ) => ({
              db_version:
                numericDbVersion,
              entity_type:
                "lessons",
              entity_id:
                lessonId,
              operation:
                "upsert",
              payload: {
                id:
                  lessonId,
                is_published:
                  true,
              },
            })
          ),
        ];

      if (
        syncRows.length
      ) {
        const {
          error:
            syncError,
        } =
          await db
            .from(
              "sync_changes"
            )
            .insert(
              syncRows
            );

        if (syncError) {
          throw syncError;
        }
      }

      /*
       * APP UPDATE MANIFEST
       *
       * app_version will be
       * generated in the final schema.
       *
       * We only update
       * minimum_database_version.
       */

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
              newVersion,
            updated_at:
              now,
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

      /*
       * RESULT
       */

      return response({
        success:
          true,

        collection:
          collection.slug,

        collection_version:
          newCollectionVersion,

        database_version:
          newVersion,

        database_version_number:
          numericDbVersion,

        major_version:
          major,

        minor_version:
          minor,

        published_lessons:
          lessonIds.length,

        sync_changes:
          syncRows.length,

        published_at:
          now,
      });

    } catch (error) {
      console.error(
        "PUBLISH COLLECTION ERROR:",
        error
      );

      return response(
        {
          success:
            false,
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
