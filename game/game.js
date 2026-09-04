const SUPABASE_URL = "https://rmzmlehgsksvrlefyvqa.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mGaig4vsOn0UUYOXLLl-_g_MEKvIW8r";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
  activeQuest: null, // { quest, steps, stepIndex, lesson, validSentences, bank, builder }
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
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
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso) {
  try {
    return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return iso;
  }
}

// =========================================================
// AUTH / BOOT
// =========================================================

async function boot() {
  try {
    const { data: { session }, error } = await sb.auth.getSession();
    if (error) return renderLogin(error.message);
    if (!session) return renderLogin();

    state.session = session;

    const { data: profile, error: profileError } = await sb
      .from("profiles")
      .select("id,display_name,role,xp,current_level")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profileError) return renderLogin(`Profile error: ${profileError.message}`);
    if (!profile) return renderLogin("Your account has no profile yet. Try signing in again in a moment.");

    state.profile = profile;
    updateHud();
    await goToStoryView();
  } catch (error) {
    console.error(error);
    renderLogin(error?.message || "Unexpected error.");
  }
}

function renderLogin(message = "") {
  hud.innerHTML = "";
  app.innerHTML = `
    <div class="login">
      <h2>Sentence Quest</h2>
      ${message ? `<p class="error">${esc(message)}</p>` : ""}
      <input id="email" type="email" placeholder="Email" autocomplete="username">
      <input id="password" type="password" placeholder="Password" autocomplete="current-password">
      <button id="signIn">Sign in</button>
      <button id="signUp" class="secondary">Create account</button>
      <p class="muted">This is a test build connected to the live SentenceQuest database.</p>
    </div>
  `;

  document.getElementById("signIn").onclick = () => handleAuth("signIn");
  document.getElementById("signUp").onclick = () => handleAuth("signUp");
}

async function handleAuth(mode) {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) {
    alert("Enter email and password.");
    return;
  }

  try {
    if (mode === "signUp") {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) {
        renderLogin("Account created. Check your email to confirm, then sign in.");
        return;
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    await boot();
  } catch (error) {
    alert(error.message || String(error));
  }
}

document.getElementById("logout").onclick = async () => {
  await sb.auth.signOut();
  location.reload();
};

document.getElementById("navStory").onclick = () => goToStoryView();
document.getElementById("navCalendar").onclick = () => goToCalendarView();

function setActiveTab(view) {
  document.getElementById("navStory").classList.toggle("active", view === "story");
  document.getElementById("navCalendar").classList.toggle("active", view === "calendar");
}

function updateHud() {
  const parts = [];
  if (state.profile) parts.push(`<b>${esc(state.profile.display_name || "Player")}</b>`);
  if (state.profile) parts.push(`XP: <b>${esc(state.profile.xp)}</b>`);
  if (state.timeState) {
    parts.push(`Day <b>${esc(state.timeState.life_day_number)}</b> · ${esc(formatDate(state.timeState.life_date))} · ${esc(state.timeState.time_of_day)}`);
  }
  if (state.destination) parts.push(esc(state.destination.name));
  hud.innerHTML = parts.join(" &nbsp;·&nbsp; ");
}

// =========================================================
// WORLD BOOTSTRAP (destination, time state, story progress)
// =========================================================

async function ensureDestination() {
  const { data, error } = await sb
    .from("destinations")
    .select("id,code,name")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  state.destination = data || null;
  return state.destination;
}

async function ensureTimeState(destinationId) {
  const { data, error } = await sb
    .from("user_time_state")
    .select("*")
    .eq("user_id", state.session.user.id)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    state.timeState = data;
    return data;
  }

  const fresh = {
    user_id: state.session.user.id,
    destination_id: destinationId,
    life_date: todayIso(),
    life_day_number: 1,
    time_of_day: "morning",
    time_progression_mode: "on_login",
  };

  const { data: inserted, error: insertError } = await sb
    .from("user_time_state")
    .insert(fresh)
    .select()
    .single();

  if (insertError) throw insertError;
  state.timeState = inserted;
  return inserted;
}

async function ensureStoryProgress(destinationId) {
  const { data, error } = await sb
    .from("user_story_progress")
    .select("*")
    .eq("user_id", state.session.user.id)
    .eq("destination_id", destinationId)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    state.storyProgress = data;
    return data;
  }

  const { data: startNode, error: startError } = await sb
    .from("story_nodes")
    .select("id")
    .eq("destination_id", destinationId)
    .eq("is_start", true)
    .eq("is_published", true)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (startError) throw startError;
  if (!startNode) {
    state.storyProgress = null;
    return null;
  }

  const { data: inserted, error: insertError } = await sb
    .from("user_story_progress")
    .insert({
      user_id: state.session.user.id,
      destination_id: destinationId,
      current_node_id: startNode.id,
    })
    .select()
    .single();

  if (insertError) throw insertError;
  state.storyProgress = inserted;
  return inserted;
}

