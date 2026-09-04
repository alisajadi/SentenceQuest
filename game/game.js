const SUPABASE_URL = "https://rmzmlehgsksvrlefyvqa.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mGaig4vsOn0UUYOXLLl-_g_MEKvIW8r";

const sb = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const app = document.getElementById("app");
const hud = document.getElementById("hud");

const state = {
  session: null,
  profile: null,

  destination: null,
  timeState: null,

  storyProgress: null,
  currentNode: null,
  location: null,
  npc: null,

  dialogueLines: [],
  quests: [],
  questProgressByQuestId: new Map(),
  choices: [],

  view: "story",

  activeQuest: null
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);
}

function normalizeSentence(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function shuffle(list) {
  const copy = [...list];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);

  d.setUTCDate(d.getUTCDate() + days);

  return d.toISOString().slice(0, 10);
}

function formatDate(iso) {
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString(
      undefined,
      {
        month: "short",
        day: "numeric",
        year: "numeric"
      }
    );
  } catch {
    return iso;
  }
}

function timeLabel(value) {
  const labels = {
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Evening",
    night: "Night"
  };

  return labels[value] || value || "";
}

function getNodeDay(node) {
  const value = Number(node?.day_number);

  return Number.isFinite(value) && value > 0
    ? value
    : state.timeState?.life_day_number || 1;
}

function getNodeTime(node) {
  return node?.time_of_day ||
    state.timeState?.time_of_day ||
    "morning";
}

/* =========================================================
   AUTH / BOOT
========================================================= */

async function boot() {
  try {
    const {
      data: { session },
      error
    } = await sb.auth.getSession();

    if (error) {
      renderLogin(error.message);
      return;
    }

    if (!session) {
      renderLogin();
      return;
    }

    state.session = session;

    const {
      data: profile,
      error: profileError
    } = await sb
      .from("profiles")
      .select("id,display_name,role,xp,current_level")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profileError) {
      renderLogin(`Profile error: ${profileError.message}`);
      return;
    }

    if (!profile) {
      renderLogin(
        "Your account has no profile yet. Try signing in again in a moment."
      );
      return;
    }

    state.profile = profile;

    updateHud();

    await goToStoryView();
  } catch (error) {
    console.error(error);

    renderLogin(
      error?.message || "Unexpected error."
    );
  }
}

function renderLogin(message = "") {
  hud.innerHTML = "";

  app.innerHTML = `
    <div class="login">
      <div class="login-logo">SQ</div>

      <h2>Sentence Quest</h2>

      <p class="login-subtitle">
        Your language-learning adventure
      </p>

      ${
        message
          ? `<p class="error">${esc(message)}</p>`
          : ""
      }

      <input
        id="email"
        type="email"
        placeholder="Email"
        autocomplete="username"
      >

      <input
        id="password"
        type="password"
        placeholder="Password"
        autocomplete="current-password"
      >

      <button id="signIn">
        Sign in
      </button>

      <button id="signUp" class="secondary">
        Create account
      </button>

      <p class="muted">
        Test build connected to the SentenceQuest database.
      </p>
    </div>
  `;

  document.getElementById("signIn").onclick =
    () => handleAuth("signIn");

  document.getElementById("signUp").onclick =
    () => handleAuth("signUp");
}

async function handleAuth(mode) {
  const email =
    document.getElementById("email").value.trim();

  const password =
    document.getElementById("password").value;

  if (!email || !password) {
    alert("Enter email and password.");
    return;
  }

  try {
    if (mode === "signUp") {
      const {
        data,
        error
      } = await sb.auth.signUp({
        email,
        password
      });

      if (error) {
        throw error;
      }

      if (!data.session) {
        renderLogin(
          "Account created. Check your email to confirm, then sign in."
        );

        return;
      }
    } else {
      const { error } =
        await sb.auth.signInWithPassword({
          email,
          password
        });

      if (error) {
        throw error;
      }
    }

    await boot();
  } catch (error) {
    alert(error.message || String(error));
  }
}

document.getElementById("logout").onclick =
  async () => {
    try {
      await sb.auth.signOut();
    } finally {
      location.reload();
    }
  };

document.getElementById("navStory").onclick =
  () => goToStoryView();

document.getElementById("navCalendar").onclick =
  () => goToCalendarView();

function setActiveTab(view) {
  document
    .getElementById("navStory")
    .classList.toggle("active", view === "story");

  document
    .getElementById("navCalendar")
    .classList.toggle("active", view === "calendar");
}

function updateHud() {
  const parts = [];

  if (state.profile) {
    parts.push(
      `<b>${esc(state.profile.display_name || "Player")}</b>`
    );

    parts.push(
      `XP <b>${esc(state.profile.xp || 0)}</b>`
    );
  }

  if (state.timeState) {
    parts.push(
      `Day <b>${esc(state.timeState.life_day_number)}</b>`
    );

    parts.push(
      `${esc(formatDate(state.timeState.life_date))}`
    );

    parts.push(
      `<span class="hud-time">${esc(
        timeLabel(state.timeState.time_of_day)
      )}</span>`
    );
  }

  if (state.destination) {
    parts.push(
      `<span class="hud-destination">${esc(
        state.destination.name
      )}</span>`
    );
  }

  hud.innerHTML = parts.join(" &nbsp;·&nbsp; ");
}

/* =========================================================
   WORLD BOOTSTRAP
========================================================= */

