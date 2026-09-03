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

function parseVersion(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const text = String(value ?? "").trim();
  if (!text) return 0;

  if (/^\d+$/.test(text)) return Number(text);

  const match = text.match(/^(\d+)\.(\d{1,2})$/);
  if (!match) return 0;

  return Number(match[1]) * 100 + Number(match[2]);
}

function versionString(major: number, minor: number) {
  return `${major}.${String(minor).padStart(2, "0")}`;
}

async function requireAdminIfProvided(req: Request) {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return;

  const token = header.slice(7);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid authentication session.");

  const { data: profile, error: profileError } = await db
    .from("profiles").select("role").eq("id", data.user.id).maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (profile?.role !== "admin") throw new Error("Admin access required.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "POST required." }, 405);

  try {
    const body = await req.json();
    const clientVersion = parseVersion(
      body?.database_version_number ?? body?.database_version ?? 0
    );

    const { data: current, error: currentError } = await db
      .from("database_release")
      .select("major_version,minor_version,database_version,checksum,published_at")
      .eq("id", true)
      .single();

    if (currentError || !current) {
      throw new Error(currentError?.message ?? "Database release not found.");
    }

    const currentMajor = Number(current.major_version ?? 1);
    const currentMinor = Number(current.minor_version ?? 0);
    const currentNumber = currentMajor * 100 + currentMinor;
    const currentString =
      current.database_version ?? versionString(currentMajor, currentMinor);

    if (clientVersion >= currentNumber) {
      return json({
        success: true,
        up_to_date: true,
        client_database_version: versionString(
          Math.floor(clientVersion / 100),
          clientVersion % 100
        ),
        database_version: currentString,
        database_version_number: currentNumber,
        changes: [],
      });
    }

    const { data: changes, error: changesError } = await db
      .from("sync_changes")
      .select(`
        id,
        db_version,
        entity_type,
        entity_id,
        operation,
        payload,
        created_at
      `)
      .gt("db_version", clientVersion)
      .lte("db_version", currentNumber)
      .order("db_version", { ascending: true })
      .order("id", { ascending: true });

    if (changesError) throw changesError;

    return json({
      success: true,
      up_to_date: false,
      client_database_version: versionString(
        Math.floor(clientVersion / 100),
        clientVersion % 100
      ),
      database_version: currentString,
      database_version_number: currentNumber,
      checksum: current.checksum ?? null,
      published_at: current.published_at ?? null,
      changes: changes ?? [],
    });
  } catch (error) {
    console.error("SYNC ERROR:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});
