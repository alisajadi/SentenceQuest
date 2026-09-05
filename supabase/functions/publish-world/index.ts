import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function json(body: unknown, status = 200) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}

async function requireAdmin(req: Request) {
  const header =
    req.headers.get("Authorization");

  if (!header?.startsWith("Bearer ")) {
    throw new Error(
      "Missing authorization."
    );
  }

  const token = header.slice(7);

  const {
    data,
    error,
  } = await db.auth.getUser(token);

  if (error || !data.user) {
    throw new Error(
      "Invalid authentication session."
    );
  }

  const {
    data: profile,
    error: profileError,
  } = await db
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(
      profileError.message
    );
  }

  if (profile?.role !== "admin") {
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
  return `${major}.${String(minor).padStart(
    2,
    "0"
  )}`;
}

function numericVersion(
  major: number,
  minor: number
) {
  return major * 100 + minor;
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

async function sha256(value: unknown) {
  const bytes =
    new TextEncoder().encode(
      JSON.stringify(value)
    );

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      bytes
    );

  return Array.from(
    new Uint8Array(hash)
  )
    .map((b) =>
      b.toString(16).padStart(2, "0")
    )
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers: corsHeaders,
      }
    );
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
    const user =
      await requireAdmin(req);

    const body =
      await req.json();

    const destinationId =
      body?.destination_id;

    if (!destinationId) {
      throw new Error(
        "destination_id is required."
      );
    }

    /*
     * =====================================================
     * DESTINATION
     * =====================================================
     */

    const {
      data: destination,
      error: destinationError,
    } = await db
      .from("destinations")
      .select("*")
      .eq("id", destinationId)
      .single();

    if (
      destinationError ||
      !destination
    ) {
      throw new Error(
        "Destination not found."
      );
    }

    /*
     * =====================================================
     * LOAD WORLD
     * =====================================================
     */

    const [
      locationsRes,
      npcsRes,
      nodesRes,
      choicesRes,
      questsRes,
      stepsRes,
      dialogueRes,
      calendarRes,
    ] = await Promise.all([
      db
        .from("locations")
        .select("*")
        .eq(
          "destination_id",
          destinationId
        )
        .eq("is_active", true),

      db
        .from("npcs")
        .select("*")
        .eq(
          "destination_id",
          destinationId
        )
        .eq("is_active", true),

      db
        .from("story_nodes")
        .select("*")
        .eq(
          "destination_id",
          destinationId
        )
        .eq("is_active", true),

      db
        .from("story_choices")
        .select("*"),

      db
        .from("quests")
        .select("*")
        .eq(
          "destination_id",
          destinationId
        ),

      db
        .from("quest_steps")
        .select("*"),

      db
        .from("dialogue_lines")
        .select("*"),

      db
        .from("cultural_calendar_events")
        .select("*")
        .eq(
          "destination_id",
          destinationId
        )
        .eq("is_active", true),
    ]);

    for (
      const result of [
        locationsRes,
        npcsRes,
        nodesRes,
        choicesRes,
        questsRes,
        stepsRes,
        dialogueRes,
        calendarRes,
      ]
    ) {
      if (result.error) {
        throw result.error;
      }
    }

    const locations =
      locationsRes.data || [];

    const npcs =
      npcsRes.data || [];

    const nodes =
      nodesRes.data || [];

    const allChoices =
      choicesRes.data || [];

    const quests =
      questsRes.data || [];

    const allSteps =
      stepsRes.data || [];

    const allDialogue =
      dialogueRes.data || [];

    const calendarEvents =
      calendarRes.data || [];

    /*
     * =====================================================
     * VALIDATION
     * =====================================================
     */

    const errors: string[] = [];
    const warnings: string[] = [];

    const startNodes =
      nodes.filter(
        (node) =>
          node.is_start === true
      );

    if (startNodes.length === 0) {
      errors.push(
        "No start Story Node exists."
      );
    }

    if (startNodes.length > 1) {
      errors.push(
        "More than one start Story Node exists."
      );
    }

    const nodeIds =
      new Set(
        nodes.map(
          (node) => node.id
        )
      );

    const activeNodeIds =
      new Set(
        nodes
          .filter(
            (node) =>
              node.is_published === true
          )
          .map(
            (node) => node.id
          )
      );

    /*
     * Choices
     */

    const destinationChoices =
      allChoices.filter(
        (choice) =>
          nodeIds.has(
            choice.from_node_id
          )
      );

    for (
      const choice of destinationChoices
    ) {
      if (
        !nodeIds.has(
          choice.to_node_id
        )
      ) {
        errors.push(
          `Choice ${choice.id} points to a missing Story Node.`
        );

        continue;
      }

      const fromNode =
        nodes.find(
          (node) =>
            node.id ===
            choice.from_node_id
        );

      const toNode =
        nodes.find(
          (node) =>
            node.id ===
            choice.to_node_id
        );

      if (
        fromNode?.is_published &&
        !toNode?.is_published
      ) {
        errors.push(
          `Published node "${fromNode.title}" points to unpublished node "${toNode?.title}".`
        );
      }
    }

    /*
     * Quests
     */

    const destinationQuests =
      quests.filter(
        (quest) =>
          nodeIds.has(
            quest.story_node_id
          )
      );

    if (
      destinationQuests.length === 0
    ) {
      warnings.push(
        "Destination contains no quests."
      );
    }

    const questIds =
      new Set(
        destinationQuests.map(
          (quest) => quest.id
        )
      );

    for (
      const quest of destinationQuests
    ) {
      if (
        !quest.story_node_id
      ) {
        errors.push(
          `Quest "${quest.title}" has no Story Node.`
        );
      }

      const steps =
        allSteps.filter(
          (step) =>
            step.quest_id ===
            quest.id
        );

      if (!steps.length) {
        errors.push(
          `Quest "${quest.title}" has no steps.`
        );
      }

      if (
        quest.is_published &&
        !activeNodeIds.has(
          quest.story_node_id
        )
      ) {
        errors.push(
          `Published quest "${quest.title}" belongs to an unpublished Story Node.`
        );
      }
    }

    /*
     * Dialogue
     */

    for (
      const line of allDialogue
    ) {
      const node =
        nodes.find(
          (item) =>
            item.id ===
            line.story_node_id
        );

      if (!node) {
        continue;
      }

      if (
        node.is_published &&
        !line.target_text
      ) {
        errors.push(
          `Published Story Node "${node.title}" contains empty dialogue.`
        );
      }
    }

    /*
     * Locations / NPCs
     */

    for (
      const node of nodes
    ) {
      if (
        node.location_id &&
        !locations.some(
          (location) =>
            location.id ===
            node.location_id
        )
      ) {
        errors.push(
          `Story Node "${node.title}" references a missing location.`
        );
      }

      if (
        node.npc_id &&
        !npcs.some(
          (npc) =>
            npc.id ===
            node.npc_id
        )
      ) {
        errors.push(
          `Story Node "${node.title}" references a missing NPC.`
        );
      }
    }

    /*
     * Published graph must have a valid start node.
     */

    if (
      startNodes.length === 1 &&
      !startNodes[0].is_published
    ) {
      errors.push(
        "The start Story Node is not published."
      );
    }

    if (errors.length) {
      return json(
        {
          success: false,
          error:
            "World validation failed.",
          validation: {
            errors,
            warnings,
          },
        },
        400
      );
    }

    /*
     * =====================================================
     * PUBLISH
     * =====================================================
     *
     * Important:
     * World publishing changes the database release
     * because published world content must be syncable.
     *
     * =====================================================
     */

    const {
      data: currentRelease,
      error: releaseReadError,
    } = await db
      .from("database_release")
      .select(
        "major_version,minor_version"
      )
      .eq("id", true)
      .single();

    if (
      releaseReadError ||
      !currentRelease
    ) {
      throw new Error(
        releaseReadError?.message ||
        "Database release not found."
      );
    }

    let major =
      Number(
        currentRelease.major_version
      );

    let minor =
      Number(
        currentRelease.minor_version
      );

    if (
      !Number.isInteger(major) ||
      major < 1
    ) {
      major = 1;
    }

    if (
      !Number.isInteger(minor) ||
      minor < 0 ||
      minor > 99
    ) {
      minor = 0;
    }

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
     * =====================================================
     * PUBLISH STORY NODES
     * =====================================================
     */

    const nodesToPublish =
      nodes.filter(
        (node) =>
          node.is_published === true
      );

    /*
     * =====================================================
     * PUBLISH QUESTS
     * =====================================================
     */

    const questsToPublish =
      destinationQuests.filter(
        (quest) =>
          quest.is_published === true
      );

    /*
     * =====================================================
     * PUBLISH RELEASE CHECKSUM
     * =====================================================
     */

    const checksum =
      await sha256({
        destination: {
          id:
            destination.id,
          code:
            destination.code,
          version:
            destination.version,
        },

        database_version:
          newVersion,

        locations:
          locations
            .map(
              (item) => item.id
            )
            .sort(),

        npcs:
          npcs
            .map(
              (item) => item.id
            )
            .sort(),

        story_nodes:
          nodesToPublish
            .map(
              (item) => ({
                id:
                  item.id,
                version:
                  item.version,
              })
            )
            .sort(
              (a, b) =>
                a.id.localeCompare(
                  b.id
                )
            ),

        story_choices:
          destinationChoices
            .map(
              (item) => ({
                id:
                  item.id,
                from:
                  item.from_node_id,
                to:
                  item.to_node_id,
              })
            )
            .sort(
              (a, b) =>
                a.id.localeCompare(
                  b.id
                )
            ),

        quests:
          questsToPublish
            .map(
              (item) => ({
                id:
                  item.id,
                version:
                  item.version,
              })
            )
            .sort(
              (a, b) =>
                a.id.localeCompare(
                  b.id
                )
            ),

        quest_steps:
          allSteps
            .filter(
              (step) =>
                questIds.has(
                  step.quest_id
                )
            )
            .map(
              (step) => step.id
            )
            .sort(),

        dialogue_lines:
          allDialogue
            .filter(
              (line) =>
                activeNodeIds.has(
                  line.story_node_id
                )
            )
            .map(
              (line) => line.id
            )
            .sort(),

        cultural_calendar_events:
          calendarEvents
            .map(
              (item) => item.id
            )
            .sort(),
      });

    /*
     * =====================================================
     * DATABASE RELEASE
     * =====================================================
     */

    const {
      error: databaseReleaseError,
    } = await db
      .from("database_release")
      .update({
        major_version:
          major,

        minor_version:
          minor,

        release_name:
          `World: ${destination.name}`,

        notes:
          `Published Life World destination: ${destination.name}`,

        checksum,

        published_at:
          now,

        published_by:
          user.id,

        updated_at:
          now,
      })
      .eq("id", true);

    if (
      databaseReleaseError
    ) {
      throw databaseReleaseError;
    }

    /*
     * =====================================================
     * DATABASE HISTORY
     * =====================================================
     */

    const {
      error: clearHistoryError,
    } = await db
      .from("database_versions")
      .update({
        is_current: false,
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
      error: historyError,
    } = await db
      .from("database_versions")
      .insert({
        major_version:
          major,

        minor_version:
          minor,

        release_name:
          `World: ${destination.name}`,

        checksum,

        notes:
          `Published Life World destination ${destination.code}`,

        is_current:
          true,

        published_at:
          now,

        published_by:
          user.id,
      });

    if (historyError) {
      throw historyError;
    }

    /*
     * =====================================================
     * SYNC CHANGES
     * =====================================================
     */

    const syncRows: any[] = [];

    syncRows.push({
      db_version:
        numericDbVersion,

      entity_type:
        "destinations",

      entity_id:
        destination.id,

      operation:
        "upsert",

      payload:
        destination,
    });

    locations.forEach(
      (row) => {
        syncRows.push({
          db_version:
            numericDbVersion,

          entity_type:
            "locations",

          entity_id:
            row.id,

          operation:
            "upsert",

          payload:
            row,
        });
      }
    );

    npcs.forEach(
      (row) => {
        syncRows.push({
          db_version:
            numericDbVersion,

          entity_type:
            "npcs",

          entity_id:
            row.id,

          operation:
            "upsert",

          payload:
            row,
        });
      }
    );

    nodesToPublish.forEach(
      (row) => {
        syncRows.push({
          db_version:
            numericDbVersion,

          entity_type:
            "story_nodes",

          entity_id:
            row.id,

          operation:
            "upsert",

          payload:
            row,
        });
      }
    );

    destinationChoices.forEach(
      (row) => {
        syncRows.push({
          db_version:
            numericDbVersion,

          entity_type:
            "story_choices",

          entity_id:
            row.id,

          operation:
            "upsert",

          payload:
            row,
        });
      }
    );

    questsToPublish.forEach(
      (row) => {
        syncRows.push({
          db_version:
            numericDbVersion,

          entity_type:
            "quests",

          entity_id:
            row.id,

          operation:
            "upsert",

          payload:
            row,
        });
      }
    );

    allSteps
      .filter(
        (step) =>
          questIds.has(
            step.quest_id
          )
      )
      .forEach(
        (row) => {
          syncRows.push({
            db_version:
              numericDbVersion,

            entity_type:
              "quest_steps",

            entity_id:
              row.id,

            operation:
              "upsert",

            payload:
              row,
          });
        }
      );

    allDialogue
      .filter(
        (line) =>
          activeNodeIds.has(
            line.story_node_id
          )
      )
      .forEach(
        (row) => {
          syncRows.push({
            db_version:
              numericDbVersion,

            entity_type:
              "dialogue_lines",

            entity_id:
              row.id,

            operation:
              "upsert",

            payload:
              row,
          });
        }
      );

    calendarEvents.forEach(
      (row) => {
        syncRows.push({
          db_version:
            numericDbVersion,

          entity_type:
            "cultural_calendar_events",

          entity_id:
            row.id,

          operation:
            "upsert",

          payload:
            row,
        });
      }
    );

    if (syncRows.length) {
      const {
        error: syncError,
      } = await db
        .from("sync_changes")
        .insert(
          syncRows
        );

      if (syncError) {
        throw syncError;
      }
    }

    /*
     * =====================================================
     * MANIFEST
     * =====================================================
     */

    const {
      error: manifestError,
    } = await db
      .from("app_update_manifest")
      .update({
        minimum_database_version:
          newVersion,

        updated_at:
          now,
      })
      .eq("id", true);

    if (
      manifestError
    ) {
      throw manifestError;
    }

    return json({
      success: true,

      destination:
        destination.code,

      destination_id:
        destination.id,

      database_version:
        newVersion,

      database_version_number:
        numericDbVersion,

      published_locations:
        locations.length,

      published_npcs:
        npcs.length,

      published_story_nodes:
        nodesToPublish.length,

      published_story_choices:
        destinationChoices.length,

      published_quests:
        questsToPublish.length,

      published_quest_steps:
        allSteps.filter(
          (step) =>
            questIds.has(
              step.quest_id
            )
        ).length,

      published_dialogue_lines:
        allDialogue.filter(
          (line) =>
            activeNodeIds.has(
              line.story_node_id
            )
        ).length,

      cultural_calendar_events:
        calendarEvents.length,

      sync_changes:
        syncRows.length,

      warnings,

      checksum,

      published_at:
        now,
    });
  } catch (error) {
    console.error(
      "PUBLISH WORLD ERROR:",
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