async function ensureDestination() {
  const {
    data,
    error
  } = await sb
    .from("destinations")
    .select("id,code,name,language_id,timezone")
    .eq("is_active", true)
    .order("created_at", {
      ascending: true
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  state.destination = data || null;

  return state.destination;
}

async function ensureTimeState(destinationId) {
  const {
    data,
    error
  } = await sb
    .from("user_time_state")
    .select("*")
    .eq("user_id", state.session.user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    state.timeState = data;

    /*
     * If the player has an old time state pointing
     * to another destination, move the state to the
     * currently selected destination.
     */
    if (data.destination_id !== destinationId) {
      const {
        data: updated,
        error: updateError
      } = await sb
        .from("user_time_state")
        .update({
          destination_id: destinationId,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", state.session.user.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      state.timeState = updated;
    }

    return state.timeState;
  }

  const fresh = {
    user_id: state.session.user.id,
    destination_id: destinationId,
    life_date: todayIso(),
    life_day_number: 1,
    time_of_day: "morning",
    time_progression_mode: "on_login",
    last_played_real_at: new Date().toISOString()
  };

  const {
    data: inserted,
    error: insertError
  } = await sb
    .from("user_time_state")
    .insert(fresh)
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }

  state.timeState = inserted;

  return inserted;
}

async function ensureStoryProgress(destinationId) {
  const {
    data,
    error
  } = await sb
    .from("user_story_progress")
    .select("*")
    .eq("user_id", state.session.user.id)
    .eq("destination_id", destinationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    state.storyProgress = data;

    return data;
  }

  const {
    data: startNode,
    error: startError
  } = await sb
    .from("story_nodes")
    .select("*")
    .eq("destination_id", destinationId)
    .eq("is_start", true)
    .eq("is_published", true)
    .eq("is_active", true)
    .order("day_number", {
      ascending: true
    })
    .limit(1)
    .maybeSingle();

  if (startError) {
    throw startError;
  }

  if (!startNode) {
    state.storyProgress = null;

    return null;
  }

  const {
    data: inserted,
    error: insertError
  } = await sb
    .from("user_story_progress")
    .insert({
      user_id: state.session.user.id,
      destination_id: destinationId,
      current_node_id: startNode.id
    })
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }

  state.storyProgress = inserted;

  return inserted;
}

/* =========================================================
   STORY VIEW
========================================================= */

async function goToStoryView() {
  state.view = "story";
  state.activeQuest = null;

  setActiveTab("story");

  try {
    app.innerHTML = `
      <div class="card loading-card">
        <div class="loading-spinner"></div>
        <p>Loading your world...</p>
      </div>
    `;

    const destination =
      await ensureDestination();

    if (!destination) {
      app.innerHTML = `
        <div class="card empty-state">
          <div class="empty-icon">🌎</div>

          <h2>No world yet</h2>

          <p class="muted">
            No destination has been created yet.
          </p>

          <p class="muted">
            Import a Quest Pack from the admin panel.
          </p>
        </div>
      `;

      return;
    }

    await ensureTimeState(destination.id);

    const progress =
      await ensureStoryProgress(destination.id);

    updateHud();

    if (!progress) {
      app.innerHTML = `
        <div class="card empty-state">
          <div class="empty-icon">🧭</div>

          <h2>No starting point yet</h2>

          <p class="muted">
            <strong>${esc(destination.name)}</strong>
            has no published starting Story Node.
          </p>

          <p class="muted">
            Open Story Graph in the admin panel and
            mark a node as both
            <strong>Start</strong> and
            <strong>Published</strong>.
          </p>
        </div>
      `;

      return;
    }

    await loadScene(progress.current_node_id);
  } catch (error) {
    renderError(error);
  }
}

async function loadScene(nodeId) {
  const {
    data: node,
    error: nodeError
  } = await sb
    .from("story_nodes")
    .select("*")
    .eq("id", nodeId)
    .eq("is_active", true)
    .eq("is_published", true)
    .maybeSingle();

  if (nodeError) {
    throw nodeError;
  }

  if (!node) {
    app.innerHTML = `
      <div class="card empty-state">
        <div class="empty-icon">⚠️</div>

        <h2>Story node unavailable</h2>

        <p class="error">
          The current story node could not be loaded.
        </p>

        <p class="muted">
          It may have been unpublished or removed.
        </p>

        <button onclick="goToStoryView()">
          Return to Story
        </button>
      </div>
    `;

    return;
  }

  state.currentNode = node;

  /*
   * Keep Life Time synchronized with the Story Node.
   *
   * Important:
   * We do NOT automatically move the date here.
   * Day changes are handled when a Choice is taken.
   */
  await synchronizeTimeWithNode(node);

  const [
    locationRes,
    npcRes,
    dialogueRes,
    questsRes,
    choicesRes
  ] = await Promise.all([
    node.location_id
      ? sb
          .from("locations")
          .select("*")
          .eq("id", node.location_id)
          .eq("is_active", true)
          .maybeSingle()
      : Promise.resolve({
          data: null,
          error: null
        }),

    node.npc_id
      ? sb
          .from("npcs")
          .select("*")
          .eq("id", node.npc_id)
          .eq("is_active", true)
          .maybeSingle()
      : Promise.resolve({
          data: null,
          error: null
        }),

    sb
      .from("dialogue_lines")
      .select("*")
      .eq("story_node_id", node.id)
      .order("line_order", {
        ascending: true
      }),

    sb
      .from("quests")
      .select("*")
      .eq("story_node_id", node.id)
      .eq("is_published", true)
      .order("created_at", {
        ascending: true
      }),

    sb
      .from("story_choices")
      .select("*")
      .eq("from_node_id", node.id)
      .order("sort_order", {
        ascending: true
      })
  ]);

  if (locationRes.error) {
    throw locationRes.error;
  }

  if (npcRes.error) {
    throw npcRes.error;
  }

  if (dialogueRes.error) {
    throw dialogueRes.error;
  }

  if (questsRes.error) {
    throw questsRes.error;
  }

  if (choicesRes.error) {
    throw choicesRes.error;
  }

  state.location = locationRes.data;
  state.npc = npcRes.data;

  state.dialogueLines =
    dialogueRes.data || [];

  state.quests =
    questsRes.data || [];

  /*
   * Only expose choices whose target node is
   * published and active.
   */
  const rawChoices =
    choicesRes.data || [];

  if (rawChoices.length) {
    const targetIds = [
      ...new Set(
        rawChoices
          .map((choice) => choice.to_node_id)
          .filter(Boolean)
      )
    ];

    if (targetIds.length) {
      const {
        data: targetNodes,
        error: targetError
      } = await sb
        .from("story_nodes")
        .select("id")
        .in("id", targetIds)
        .eq("is_active", true)
        .eq("is_published", true);

      if (targetError) {
        throw targetError;
      }

      const publishedTargetIds =
        new Set(
          (targetNodes || []).map(
            (item) => item.id
          )
        );

      state.choices =
        rawChoices.filter(
          (choice) =>
            publishedTargetIds.has(
              choice.to_node_id
            )
        );
    } else {
      state.choices = [];
    }
  } else {
    state.choices = [];
  }

  const questIds =
    state.quests.map((quest) => quest.id);

  state.questProgressByQuestId =
    new Map();

  if (questIds.length) {
    const {
      data: progressRows,
      error: progressError
    } = await sb
      .from("user_quest_progress")
      .select("*")
      .eq("user_id", state.session.user.id)
      .in("quest_id", questIds);

    if (progressError) {
      throw progressError;
    }

    (progressRows || []).forEach((row) => {
      state.questProgressByQuestId.set(
        row.quest_id,
        row
      );
    });
  }

  updateHud();

  renderScene();
}

async function synchronizeTimeWithNode(node) {
  if (!state.timeState) {
    return;
  }

  const desiredDay =
    getNodeDay(node);

  const desiredTime =
    getNodeTime(node);

  const currentDay =
    Number(state.timeState.life_day_number);

  const updates = {};

  if (
    Number.isFinite(desiredDay) &&
    desiredDay !== currentDay
  ) {
    updates.life_day_number =
      desiredDay;

    /*
     * When Story Graph explicitly says Day N,
     * derive the Life Date from Day 1.
     */
    const dayOffset =
      desiredDay - 1;

    updates.life_date =
      addDaysIso(
        state.timeState.life_date,
        dayOffset
      );
  }

  if (
    desiredTime &&
    desiredTime !== state.timeState.time_of_day
  ) {
    updates.time_of_day =
      desiredTime;
  }

  if (!Object.keys(updates).length) {
    return;
  }

  /*
   * For the prototype we only synchronize
   * the time-of-day here.
   *
   * Date changes are handled separately in
   * advanceToNode().
   */

  if (updates.life_day_number !== undefined) {
    delete updates.life_day_number;
    delete updates.life_date;
  }

  if (!Object.keys(updates).length) {
    return;
  }

  updates.updated_at =
    new Date().toISOString();

  const {
    data,
    error
  } = await sb
    .from("user_time_state")
    .update(updates)
    .eq("user_id", state.session.user.id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  state.timeState = data;
}

/* =========================================================
   STORY RENDER
========================================================= */

function renderScene() {
  const node =
    state.currentNode;

  const allQuestsDone =
    state.quests.every((quest) => {
      const progress =
        state.questProgressByQuestId.get(
          quest.id
        );

      return (
        progress?.status === "completed" &&
        !quest.is_repeatable
      );
    });

  const hasIncompleteQuests =
    state.quests.some((quest) => {
      const progress =
        state.questProgressByQuestId.get(
          quest.id
        );

      return (
        !progress ||
        progress.status !== "completed"
      );
    });

  app.innerHTML = `
    <div class="story-header">

      <div class="story-day">
        <span class="story-day-number">
          DAY ${esc(
            state.timeState?.life_day_number || 1
          )}
        </span>

        <span class="story-time">
          ${esc(
            timeLabel(
              state.timeState?.time_of_day
            )
          )}
        </span>
      </div>

      ${
        state.location
          ? `
            <div class="story-location">
              📍 ${esc(state.location.name)}
            </div>
          `
          : ""
      }

    </div>

    <div class="card scene-card">

      ${
        node.node_type
          ? `
            <div class="node-type">
              ${esc(node.node_type)}
            </div>
          `
          : ""
      }

      <h1>${esc(node.title)}</h1>

      ${
        node.description
          ? `
            <p class="scene-description">
              ${esc(node.description)}
            </p>
          `
          : ""
      }

      ${
        state.dialogueLines.length
          ? `
            <div class="dialogue">
              ${state.dialogueLines
                .map((line) => renderDialogueLine(line))
                .join("")}
            </div>
          `
          : ""
      }

    </div>

    ${
      state.quests.length
        ? `
          <div class="card quests-card">

            <div class="section-title">
              <span>Current Tasks</span>
              <span class="quest-count">
                ${state.quests.length}
              </span>
            </div>

            ${state.quests
              .map((quest) =>
                renderQuestItem(quest)
              )
              .join("")}

          </div>
        `
        : ""
    }

    ${
      allQuestsDone &&
      state.choices.length
        ? `
          <div class="card choices-card">

            <div class="section-title">
              <span>What do you do next?</span>
            </div>

            <div class="choice-list">
              ${state.choices
                .map(
                  (choice) => `
                    <button
                      class="choice-button"
                      data-choice-id="${esc(
                        choice.id
                      )}"
                    >
                      <span>
                        ${esc(
                          choice.choice_text
                        )}
                      </span>

                      <span class="choice-arrow">
                        →
                      </span>
                    </button>
                  `
                )
                .join("")}
            </div>

          </div>
        `
        : ""
    }

    ${
      !state.quests.length &&
      !state.choices.length
        ? `
          <div class="card story-end">
            <div class="empty-icon">✨</div>

            <h3>End of this chapter</h3>

            <p class="muted">
              More of your journey will be added soon.
            </p>
          </div>
        `
        : ""
    }

    ${
      !allQuestsDone &&
      hasIncompleteQuests &&
      state.quests.length
        ? `
          <div class="story-hint">
            Complete your current tasks to continue the story.
          </div>
        `
        : ""
    }
  `;

  document
    .querySelectorAll("[data-quest-id]")
    .forEach((button) => {
      button.onclick =
        () => startQuest(
          button.dataset.questId
        );
    });

  document
    .querySelectorAll("[data-choice-id]")
    .forEach((button) => {
      button.onclick =
        () => takeChoice(
          button.dataset.choiceId
        );
    });
}

function renderDialogueLine(line) {
  const speaker =
    line.speaker_type === "npc"
      ? state.npc?.name || "NPC"
      : line.speaker_type === "player"
        ? "You"
        : "Narrator";

  const className =
    line.speaker_type === "player"
      ? "dialogue-line player"
      : line.speaker_type === "narrator"
        ? "dialogue-line narrator"
        : "dialogue-line";

  return `
    <div class="${className}">

      <div class="speaker">
        ${esc(speaker)}
      </div>

      <div class="bubble">

        <div class="dialogue-text">
          ${esc(line.target_text)}
        </div>

        ${
          line.native_translation
            ? `
              <div class="translation">
                ${esc(
                  line.native_translation
                )}
              </div>
            `
            : ""
        }

      </div>

    </div>
  `;
}

function renderQuestItem(quest) {
  const progress =
    state.questProgressByQuestId.get(
      quest.id
    );

  const done =
    progress?.status === "completed";

  const inProgress =
    progress?.status === "in_progress";

  const disabled =
    done && !quest.is_repeatable;

  let buttonText =
    "Start Quest";

  if (done) {
    buttonText =
      quest.is_repeatable
        ? "Play Again"
        : "Completed ✓";
  } else if (inProgress) {
    buttonText =
      "Continue";
  }

  return `
    <div class="quest-item">

      <div class="quest-info">

        <div class="quest-title">
          ${esc(quest.title)}
        </div>

        ${
          quest.description
            ? `
              <div class="muted">
                ${esc(
                  quest.description
                )}
              </div>
            `
            : ""
        }

        ${
          quest.xp_reward
            ? `
              <div class="quest-xp">
                +${esc(
                  quest.xp_reward
                )} XP
              </div>
            `
            : ""
        }

      </div>

      <button
        data-quest-id="${esc(
          quest.id
        )}"
        ${disabled ? "disabled" : ""}
        class="${
          done
            ? "secondary quest-completed"
            : ""
        }"
      >
        ${buttonText}
      </button>

    </div>
  `;
}

/* =========================================================
   STORY CHOICES
========================================================= */

async function takeChoice(choiceId) {
  try {
    const choice =
      state.choices.find(
        (item) => item.id === choiceId
      );

    if (!choice) {
      return;
    }

    const button =
      document.querySelector(
        `[data-choice-id="${choiceId}"]`
      );

    if (button) {
      button.disabled = true;
    }

    /*
     * Verify the destination node before making
     * any progress changes.
     */
    const {
      data: nextNode,
      error: nextNodeError
    } = await sb
      .from("story_nodes")
      .select("*")
      .eq("id", choice.to_node_id)
      .eq("is_active", true)
      .eq("is_published", true)
      .maybeSingle();

    if (nextNodeError) {
      throw nextNodeError;
    }

    if (!nextNode) {
      throw new Error(
        "The next story node is not available."
      );
    }

    /*
     * Record the choice.
     */
    const {
      error: choiceError
    } = await sb
      .from("user_story_choices_made")
      .upsert(
        {
          user_id:
            state.session.user.id,

          story_choice_id:
            choice.id
        },
        {
          onConflict:
            "user_id,story_choice_id"
        }
      );

    if (choiceError) {
      throw choiceError;
    }

    await advanceToNode(nextNode);

  } catch (error) {
    renderError(error);
  }
}

async function advanceToNode(nextNode) {
  const currentDay =
    Number(
      state.timeState?.life_day_number || 1
    );

  const targetDay =
    getNodeDay(nextNode);

  /*
   * Story Graph owns the intended Life Day.
   *
   * If the next node explicitly says Day 2,
   * move to Day 2.
   *
   * If it still says Day 1, remain on Day 1.
   */
  let nextLifeDay =
    currentDay;

  let nextLifeDate =
    state.timeState.life_date;

  if (
    Number.isFinite(targetDay) &&
    targetDay > 0 &&
    targetDay !== currentDay
  ) {
    const difference =
      targetDay - currentDay;

    nextLifeDay =
      targetDay;

    nextLifeDate =
      addDaysIso(
        state.timeState.life_date,
        difference
      );
  }

  const nextTime =
    getNodeTime(nextNode);

  const {
    data: updatedTime,
    error: timeError
  } = await sb
    .from("user_time_state")
    .update({
      life_date: nextLifeDate,
      life_day_number: nextLifeDay,
      time_of_day: nextTime,
      last_played_real_at:
        new Date().toISOString(),
      updated_at:
        new Date().toISOString()
    })
    .eq(
      "user_id",
      state.session.user.id
    )
    .select()
    .single();

  if (timeError) {
    throw timeError;
  }

  state.timeState =
    updatedTime;

  /*
   * Move story progress.
   */
  const {
    data: updatedProgress,
    error: progressError
  } = await sb
    .from("user_story_progress")
    .update({
      current_node_id:
        nextNode.id,

      updated_at:
        new Date().toISOString()
    })
    .eq(
      "user_id",
      state.session.user.id
    )
    .eq(
      "destination_id",
      state.destination.id
    )
    .select()
    .single();

  if (progressError) {
    throw progressError;
  }

  state.storyProgress =
    updatedProgress;

  /*
   * Journal event.
   */
  const {
    error: calendarError
  } = await sb
    .from("calendar_events")
    .insert({
      user_id:
        state.session.user.id,

      life_date:
        nextLifeDate,

      event_type:
        "story_event",

      title:
        nextNode.title,

      related_story_node_id:
        nextNode.id
    });

  if (calendarError) {
    throw calendarError;
  }

  updateHud();

  await loadScene(nextNode.id);
}

/* =========================================================
   QUEST PLAY
========================================================= */

async function startQuest(questId) {
  try {
    const quest =
      state.quests.find(
        (item) => item.id === questId
      );

    if (!quest) {
      return;
    }

    const existingProgress =
      state.questProgressByQuestId.get(
        questId
      );

    if (
      existingProgress?.status ===
        "completed" &&
      !quest.is_repeatable
    ) {
      return;
    }

    const {
      data: steps,
      error
    } = await sb
      .from("quest_steps")
      .select("*")
      .eq("quest_id", questId)
      .order("step_order", {
        ascending: true
      });

    if (error) {
      throw error;
    }

    if (!steps?.length) {
      alert(
        "This quest has no steps yet."
      );

      return;
    }

    /*
     * Mark quest as in progress.
     */
    const {
      data: progress,
      error: progressError
    } = await sb
      .from("user_quest_progress")
      .upsert(
        {
          user_id:
            state.session.user.id,

          quest_id:
            quest.id,

          status:
            "in_progress",

          started_at:
            existingProgress?.started_at ||
            new Date().toISOString(),

          updated_at:
            new Date().toISOString()
        },
        {
          onConflict:
            "user_id,quest_id"
        }
      )
      .select()
      .single();

    if (progressError) {
      throw progressError;
    }

    state.questProgressByQuestId.set(
      quest.id,
      progress
    );

    state.activeQuest = {
      quest,
      steps,
      stepIndex: 0,
      lesson: null,
      validSentences: [],
      bank: [],
      builder: [],
      lastResult: null
    };

    await loadQuestStep();

  } catch (error) {
    renderError(error);
  }
}

async function loadQuestStep() {
  const aq =
    state.activeQuest;

  if (!aq) {
    return;
  }

  const step =
    aq.steps[aq.stepIndex];

  if (!step) {
    await finishQuest();

    return;
  }

  if (!step.lesson_id) {
    renderQuestStepText(step);

    return;
  }

  const [
    lessonRes,
    lessonWordsRes
  ] = await Promise.all([
    sb
      .from("lessons")
      .select("*")
      .eq("id", step.lesson_id)
      .eq("is_published", true)
      .maybeSingle(),

    sb
      .from("lesson_words")
      .select(
        "vocabulary_id,sort_order"
      )
      .eq(
        "lesson_id",
        step.lesson_id
      )
      .order("sort_order", {
        ascending: true
      })
  ]);

  if (lessonRes.error) {
    throw lessonRes.error;
  }

  if (lessonWordsRes.error) {
    throw lessonWordsRes.error;
  }

  const lesson =
    lessonRes.data;

  if (!lesson) {
    app.innerHTML = `
      <div class="card empty-state">

        <div class="empty-icon">📚</div>

        <h2>Lesson unavailable</h2>

        <p class="error">
          This quest step points to a lesson
          that is not published.
        </p>

        <button onclick="goToStoryView()">
          Back to Story
        </button>

      </div>
    `;

    return;
  }

  const lessonWords =
    lessonWordsRes.data || [];

  const vocabIds =
    lessonWords.map(
      (word) => word.vocabulary_id
    );

  const {
    data: vocabRows,
    error: vocabError
  } = vocabIds.length
    ? await sb
        .from("vocabulary")
        .select("id,word")
        .in("id", vocabIds)
    : {
        data: [],
        error: null
      };

  if (vocabError) {
    throw vocabError;
  }

  const vocabMap =
    new Map(
      (vocabRows || []).map(
        (vocab) => [
          vocab.id,
          vocab.word
        ]
      )
    );

  const {
    data: validSentences,
    error: validError
  } = await sb
    .from("valid_sentences")
    .select("sentence_text")
    .eq("lesson_id", lesson.id)
    .eq("is_approved", true);

  if (validError) {
    throw validError;
  }

  const bank =
    shuffle(
      lessonWords.map(
        (word, index) => ({
          key:
            `${word.vocabulary_id}-${index}`,

          id:
            word.vocabulary_id,

          word:
            vocabMap.get(
              word.vocabulary_id
            ) || "?"
        })
      )
    );

  aq.lesson =
    lesson;

  aq.validSentences =
    (validSentences || []).map(
      (item) =>
        normalizeSentence(
          item.sentence_text
        )
    );

  aq.bank =
    bank;

  aq.builder =
    [];

  aq.lastResult =
    null;

  renderQuestStepSentence();
}

function renderQuestStepText(step) {
  const aq =
    state.activeQuest;

  const currentNumber =
    aq.stepIndex + 1;

  const total =
    aq.steps.length;

  app.innerHTML = `
    <div class="card quest-step-card">

      <div class="quest-progress">
        Step ${currentNumber} of ${total}
      </div>

      <h2>
        ${esc(aq.quest.title)}
      </h2>

      ${
        step.prompt_native
          ? `
            <p class="quest-prompt-native">
              ${esc(step.prompt_native)}
            </p>
          `
          : ""
      }

      ${
        step.prompt_target
          ? `
            <p class="quest-prompt-target">
              ${esc(step.prompt_target)}
            </p>
          `
          : ""
      }

      <div class="quest-type">
        ${esc(
          step.step_type || "task"
        )}
      </div>

      <button id="stepContinue">
        Continue
      </button>

      <button
        id="stepBack"
        class="secondary"
      >
        Back to Story
      </button>

    </div>
  `;

  document.getElementById(
    "stepContinue"
  ).onclick =
    () => advanceQuestStep();

  document.getElementById(
    "stepBack"
  ).onclick =
    () => {
      state.activeQuest = null;
      goToStoryView();
    };
}

function renderQuestStepSentence() {
  const aq =
    state.activeQuest;

  const stepNumber =
    aq.stepIndex + 1;

  const totalSteps =
    aq.steps.length;

  const targetSentence =
    Array.isArray(
      aq.lesson.target_sentence
    )
      ? aq.lesson.target_sentence.join(" ")
      : String(
          aq.lesson.target_sentence || ""
        );

  app.innerHTML = `
    <div class="card quest-step-card">

      <div class="quest-topline">

        <div class="quest-progress">
          Step ${stepNumber} of ${totalSteps}
        </div>

        <div class="quest-xp">
          +${esc(
            aq.lesson.base_xp || 0
          )} XP
        </div>

      </div>

      <h2>
        ${esc(aq.quest.title)}
      </h2>

      <p class="lesson-title">
        ${esc(aq.lesson.title)}
      </p>

      ${
        aq.lesson.hint
          ? `
            <p class="muted">
              ${esc(aq.lesson.hint)}
            </p>
          `
          : ""
      }

      <div class="instruction">
        Build the sentence:
      </div>

      <div
        class="sentence-builder"
        id="builderZone"
      >
        ${
          aq.builder.length
            ? aq.builder
                .map(
                  (word) => `
                    <button
                      class="word-chip in-builder"
                      data-from="builder"
                      data-key="${esc(
                        word.key
                      )}"
                    >
                      ${esc(word.word)}
                    </button>
                  `
                )
                .join("")
            : `
              <span class="builder-placeholder">
                Tap words below to build your sentence
              </span>
            `
        }
      </div>

      <div class="instruction">
        Word bank:
      </div>

      <div
        class="word-bank"
        id="bankZone"
      >
        ${
          aq.bank.length
            ? aq.bank
                .map(
                  (word) => `
                    <button
                      class="word-chip"
                      data-from="bank"
                      data-key="${esc(
                        word.key
                      )}"
                    >
                      ${esc(word.word)}
                    </button>
                  `
                )
                .join("")
            : `
              <span class="builder-placeholder">
                All words selected
              </span>
            `
        }
      </div>

      <div class="toolbar quest-toolbar">

        <button
          id="checkSentence"
          ${aq.builder.length ? "" : "disabled"}
        >
          Check Sentence
        </button>

        <button
          id="clearSentence"
          class="secondary"
        >
          Clear
        </button>

      </div>

      <div id="questFeedback"></div>

      <details class="debug-hint">
        <summary>Test hint</summary>

        <p>
          Target:
          <strong>
            ${esc(targetSentence)}
          </strong>
        </p>
      </details>

      <button
        id="backToStory"
        class="secondary back-button"
      >
        ← Back to Story
      </button>

    </div>
  `;

  document
    .querySelectorAll(
      '[data-from="bank"]'
    )
    .forEach((chip) => {
      chip.onclick =
        () =>
          moveWord(
            chip.dataset.key,
            "bank",
            "builder"
          );
    });

  document
    .querySelectorAll(
      '[data-from="builder"]'
    )
    .forEach((chip) => {
      chip.onclick =
        () =>
          moveWord(
            chip.dataset.key,
            "builder",
            "bank"
          );
    });

  document.getElementById(
    "checkSentence"
  ).onclick =
    checkSentence;

  document.getElementById(
    "clearSentence"
  ).onclick =
    () => {
      const aq =
        state.activeQuest;

      aq.bank =
        shuffle([
          ...aq.bank,
          ...aq.builder
        ]);

      aq.builder = [];

      renderQuestStepSentence();
    };

  document.getElementById(
    "backToStory"
  ).onclick =
    () => {
      state.activeQuest = null;
      goToStoryView();
    };
}

