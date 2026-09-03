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
    await requireAdmin(req);

    const body = await req.json();

    let collectionId = body.collection_id ?? null;

    if (!collectionId && body.collection_slug) {
      const {
        data: collection,
        error,
      } = await db
        .from("collections")
        .select("id")
        .eq("slug", body.collection_slug)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!collection) {
        throw new Error("Collection not found.");
      }

      collectionId = collection.id;
    }

    if (!collectionId) {
      throw new Error(
        "collection_id or collection_slug is required."
      );
    }

    const result = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/publish-collection`,
      {
        method: "POST",
        headers: {
          Authorization:
            req.headers.get("Authorization")!,
          "Content-Type": "application/json",
          apikey:
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        },
        body: JSON.stringify({
          collection_id: collectionId,
        }),
      }
    );

    const data = await result.json();

    return response(
      data,
      result.status
    );

  } catch (error) {
    console.error(
      "PUBLISH ERROR:",
      error
    );

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
