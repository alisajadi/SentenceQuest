import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const db = createClient(
  supabaseUrl,
  serviceRoleKey,
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
    throw new Error("Missing authorization");
  }

  const token = authorization.substring(7);

  const { data, error } =
    await db.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Invalid session");
  }

  const { data: profile } =
    await db
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

  if (profile?.role !== "admin") {
    throw new Error("Admin access required");
  }

  return data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    await requireAdmin(req);

    const body = await req.json();

    if (!body.collection_slug) {
      return response({
        error: "collection_slug is required",
      }, 400);
    }

    const { data: collection, error } =
      await db
        .from("collections")
        .select("*")
        .eq("slug", body.collection_slug)
        .single();

    if (error || !collection) {
      throw new Error("Collection not found");
    }

    const { data: lessons, error: lessonsError } =
      await db
        .from("lessons")
        .select("id")
        .eq("is_published", false)
        .in(
          "id",
          (
            await db
              .from("collection_items")
              .select("lesson_id")
              .eq("collection_id", collection.id)
              .not("lesson_id", "is", null)
          ).data?.map((x: any) => x.lesson_id) ?? []
        );

    if (lessonsError) throw lessonsError;

    if (lessons?.length) {
      const { error } =
        await db
          .from("lessons")
          .update({
            is_published: true,
            updated_at: new Date().toISOString(),
          })
          .in(
            "id",
            lessons.map((x: any) => x.id)
          );

      if (error) throw error;
    }

    const nextVersion =
      (collection.version ?? 0) + 1;

    const { error: collectionError } =
      await db
        .from("collections")
        .update({
          is_published: true,
          version: nextVersion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", collection.id);

    if (collectionError) throw collectionError;

    const { error: versionError } =
      await db
        .from("database_versions")
        .update({
          is_current: false,
        })
        .eq("is_current", true);

    if (versionError) throw versionError;

    const { error: insertVersionError } =
      await db
        .from("database_versions")
        .insert({
          version: nextVersion,
          release_name: collection.name,
          notes: `Published collection ${collection.slug}`,
          is_current: true,
        });

    if (insertVersionError) throw insertVersionError;

    return response({
      success: true,
      collection: collection.slug,
      version: nextVersion,
      published_lessons: lessons?.length ?? 0,
    });

  } catch (error) {
    console.error(error);

    return response({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    }, 400);
  }
});