function moveWord(
  key,
  from,
  to
) {
  const aq =
    state.activeQuest;

  const source =
    from === "bank"
      ? aq.bank
      : aq.builder;

  const target =
    to === "bank"
      ? aq.bank
      : aq.builder;

  const index =
    source.findIndex(
      (word) =>
        word.key === key
    );

  if (index === -1) {
    return;
  }

  const [word] =
    source.splice(index, 1);

  target.push(word);

  renderQuestStepSentence();
}

/* =========================================================
   SENTENCE CHECKING
========================================================= */

async function checkSentence() {
  const aq =
    state.activeQuest;

  if (!aq?.lesson) {
    return;
  }

  const builtText =
    aq.builder
      .map((word) => word.word)
      .join(" ");

  const normalizedBuilt =
    normalizeSentence(
      builtText
    );

  const target =
    normalizeSentence(
      Array.isArray(
        aq.lesson.target_sentence
      )
        ? aq.lesson.target_sentence.join(" ")
        : aq.lesson.target_sentence
    );

  let outcome =
    "incorrect";

  let awardedXp =
    0;

  if (
    normalizedBuilt === target
  ) {
    outcome =
      "correct";

    awardedXp =
      Number(
        aq.lesson.base_xp || 0
      );
  } else if (
    aq.validSentences.includes(
      normalizedBuilt
    )
  ) {
    outcome =
      "creative";

    awardedXp =
      Number(
        aq.lesson.creativity_xp || 0
      );
  }

  const feedback =
    document.getElementById(
      "questFeedback"
    );

  if (!feedback) {
    return;
  }

  if (outcome === "incorrect") {
    feedback.innerHTML = `
      <div class="feedback incorrect">
        <strong>Not quite.</strong>
        Try rearranging the words.
      </div>

      <div class="toolbar">
        <button
          id="suggestSentence"
          class="secondary"
        >
          Send this to the admin for review
        </button>
      </div>
    `;

    const suggestButton =
      document.getElementById(
        "suggestSentence"
      );

    if (suggestButton) {
      suggestButton.onclick =
        async () => {
          try {
            suggestButton.disabled =
              true;

            const {
              error
            } = await sb
              .from("valid_sentences")
              .insert({
                lesson_id:
                  aq.lesson.id,

                tokens:
                  aq.builder.map(
                    (word) =>
                      word.word
                  ),

                sentence_text:
                  builtText,

                source:
                  "player",

                is_approved:
                  false
              });

            if (error) {
              throw error;
            }

            suggestButton.textContent =
              "Sent — thank you!";
          } catch (error) {
            suggestButton.disabled =
              false;

            alert(
              error.message ||
              String(error)
            );
          }
        };
    }

    return;
  }

  feedback.innerHTML = `
    <div class="feedback ${
      outcome === "correct"
        ? "correct"
        : "creative"
    }">

      <strong>
        ${
          outcome === "correct"
            ? "Correct!"
            : "Nice creativity!"
        }
      </strong>

      ${
        outcome === "creative"
          ? `
            <div>
              Your sentence is a valid
              alternative.
            </div>
          `
          : ""
      }

      <div class="feedback-xp">
        +${esc(awardedXp)} XP
      </div>

    </div>
  `;

  const checkButton =
    document.getElementById(
      "checkSentence"
    );

  if (checkButton) {
    checkButton.disabled =
      true;
  }

  try {
    await recordLessonCompletion(
      aq,
      awardedXp
    );

    /*
     * Only the last step completes
     * the entire Quest.
     */
    if (
      aq.stepIndex ===
      aq.steps.length - 1
    ) {
      await finishQuest(
        awardedXp
      );
    }

    setTimeout(
      async () => {
        try {
          if (
            aq.stepIndex <
            aq.steps.length - 1
          ) {
            await advanceQuestStep();
          } else {
            state.activeQuest = null;

            await loadScene(
              state.currentNode.id
            );
          }
        } catch (error) {
          renderError(error);
        }
      },
      800
    );

  } catch (error) {
    renderError(error);
  }
}

