const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "POST required." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      throw new Error("Missing authorization.");
    }

    const body = await req.text();
    const url =
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/publish-collection`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": authorization,
        "Content-Type": "application/json",
        "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      },
      body,
    });

    const text = await upstream.text();

    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
