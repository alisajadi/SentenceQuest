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

async function requireAdmin(req: Request) {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("Missing authorization token.");
  const token = header.slice(7);

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid authentication session.");

  const { data: profile, error: profileError } = await db
    .from("profiles").select("role").eq("id", data.user.id).maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (profile?.role !== "admin") throw new Error("Admin access required.");
  return data.user;
}

function isObject(value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/*
 * IMPORT NEVER PUBLISHES.
 * Every content row is written with is_published/is_active from the file
 * if provided, otherwise defaulting to NOT published — publishing quest
 * packs is a separate step (see MIGRATION_GUIDE.md "next steps").
 *
 * Expected file shape (format: "sentencequest.questpack"):
 * {
 *   "format": "sentencequest.questpack",
 *   "version": 1,
 *   "destination": { "code": "US", "name": "United States", "language_code": "en", ... },
 *   "locations": [ { "id": "loc_travel_agency", "code": "travel_agency", "name": "...", ... } ],
 *   "npcs": [ { "id": "npc_agent", "code": "travel_agent", "name": "...", "location_id": "loc_travel_agency" } ],
 *   "story_nodes": [ { "id": "node_day1_agency", "code": "day1_travel_agency", "title": "...",
 *                       "location_id": "loc_travel_agency", "npc_id": "npc_agent", "node_type": "dialogue", ... } ],
 *   "story_choices": [ { "from": "node_day1_agency", "to": "node_airport", "choice_text": "..." } ],
 *   "quests": [ { "id": "quest_boarding_pass", "code": "get_boarding_pass", "title": "...",
 *                  "story_node_id": "node_day1_agency",
 *                  "steps": [ { "step_order": 1, "step_type": "sentence", "lesson_slug": "a1-food-001" } ] } ],
 *   "dialogue_lines": [ { "story_node_id": "node_day1_agency", "npc_id": "npc_agent", "speaker_type": "npc",
 *                          "line_order": 1, "target_text": "...", "native_translation": "...",
 *                          "lesson_slug": "a1-food-001" } ],
 *   "cultural_calendar_events": [ { "month": 12, "day": 25, "title": "Christmas" } ]
 * }
 *
 * Local ids (destination-scoped) inside locations/npcs/story_nodes/quests are
 * mapped to real UUIDs during import so later sections can reference them.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "POST required." }, 405);

  try {
    await requireAdmin(req);
    const body = await req.json();

    if (body?.format !== "sentencequest.questpack") {
      throw new Error("Invalid quest pack format.");
    }

    const destinationData = body.destination;
    if (!destinationData?.code || !destinationData?.name) {
      throw new Error("destination.code and destination.name are required.");
    }

    let languageId: string | null = null;
    if (destinationData.language_code) {
      const { data: language, error } = await db
        .from("languages")
        .select("id")
        .eq("code", String(destinationData.language_code))
        .maybeSingle();
      if (error) throw error;
      languageId = language?.id ?? null;
    }

    const { data: destination, error: destinationError } = await db
      .from("destinations")
      .upsert({
        code: String(destinationData.code),
        name: String(destinationData.name),
        language_id: languageId,
        calendar_type: destinationData.calendar_type ?? "gregorian",
        timezone: destinationData.timezone ?? null,
        culture_notes: destinationData.culture_notes ?? null,
        is_active: destinationData.is_active ?? true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "code" })
      .select()
      .single();

    if (destinationError) throw destinationError;

    // ---- locations ----
    const locationMap = new Map<string, string>();
    for (const item of body.locations ?? []) {
      if (!item?.id || !item?.code || !item?.name) {
        throw new Error("Invalid location item (id, code, name required).");
      }
      const { data: location, error } = await db
        .from("locations")
        .upsert({
          destination_id: destination.id,
          code: String(item.code),
          name: String(item.name),
          location_type: item.location_type ?? "generic",
          description: item.description ?? null,
          image_url: item.image_url ?? null,
          is_active: item.is_active ?? true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "destination_id,code" })
        .select()
        .single();
      if (error) throw error;
      locationMap.set(String(item.id), location.id);
    }

    // ---- npcs ----
    const npcMap = new Map<string, string>();
    for (const item of body.npcs ?? []) {
      if (!item?.id || !item?.code || !item?.name) {
        throw new Error("Invalid npc item (id, code, name required).");
      }
      const locationId = item.location_id ? locationMap.get(String(item.location_id)) ?? null : null;
      const { data: npc, error } = await db
        .from("npcs")
        .upsert({
          destination_id: destination.id,
          location_id: locationId,
          code: String(item.code),
          name: String(item.name),
          role: item.role ?? null,
          avatar_url: item.avatar_url ?? null,
          personality_notes: item.personality_notes ?? null,
          is_active: item.is_active ?? true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "destination_id,code" })
        .select()
        .single();
      if (error) throw error;
      npcMap.set(String(item.id), npc.id);
    }

    // ---- story nodes ----
    const nodeMap = new Map<string, string>();
    for (const item of body.story_nodes ?? []) {
      if (!item?.id || !item?.code || !item?.title) {
        throw new Error("Invalid story_node item (id, code, title required).");
      }
      const locationId = item.location_id ? locationMap.get(String(item.location_id)) ?? null : null;
      const npcId = item.npc_id ? npcMap.get(String(item.npc_id)) ?? null : null;

      // IMPORT NEVER overwrites is_published/version for existing nodes.
      const { data: existingNode } = await db
        .from("story_nodes")
        .select("id,is_published,version")
        .eq("destination_id", destination.id)
        .eq("code", String(item.code))
        .maybeSingle();

      const { data: node, error } = await db
        .from("story_nodes")
        .upsert({
          destination_id: destination.id,
          code: String(item.code),
          title: String(item.title),
          day_number: item.day_number ?? null,
          time_of_day: item.time_of_day ?? null,
          location_id: locationId,
          npc_id: npcId,
          node_type: item.node_type ?? "quest",
          description: item.description ?? null,
          is_start: item.is_start ?? false,
          is_active: item.is_active ?? true,
          is_published: existingNode?.is_published ?? false,
          version: existingNode?.version ?? 1,
          updated_at: new Date().toISOString(),
        }, { onConflict: "destination_id,code" })
        .select()
        .single();
      if (error) throw error;
      nodeMap.set(String(item.id), node.id);
    }

    // ---- story choices (branching edges) ----
    let choiceCount = 0;
    for (const item of body.story_choices ?? []) {
      const fromId = nodeMap.get(String(item.from));
      const toId = nodeMap.get(String(item.to));
      if (!fromId || !toId) {
        throw new Error(`story_choice references an unknown node: ${item.from} -> ${item.to}`);
      }
      const { error } = await db
        .from("story_choices")
        .upsert({
          from_node_id: fromId,
          to_node_id: toId,
          choice_text: String(item.choice_text ?? ""),
          requires_preference_key: item.requires_preference_key ?? null,
          requires_preference_value: item.requires_preference_value ?? null,
          sort_order: Number(item.sort_order ?? 0),
        }, { onConflict: "from_node_id,to_node_id" });
      if (error) throw error;
      choiceCount++;
    }

    // ---- quests + quest_steps (steps reuse existing lessons by slug) ----
    let questCount = 0;
    let stepCount = 0;
    for (const item of body.quests ?? []) {
      if (!item?.code || !item?.title) throw new Error("Invalid quest item (code, title required).");
      const storyNodeId = item.story_node_id ? nodeMap.get(String(item.story_node_id)) ?? null : null;

      const { data: existingQuest } = await db
        .from("quests")
        .select("id,is_published,version")
        .eq("code", String(item.code))
        .maybeSingle();

      const { data: quest, error } = await db
        .from("quests")
        .upsert({
          destination_id: destination.id,
          story_node_id: storyNodeId,
          code: String(item.code),
          title: String(item.title),
          description: item.description ?? null,
          level: item.level ?? null,
          xp_reward: Number(item.xp_reward ?? 50),
          is_repeatable: item.is_repeatable ?? false,
          is_published: existingQuest?.is_published ?? false,
          version: existingQuest?.version ?? 1,
          updated_at: new Date().toISOString(),
        }, { onConflict: "code" })
        .select()
        .single();
      if (error) throw error;
      questCount++;

      const { error: deleteStepsError } = await db
        .from("quest_steps").delete().eq("quest_id", quest.id);
      if (deleteStepsError) throw deleteStepsError;

      for (const step of item.steps ?? []) {
        let lessonId: string | null = null;
        if (step.lesson_slug) {
          const { data: lesson, error: lessonError } = await db
            .from("lessons").select("id").eq("slug", String(step.lesson_slug)).maybeSingle();
          if (lessonError) throw lessonError;
          if (!lesson) throw new Error(`Quest step references unknown lesson slug: ${step.lesson_slug}`);
          lessonId = lesson.id;
        }

        const { error: stepError } = await db.from("quest_steps").insert({
          quest_id: quest.id,
          step_order: Number(step.step_order ?? 0),
          step_type: step.step_type ?? "sentence",
          lesson_id: lessonId,
          prompt_native: step.prompt_native ?? null,
          prompt_target: step.prompt_target ?? null,
          media_url: step.media_url ?? null,
        });
        if (stepError) throw stepError;
        stepCount++;
      }
    }

    // ---- dialogue lines (may also reference a lesson for player response) ----
    let dialogueCount = 0;
    for (const item of body.dialogue_lines ?? []) {
      const storyNodeId = nodeMap.get(String(item.story_node_id));
      if (!storyNodeId) throw new Error(`dialogue_line references unknown story_node: ${item.story_node_id}`);
      const npcId = item.npc_id ? npcMap.get(String(item.npc_id)) ?? null : null;

      let lessonId: string | null = null;
      if (item.lesson_slug) {
        const { data: lesson, error: lessonError } = await db
          .from("lessons").select("id").eq("slug", String(item.lesson_slug)).maybeSingle();
        if (lessonError) throw lessonError;
        if (!lesson) throw new Error(`dialogue_line references unknown lesson slug: ${item.lesson_slug}`);
        lessonId = lesson.id;
      }

      const { error } = await db
        .from("dialogue_lines")
        .upsert({
          story_node_id: storyNodeId,
          npc_id: npcId,
          speaker_type: item.speaker_type ?? "npc",
          line_order: Number(item.line_order ?? 0),
          target_text: String(item.target_text ?? ""),
          native_translation: item.native_translation ?? null,
          audio_url: item.audio_url ?? null,
          lesson_id: lessonId,
        }, { onConflict: "story_node_id,line_order" });
      if (error) throw error;
      dialogueCount++;
    }

    // ---- cultural calendar events ----
    let culturalEventCount = 0;
    for (const item of body.cultural_calendar_events ?? []) {
      if (!item?.month || !item?.day || !item?.title) {
        throw new Error("Invalid cultural_calendar_event (month, day, title required).");
      }
      const { error } = await db
        .from("cultural_calendar_events")
        .upsert({
          destination_id: destination.id,
          month: Number(item.month),
          day: Number(item.day),
          title: String(item.title),
          description: item.description ?? null,
          is_recurring: item.is_recurring ?? true,
          is_active: true,
        }, { onConflict: "destination_id,month,day,title" });
      if (error) throw error;
      culturalEventCount++;
    }

    return json({
      success: true,
      destination: destination.code,
      destination_id: destination.id,
      locations_count: locationMap.size,
      npcs_count: npcMap.size,
      story_nodes_count: nodeMap.size,
      story_choices_count: choiceCount,
      quests_count: questCount,
      quest_steps_count: stepCount,
      dialogue_lines_count: dialogueCount,
      cultural_calendar_events_count: culturalEventCount,
      database_version_changed: false,
      note: "Content imported as draft (is_published stays as-is / false). Publishing the life-world layer is a separate step — see MIGRATION_GUIDE.md.",
    });
  } catch (error) {
    console.error("IMPORT QUEST PACK ERROR:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});