/* =========================================================
   PROGRESS / XP
========================================================= */

async function recordLessonCompletion(
  aq,
  awardedXp
) {
  const userId =
    state.session.user.id;

  const {
    data: existingProgress,
    error: existingError
  } = await sb
    .from("user_progress")
    .select(
      "attempts,best_score,completed"
    )
    .eq(
      "user_id",
      userId
    )
    .eq(
      "lesson_id",
      aq.lesson.id
    )
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const previousBest =
    Number(
      existingProgress?.best_score || 0
    );

  const previousAttempts =
    Number(
      existingProgress?.attempts || 0
    );

  const newBest =
    Math.max(
      previousBest,
      awardedXp
    );

  const {
    error: progressError
  } = await sb
    .from("user_progress")
    .upsert(
      {
        user_id:
          userId,

        lesson_id:
          aq.lesson.id,

        completed:
          true,

        best_score:
          newBest,

        attempts:
          previousAttempts + 1,

        updated_at:
          new Date().toISOString()
      },
      {
        onConflict:
          "user_id,lesson_id"
      }
    );

  if (progressError) {
    throw progressError;
  }

  /*
   * XP is awarded once for this successful
   * completion in the prototype.
   */
  const oldXp =
    Number(
      state.profile.xp || 0
    );

  const newXp =
    oldXp + Number(
      awardedXp || 0
    );

  const {
    data: updatedProfile,
    error: profileError
  } = await sb
    .from("profiles")
    .update({
      xp: newXp
    })
    .eq(
      "id",
      userId
    )
    .select(
      "id,display_name,role,xp,current_level"
    )
    .single();

  if (profileError) {
    throw profileError;
  }

  state.profile =
    updatedProfile;

  updateHud();
}