// =========================================================
// STORY VIEW
// =========================================================

async function goToStoryView() {
  state.view = "story";
  state.activeQuest = null;
  setActiveTab("story");

  try {
    app.innerHTML = `<div class="card"><p class="muted">Loading your world...</p></div>`;

    const destination = await ensureDestination();
    if (!destination) {
      app.innerHTML = `
        <div class="card">
          <h2>No world yet</h2>
          <p class="muted">No destination has been created yet. Ask an admin to create one or import a quest pack from the admin panel.</p>
        </div>
      `;
      return;
    }

    await ensureTimeState(destination.id);
    const progress = await ensureStoryProgress(destination.id);
    updateHud();

    if (!progress) {
      app.innerHTML = `
        <div class="card">
          <h2>No starting point yet</h2>
          <p class="muted">
            "${esc(destination.name)}" has no published starting Story Node.
            In the admin panel, open Story Graph, create/select a node, check
            "Is start node" and "Published", then reload this page.
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
  const { data: node, error: nodeError } = await sb
    .from("story_nodes")
    .select("*")
    .eq("id", nodeId)
    .maybeSingle();
  if (nodeError) throw nodeError;

  if (!node) {
    app.innerHTML = `<div class="card"><p class="error">Current story node could not be found (it may have been unpublished).</p></div>`;
    return;
  }

  state.currentNode = node;

  const [locationRes, npcRes, dialogueRes, questsRes, choicesRes] = await Promise.all([
    node.location_id
      ? sb.from("locations").select("*").eq("id", node.location_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    node.npc_id
      ? sb.from("npcs").select("*").eq("id", node.npc_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb.from("dialogue_lines").select("*").eq("story_node_id", node.id).order("line_order"),
    sb.from("quests").select("*").eq("story_node_id", node.id).eq("is_published", true),
    sb.from("story_choices").select("*").eq("from_node_id", node.id).order("sort_order"),
  ]);

  if (locationRes.error) throw locationRes.error;
  if (npcRes.error) throw npcRes.error;
  if (dialogueRes.error) throw dialogueRes.error;
  if (questsRes.error) throw questsRes.error;
  if (choicesRes.error) throw choicesRes.error;

  state.location = locationRes.data;
  state.npc = npcRes.data;
  state.dialogueLines = dialogueRes.data || [];
  state.quests = questsRes.data || [];
  state.choices = choicesRes.data || [];

  const questIds = state.quests.map((q) => q.id);
  state.questProgressByQuestId = new Map();
  if (questIds.length) {
    const { data: progressRows, error: progressError } = await sb
      .from("user_quest_progress")
      .select("*")
      .eq("user_id", state.session.user.id)
      .in("quest_id", questIds);
    if (progressError) throw progressError;
    (progressRows || []).forEach((row) => state.questProgressByQuestId.set(row.quest_id, row));
  }

  renderScene();
}

function renderScene() {
  const node = state.currentNode;
  const allQuestsDone = state.quests.every((q) => {
    const progress = state.questProgressByQuestId.get(q.id);
    return progress?.status === "completed" && !q.is_repeatable;
  });

  app.innerHTML = `
    <div class="card">
      ${state.location ? `<span class="location-tag">${esc(state.location.name)}</span>` : ""}
      <h2>${esc(node.title)}</h2>
      ${node.description ? `<p class="muted">${esc(node.description)}</p>` : ""}

      ${state.dialogueLines.length ? `
        <div class="dialogue">
          ${state.dialogueLines.map((line) => `
            <div class="dialogue-line ${line.speaker_type === "player" ? "player" : ""}">
              <div class="speaker">
                ${line.speaker_type === "npc" ? esc(state.npc?.name || "NPC")
                  : line.speaker_type === "player" ? "You" : "Narrator"}
              </div>
              <div class="bubble">
                ${esc(line.target_text)}
                ${line.native_translation ? `<span class="translation">${esc(line.native_translation)}</span>` : ""}
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>

    ${state.quests.length ? `
      <div class="card">
        <h2>Quests here</h2>
        ${state.quests.map((quest) => {
          const progress = state.questProgressByQuestId.get(quest.id);
          const done = progress?.status === "completed";
          return `
            <div class="quest-item">
              <div>
                <div><strong>${esc(quest.title)}</strong></div>
                <div class="muted">${esc(quest.description || "")}</div>
              </div>
              <button data-quest-id="${esc(quest.id)}" ${done && !quest.is_repeatable ? "class=\"secondary\"" : ""}>
                ${done ? (quest.is_repeatable ? "Play Again" : "Completed ✓") : "Start Quest"}
              </button>
            </div>
          `;
        }).join("")}
      </div>
    ` : ""}

    ${allQuestsDone && state.choices.length ? `
      <div class="card">
        <h2>What do you do next?</h2>
        <div class="choice-list">
          ${state.choices.map((choice) => `
            <button class="choice-button" data-choice-id="${esc(choice.id)}">${esc(choice.choice_text)}</button>
          `).join("")}
        </div>
      </div>
    ` : ""}

    ${allQuestsDone && !state.choices.length ? `
      <div class="card">
        <p class="muted">This is the end of the story so far. More content will continue the journey later.</p>
      </div>
    ` : ""}
  `;

  document.querySelectorAll("[data-quest-id]").forEach((button) => {
    button.onclick = () => startQuest(button.dataset.questId);
  });
  document.querySelectorAll("[data-choice-id]").forEach((button) => {
    button.onclick = () => takeChoice(button.dataset.choiceId);
  });
}

async function takeChoice(choiceId) {
  try {
    const choice = state.choices.find((c) => c.id === choiceId);
    if (!choice) return;

    await sb.from("user_story_choices_made").upsert({
      user_id: state.session.user.id,
      story_choice_id: choice.id,
    }, { onConflict: "user_id,story_choice_id" });

    const nextDate = addDaysIso(state.timeState.life_date, 1);
    const nextDay = state.timeState.life_day_number + 1;

    const { data: updatedTime, error: timeError } = await sb
      .from("user_time_state")
      .update({
        life_date: nextDate,
        life_day_number: nextDay,
        time_of_day: "morning",
        last_played_real_at: new Date().toISOString(),
      })
      .eq("user_id", state.session.user.id)
      .select()
      .single();
    if (timeError) throw timeError;
    state.timeState = updatedTime;

    await sb.from("user_story_progress")
      .update({ current_node_id: choice.to_node_id, updated_at: new Date().toISOString() })
      .eq("user_id", state.session.user.id)
      .eq("destination_id", state.destination.id);

    const { data: nextNode } = await sb
      .from("story_nodes").select("title").eq("id", choice.to_node_id).maybeSingle();

    await sb.from("calendar_events").insert({
      user_id: state.session.user.id,
      life_date: nextDate,
      event_type: "story_event",
      title: nextNode?.title || "Next chapter",
      related_story_node_id: choice.to_node_id,
    });

    updateHud();
    await loadScene(choice.to_node_id);
  } catch (error) {
    renderError(error);
  }
}

// =========================================================
// QUEST PLAY (sentence-building mechanic, reuses lessons)
// =========================================================

async function startQuest(questId) {
  try {
    const quest = state.quests.find((q) => q.id === questId);
    if (!quest) return;

    const { data: steps, error } = await sb
      .from("quest_steps")
      .select("*")
      .eq("quest_id", questId)
      .order("step_order");
    if (error) throw error;

    if (!steps?.length) {
      alert("This quest has no steps yet.");
      return;
    }

    state.activeQuest = { quest, steps, stepIndex: 0 };
    await loadQuestStep();
  } catch (error) {
    renderError(error);
  }
}

async function loadQuestStep() {
  const aq = state.activeQuest;
  const step = aq.steps[aq.stepIndex];

  if (!step.lesson_id) {
    // Non-sentence step type with no lesson attached — show prompt text only for now.
    renderQuestStepText(step);
    return;
  }

  const [{ data: lesson, error: lessonError }, { data: lessonWords, error: wordsError }] =
    await Promise.all([
      sb.from("lessons").select("*").eq("id", step.lesson_id).maybeSingle(),
      sb.from("lesson_words").select("vocabulary_id,sort_order").eq("lesson_id", step.lesson_id).order("sort_order"),
    ]);

  if (lessonError) throw lessonError;
  if (wordsError) throw wordsError;

  if (!lesson) {
    app.innerHTML = `
      <div class="card">
        <p class="error">This quest step points to a lesson that isn't published yet.</p>
        <p class="muted">Publish it from the admin panel's "Publish / Sync" page first.</p>
        <button onclick="goToStoryView()">Back</button>
      </div>
    `;
    return;
  }

  const vocabIds = (lessonWords || []).map((w) => w.vocabulary_id);
  const { data: vocabRows, error: vocabError } = vocabIds.length
    ? await sb.from("vocabulary").select("id,word").in("id", vocabIds)
    : { data: [], error: null };
  if (vocabError) throw vocabError;

  const vocabMap = new Map((vocabRows || []).map((v) => [v.id, v.word]));

  const { data: validSentences, error: validError } = await sb
    .from("valid_sentences")
    .select("sentence_text")
    .eq("lesson_id", lesson.id)
    .eq("is_approved", true);
  if (validError) throw validError;

  const bank = shuffle(
    (lessonWords || []).map((w, i) => ({ key: `${w.vocabulary_id}-${i}`, id: w.vocabulary_id, word: vocabMap.get(w.vocabulary_id) || "?" }))
  );

  aq.lesson = lesson;
  aq.validSentences = (validSentences || []).map((v) => normalizeSentence(v.sentence_text));
  aq.bank = bank;
  aq.builder = [];
  aq.lastResult = null;

  renderQuestStepSentence();
}

function renderQuestStepText(step) {
  app.innerHTML = `
    <div class="card">
      <h2>${esc(state.activeQuest.quest.title)}</h2>
      ${step.prompt_native ? `<p>${esc(step.prompt_native)}</p>` : ""}
      ${step.prompt_target ? `<p class="muted">${esc(step.prompt_target)}</p>` : ""}
      <button id="stepContinue">Continue</button>
    </div>
  `;
  document.getElementById("stepContinue").onclick = () => advanceQuestStep(0);
}

function renderQuestStepSentence() {
  const aq = state.activeQuest;

  app.innerHTML = `
    <div class="card">
      <h2>${esc(aq.quest.title)}</h2>
      <p class="muted">${esc(aq.lesson.title)}${aq.lesson.hint ? " — " + esc(aq.lesson.hint) : ""}</p>

      <p class="muted">Your sentence:</p>
      <div class="sentence-builder" id="builderZone">
        ${aq.builder.map((w) => `<span class="word-chip in-builder" data-from="builder" data-key="${esc(w.key)}">${esc(w.word)}</span>`).join("")}
      </div>

      <p class="muted">Word bank:</p>
      <div class="word-bank" id="bankZone">
        ${aq.bank.map((w) => `<span class="word-chip" data-from="bank" data-key="${esc(w.key)}">${esc(w.word)}</span>`).join("")}
      </div>

      <div class="toolbar">
        <button id="checkSentence" ${aq.builder.length ? "" : "disabled"}>Check Sentence</button>
        <button id="clearSentence" class="secondary">Clear</button>
      </div>

      <div id="questFeedback"></div>
    </div>
  `;

  document.querySelectorAll('[data-from="bank"]').forEach((chip) => {
    chip.onclick = () => moveWord(chip.dataset.key, "bank", "builder");
  });
  document.querySelectorAll('[data-from="builder"]').forEach((chip) => {
    chip.onclick = () => moveWord(chip.dataset.key, "builder", "bank");
  });

  document.getElementById("checkSentence").onclick = checkSentence;
  document.getElementById("clearSentence").onclick = () => {
    aq.bank = shuffle([...aq.bank, ...aq.builder]);
    aq.builder = [];
    renderQuestStepSentence();
  };
}

function moveWord(key, from, to) {
  const aq = state.activeQuest;
  const source = from === "bank" ? aq.bank : aq.builder;
  const index = source.findIndex((w) => w.key === key);
  if (index === -1) return;
  const [word] = source.splice(index, 1);
  (to === "bank" ? aq.bank : aq.builder).push(word);
  renderQuestStepSentence();
}

async function checkSentence() {
  const aq = state.activeQuest;
  const builtText = aq.builder.map((w) => w.word).join(" ");
  const normalizedBuilt = normalizeSentence(builtText);
  const target = normalizeSentence((aq.lesson.target_sentence || []).join(" "));

  let outcome = "incorrect";
  let awardedXp = 0;

  if (normalizedBuilt === target) {
    outcome = "correct";
    awardedXp = aq.lesson.base_xp;
  } else if (aq.validSentences.includes(normalizedBuilt)) {
    outcome = "creative";
    awardedXp = aq.lesson.creativity_xp;
  }

  const feedback = document.getElementById("questFeedback");

  if (outcome === "incorrect") {
    feedback.innerHTML = `
      <div class="feedback incorrect">
        Not quite — try rearranging the words.
      </div>
      <div class="toolbar">
        <button id="suggestSentence" class="secondary">Send this to the admin for review</button>
      </div>
    `;
    const suggestBtn = document.getElementById("suggestSentence");
    if (suggestBtn) {
      suggestBtn.onclick = async () => {
        try {
          await sb.from("valid_sentences").insert({
            lesson_id: aq.lesson.id,
            tokens: aq.builder.map((w) => w.word),
            sentence_text: builtText,
            source: "player",
            is_approved: false,
          });
          suggestBtn.disabled = true;
          suggestBtn.textContent = "Sent — thank you!";
        } catch (error) {
          alert(error.message || String(error));
        }
      };
    }
    return;
  }

  feedback.innerHTML = `
    <div class="feedback ${outcome === "correct" ? "correct" : "creative"}">
      ${outcome === "correct" ? "Correct!" : "Not the exact target sentence, but it works — nice creativity!"}
      +${awardedXp} XP
    </div>
  `;

  try {
    await awardQuestCompletion(aq, awardedXp);
    document.getElementById("checkSentence").disabled = true;
    setTimeout(() => advanceQuestStep(awardedXp), 900);
  } catch (error) {
    renderError(error);
  }
}

async function awardQuestCompletion(aq, awardedXp) {
  const userId = state.session.user.id;

  const { data: existingProgress } = await sb
    .from("user_progress")
    .select("attempts,best_score")
    .eq("user_id", userId)
    .eq("lesson_id", aq.lesson.id)
    .maybeSingle();

  await sb.from("user_progress").upsert({
    user_id: userId,
    lesson_id: aq.lesson.id,
    completed: true,
    best_score: Math.max(existingProgress?.best_score || 0, awardedXp),
    attempts: (existingProgress?.attempts || 0) + 1,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,lesson_id" });

  await sb.from("profiles").update({
    xp: (state.profile.xp || 0) + awardedXp,
  }).eq("id", userId);
  state.profile.xp = (state.profile.xp || 0) + awardedXp;
  updateHud();

  const { data: existingQuestProgress } = await sb
    .from("user_quest_progress")
    .select("best_score,started_at")
    .eq("user_id", userId)
    .eq("quest_id", aq.quest.id)
    .maybeSingle();

  await sb.from("user_quest_progress").upsert({
    user_id: userId,
    quest_id: aq.quest.id,
    status: "completed",
    started_at: existingQuestProgress?.started_at || new Date().toISOString(),
    completed_at: new Date().toISOString(),
    best_score: Math.max(existingQuestProgress?.best_score || 0, awardedXp),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,quest_id" });

  await sb.from("calendar_events").insert({
    user_id: userId,
    life_date: state.timeState.life_date,
    event_type: "quest_completed",
    title: aq.quest.title,
    related_quest_id: aq.quest.id,
  });
}

async function advanceQuestStep() {
  const aq = state.activeQuest;
  aq.stepIndex += 1;

  if (aq.stepIndex < aq.steps.length) {
    await loadQuestStep();
    return;
  }

  state.activeQuest = null;
  await loadScene(state.currentNode.id);
}

// =========================================================
// CALENDAR / LIFE JOURNAL
// =========================================================

async function goToCalendarView() {
  state.view = "calendar";
  setActiveTab("calendar");

  try {
    app.innerHTML = `<div class="card"><p class="muted">Loading your journal...</p></div>`;

    const { data, error } = await sb
      .from("calendar_events")
      .select("*")
      .eq("user_id", state.session.user.id)
      .order("life_date", { ascending: true });

    if (error) throw error;

    app.innerHTML = `
      <div class="card">
        <h2>Life Journal</h2>
        ${(data || []).length ? (data || []).map((event) => `
          <div class="calendar-item">
            <div class="calendar-date">${esc(formatDate(event.life_date))}</div>
            <div>
              <strong>${esc(event.title)}</strong>
              <div class="muted">${esc(event.description || "")}</div>
            </div>
          </div>
        `).join("") : `<p class="muted">Nothing recorded yet — play through the story to fill this in.</p>`}
      </div>
    `;
  } catch (error) {
    renderError(error);
  }
}

// =========================================================
// ERRORS
// =========================================================

function renderError(error) {
  console.error(error);
  app.innerHTML = `
    <div class="card">
      <h2>Something went wrong</h2>
      <p class="error">${esc(error?.message || String(error))}</p>
      <button onclick="goToStoryView()">Back to Story</button>
    </div>
  `;
}

boot();
