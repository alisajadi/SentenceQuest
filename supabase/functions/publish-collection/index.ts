import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

const supabaseUrl =
  Deno.env.get("SUPABASE_URL")!;

const serviceRoleKey =
  Deno.env.get(
    "SUPABASE_SERVICE_ROLE_KEY"
  )!;

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
          "application/json",
      },
    }
  );
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
      return response(
        {
          success: false,
          error:
            "Missing authorization token.",
        },
        401
      );
    }


    const token =
      authorization.substring(7);


    const {
      data: userData,
      error: userError,
    } =
      await db.auth.getUser(token);


    if (
      userError ||
      !userData?.user
    ) {
      return response(
        {
          success: false,
          error:
            "Invalid authentication session.",
        },
        401
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
          userData.user.id
        )
        .maybeSingle();


    if (profileError) {
      return response(
        {
          success: false,
          error:
            profileError.message,
        },
        400
      );
    }


    if (
      !profile ||
      profile.role !== "admin"
    ) {
      return response(
        {
          success: false,
          error:
            "Admin access required.",
        },
        403
      );
    }


    const body =
      await req.json();


    const collectionId =
      body?.collection_id;


    if (!collectionId) {
      return response(
        {
          success: false,
          error:
            "collection_id is required.",
        },
        400
      );
    }


    const releaseName =
      body?.release_name ||
      null;


    const notes =
      body?.notes ||
      null;


    const {
      data,
      error,
    } =
      await db.rpc(
        "publish_collection",
        {
          p_collection_id:
            collectionId,

          p_release_name:
            releaseName,

          p_notes:
            notes,
        }
      );


    if (error) {
      console.error(
        "PUBLISH RPC ERROR:",
        error
      );

      return response(
        {
          success: false,
          error:
            error.message,
          details:
            error.details ||
            null,
          hint:
            error.hint ||
            null,
        },
        400
      );
    }


    return response(
      data
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
      500
    );
  }

});