/* =========================================================
   QUEST COMPLETION
========================================================= */

async function finishQuest(
  awardedXp = 0
) {
  const aq =
    state.activeQuest;

  if (!aq) {
    return;
  }

  const userId =
    state.session.user.id;

  const {
    data: existingProgress,
    error: existingError
  } = await sb
    .from("user_quest_progress")
    .select(
      "best_score,started_at"
    )
    .eq(
      "user_id",
      userId
    )
    .eq(
      "quest_id",
      aq.quest.id
    )
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const bestScore =
    Math.max(
      Number(
        existingProgress?.best_score || 0
      ),
      Number(
        awardedXp || 0
      )
    );

  const now =
    new Date().toISOString();

  const {
    data: questProgress,
    error: questError
  } = await sb
    .from("user_quest_progress")
    .upsert(
      {
        user_id:
          userId,

        quest_id:
          aq.quest.id,

        status:
          "completed",

        started_at:
          existingProgress?.started_at ||
          now,

        completed_at:
          now,

        best_score:
          bestScore,

        updated_at:
          now
      },
      {
        onConflict:
          "user_id,quest_id"
      }
    )
    .select()
    .single();

  if (questError) {
    throw questError;
  }

  state.questProgressByQuestId.set(
    aq.quest.id,
    questProgress
  );

  /*
   * Add Quest completion to Life Journal.
   */
  const {
    error: calendarError
  } = await sb
    .from("calendar_events")
    .insert({
      user_id:
        userId,

      life_date:
        state.timeState.life_date,

      event_type:
        "quest_completed",

      title:
        aq.quest.title,

      related_quest_id:
        aq.quest.id
    });

  if (calendarError) {
    throw calendarError;
  }
}

