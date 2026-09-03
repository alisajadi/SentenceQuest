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

function json(data: unknown, status = 200) {
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

function parseVersion(value: unknown) {
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return value;
    }

    const major = Math.floor(value);
    const minor = Math.round(
      (value - major) * 100
    );

    return major * 100 + minor;
  }

  if (typeof value === "string") {
    const match = value.trim().match(
      /^(\d+)(?:\.(\d{1,2}))?$/
    );

    if (!match) {
      return 0;
    }

    const major = Number(match[1]);
    const minor = Number(
      (match[2] ?? "0").padEnd(2, "0")
    );

    return major * 100 + minor;
  }

  return 0;
}

function versionString(numeric: number) {
  const major = Math.floor(numeric / 100);
  const minor = numeric % 100;

  return `${major}.${String(minor).padStart(2, "0")}`;
}

Deno.serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        success: false,
        error: "POST required.",
      },
      405
    );
  }

  try {

    const body = await req.json();

    const clientVersion = parseVersion(
      body.database_version ??
      body.version ??
      0
    );

    const {
      data: current,
      error: currentError,
    } = await db
      .from("database_release")
      .select(
        "major_version,minor_version,database_version"
      )
      .eq("id", true)
      .single();

    if (currentError || !current) {
      throw new Error(
        currentError?.message ??
        "Database release not found."
      );
    }

    const currentMajor = Number(
      current.major_version ?? 1
    );

    const currentMinor = Number(
      current.minor_version ?? 0
    );

    const currentNumber =
      currentMajor * 100 +
      currentMinor;

    /*
     * Client already has current database.
     */

    if (clientVersion >= currentNumber) {
      return json({
        success: true,
        up_to_date: true,
        database_version:
          current.database_version ??
          versionString(currentNumber),
        database_version_number:
          currentNumber,
        changes: [],
      });
    }

    /*
     * IMPORTANT:
     *
     * Compare against the COMPLETE numeric version.
     *
     * Old code incorrectly compared db_version
     * against clientMinor.
     */

    const {
      data: changes,
      error: changesError,
    } = await db
      .from("sync_changes")
      .select(
        "id,db_version,entity_type,entity_id,operation,payload,created_at"
      )
      .gt(
        "db_version",
        clientVersion
      )
      .lte(
        "db_version",
        currentNumber
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

    if (changesError) {
      throw changesError;
    }

    return json({
      success: true,
      up_to_date: false,
      database_version:
        current.database_version ??
        versionString(currentNumber),
      database_version_number:
        currentNumber,
      changes: changes ?? [],
    });

  } catch (error) {

    console.error(
      "SYNC ERROR:",
      error
    );

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
});
