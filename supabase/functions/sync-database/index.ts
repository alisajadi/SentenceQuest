
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

    if (
      req.method !== "POST"
    ) {
      return json(
        {
          error:
            "POST required.",
        },
        405
      );
    }

    try {

      const body =
        await req.json();

      const clientVersion =
        Number(
          body.database_version ??
          0
        );

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
            "major_version,minor_version,database_version"
          )
          .eq(
            "id",
            true
          )
          .single();

      if (currentError)
        throw currentError;

      const currentNumber =
        current.major_version *
          100 +
        current.minor_version;

      const clientMajor =
        Math.floor(
          clientVersion
        );

      const clientMinor =
        Math.round(
          (
            clientVersion -
            clientMajor
          ) * 100
        );

      const clientNumber =
        clientMajor * 100 +
        clientMinor;

      if (
        clientNumber >=
        currentNumber
      ) {
        return json({
          success: true,

          up_to_date: true,

          database_version:
            current.database_version,

          changes: [],
        });
      }

      const {
        data: changes,
        error:
          changesError,
      } =
        await db
          .from(
            "sync_changes"
          )
          .select(
            "id,db_version,entity_type,entity_id,operation,payload"
          )
          .gt(
            "db_version",
            clientMinor
          )
          .order(
            "db_version",
            {
              ascending: true,
            }
          )
          .order(
            "id",
            {
              ascending: true,
            }
          );

      if (changesError)
        throw changesError;

      return json({
        success: true,

        up_to_date: false,

        database_version:
          current.database_version,

        changes:
          changes ?? [],
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