async function advanceQuestStep() {
  const aq =
    state.activeQuest;

  if (!aq) {
    return;
  }

  aq.stepIndex += 1;

  if (
    aq.stepIndex <
    aq.steps.length
  ) {
    await loadQuestStep();

    return;
  }

  await finishQuest();

  state.activeQuest =
    null;

  await loadScene(
    state.currentNode.id
  );
}

/* =========================================================
   CALENDAR / LIFE JOURNAL
========================================================= */

async function goToCalendarView() {
  state.view =
    "calendar";

  setActiveTab(
    "calendar"
  );

  try {
    app.innerHTML = `
      <div class="card loading-card">
        <div class="loading-spinner"></div>
        <p>Loading your journal...</p>
      </div>
    `;

    const {
      data,
      error
    } = await sb
      .from("calendar_events")
      .select("*")
      .eq(
        "user_id",
        state.session.user.id
      )
      .order(
        "life_date",
        {
          ascending: true
        }
      )
      .order(
        "created_at",
        {
          ascending: true
        }
      );

    if (error) {
      throw error;
    }

    app.innerHTML = `
      <div class="card">

        <div class="journal-header">
          <div>
            <div class="eyebrow">
              YOUR JOURNEY
            </div>

            <h2>
              Life Journal
            </h2>
          </div>

          <div class="journal-day">
            Day ${
              esc(
                state.timeState?.life_day_number ||
                1
              )
            }
          </div>
        </div>

        ${
          (data || []).length
            ? `
              <div class="calendar-list">
                ${(data || [])
                  .map(
                    (event) => `
                      <div class="calendar-item">

                        <div class="calendar-date">
                          ${esc(
                            formatDate(
                              event.life_date
                            )
                          )}
                        </div>

                        <div class="calendar-event">

                          <strong>
                            ${esc(
                              event.title
                            )}
                          </strong>

                          ${
                            event.description
                              ? `
                                <div class="muted">
                                  ${esc(
                                    event.description
                                  )}
                                </div>
                              `
                              : ""
                          }

                        </div>

                      </div>
                    `
                  )
                  .join("")}
              </div>
            `
            : `
              <div class="empty-state">
                <div class="empty-icon">
                  📖
                </div>

                <p class="muted">
                  Nothing recorded yet.
                </p>

                <p class="muted">
                  Play through the story
                  to fill your Life Journal.
                </p>
              </div>
            `
        }

      </div>
    `;
  } catch (error) {
    renderError(error);
  }
}

/* =========================================================
   ERRORS
========================================================= */

function renderError(error) {
  console.error(
    "SENTENCEQUEST GAME ERROR:",
    error
  );

  app.innerHTML = `
    <div class="card error-card">

      <div class="empty-icon">
        ⚠️
      </div>

      <h2>
        Something went wrong
      </h2>

      <p class="error">
        ${esc(
          error?.message ||
          String(error)
        )}
      </p>

      <button
        id="retryStory"
      >
        Retry
      </button>

    </div>
  `;

  const retry =
    document.getElementById(
      "retryStory"
    );

  if (retry) {
    retry.onclick =
      () => goToStoryView();
  }
}

/* =========================================================
   START
========================================================= */

boot();
