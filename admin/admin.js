const SUPABASE_URL = "https://rmzmlehgsksvrlefyvqa.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mGaig4vsOn0UUYOXLLl-_g_MEKvIW8r";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const app = document.getElementById("app");
const conn = document.getElementById("connection");

const INVENTORY_TABLES = [
  ["languages", "Languages"],
  ["vocabulary", "Vocabulary"],
  ["word_forms", "Word Forms"],
  ["word_relations", "Word Relations"],
  ["grammar", "Grammar"],
  ["sentence_patterns", "Patterns"],
  ["lessons", "Lessons"],
  ["lesson_words", "Lesson Words"],
  ["lesson_grammar_intro", "Grammar Intro"],
  ["valid_sentences", "Valid Sentences"],
  ["collections", "Collections"],
  ["collection_items", "Collection Items"],
  ["gifts", "Gifts"],
  ["database_versions", "DB Versions"],
  ["sync_changes", "Sync Changes"],
];

const LIFE_WORLD_INVENTORY_TABLES = [
  ["destinations", "Destinations"],
  ["locations", "Locations"],
  ["npcs", "NPCs"],
  ["story_nodes", "Story Nodes"],
  ["story_choices", "Story Choices"],
  ["quests", "Quests"],
  ["quest_steps", "Quest Steps"],
  ["dialogue_lines", "Dialogue Lines"],
  ["cultural_calendar_events", "Cultural Calendar Events"],
];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[c]);
}

function jsonText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function versionString(major, minor) {
  return `${Number(major)}.${String(Number(minor)).padStart(2, "0")}`;
}

function setActiveNav(viewName) {
  document.querySelectorAll("nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
}

async function boot() {
  try {
    const { data: { session }, error } = await sb.auth.getSession();

    if (error) {
      login(error.message);
      return;
    }

    if (!session) {
      login();
      return;
    }

    const { data: profile, error: profileError } = await sb
      .from("profiles")
      .select("id,display_name,role")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profileError) {
      login(`Profile error: ${profileError.message}`);
      return;
    }

    if (!profile) {
      await sb.auth.signOut();
      login("Your account has no profile record.");
      return;
    }

    if (profile.role !== "admin") {
      await sb.auth.signOut();
      login(`This account does not have admin access. Current role: ${profile.role}`);
      return;
    }

    conn.textContent = `Connected as ${profile.display_name || "Admin"}`;
    dashboard();
  } catch (error) {
    console.error(error);
    login(error?.message || "Unexpected error.");
  }
}

function login(message = "") {
  conn.textContent = "Not connected";

  app.innerHTML = `
    <div class="login">
      <h2>SentenceQuest Admin</h2>
      ${message ? `<p class="error">${esc(message)}</p>` : ""}
      <input id="email" type="email" placeholder="Email" autocomplete="username">
      <input id="password" type="password" placeholder="Password" autocomplete="current-password">
      <button id="sign">Sign in</button>
    </div>
  `;

  document.getElementById("sign").onclick = async () => {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      alert("Enter email and password.");
      return;
    }

    const button = document.getElementById("sign");
    button.disabled = true;
    button.textContent = "Signing in...";

    const { error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
      button.disabled = false;
      button.textContent = "Sign in";
      alert(error.message);
      return;
    }

    await boot();
  };
}

async function count(table) {
  const { count: value, error } = await sb
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) throw error;
  return value || 0;
}

async function getInventory(includeVersionTables = true) {
  const tables = includeVersionTables
    ? INVENTORY_TABLES
    : INVENTORY_TABLES.filter(([name]) =>
        !["database_versions", "sync_changes"].includes(name)
      );

  const results = await Promise.all(
    tables.map(async ([table, label]) => ({
      table,
      label,
      count: await count(table),
    }))
  );

  return results;
}

async function getLifeWorldInventory() {
  const results = await Promise.all(
    LIFE_WORLD_INVENTORY_TABLES.map(async ([table, label]) => ({
      table,
      label,
      count: await count(table),
    }))
  );
  return results;
}

function inventoryHtml(rows) {
  return `
    <div class="grid">
      ${rows.map((row) => `
        <div class="stat">
          ${esc(row.label)}
          <b>${esc(row.count)}</b>
        </div>
      `).join("")}
    </div>
  `;
}

async function dashboard() {
  setActiveNav("dashboard");

  try {
    const [rows, lifeWorldRows] = await Promise.all([
      getInventory(true),
      getLifeWorldInventory(),
    ]);

    app.innerHTML = `
      <h2>Dashboard</h2>
      ${inventoryHtml(rows)}

      <div class="panel">
        <h3>SentenceQuest Content System</h3>
        <p>Dashboard shows the current database inventory only.</p>
        <p>Import adds or updates content without publishing it.</p>
        <p>Publish creates the next database version and sync changes.</p>
      </div>

      <h2>Life World</h2>
      ${inventoryHtml(lifeWorldRows)}

      <div class="panel">
        <h3>Life World Layer</h3>
        <p>Destinations, locations, NPCs and the branching story graph sit on top of your existing lessons.</p>
        <p>Quest steps and dialogue lines reuse lessons by slug — no separate learning engine.</p>
        <p>Import Quest Pack adds/updates this content as draft. Publishing this layer is a separate step (see MIGRATION_GUIDE.md).</p>
      </div>
    `;
  } catch (error) {
    showError(error);
  }
}

let lastImportResult = null;

async function importView() {
  setActiveNav("import");

  try {
    const rows = await getInventory(false);

    app.innerHTML = `
      <h2>Import Collection</h2>

      ${lastImportResult ? `
        <div class="panel">
          <strong class="success">Import successful.</strong>
          <p>Collection: ${esc(lastImportResult.collection)}</p>
          <p>Collection version: ${esc(lastImportResult.collection_version)}</p>
          <p>Status: ${lastImportResult.is_published ? "Published" : "Draft"}</p>
          <p>Database version changed: <strong>NO</strong></p>
        </div>
      ` : ""}

      <div class="panel">
        <h3>Current Database Inventory</h3>
        ${inventoryHtml(rows)}
      </div>

      <div class="panel">
        <h3>Import JSON Collection</h3>
        <input id="collectionFile" type="file" accept=".json,application/json">
        <div class="toolbar">
          <button id="importButton">Import Collection</button>
        </div>
        <div id="importStatus" class="status"></div>
      </div>
    `;

    document.getElementById("importButton").onclick = importCollection;
    lastImportResult = null;
  } catch (error) {
    showError(error);
  }
}

async function importCollection() {
  const input = document.getElementById("collectionFile");
  const button = document.getElementById("importButton");
  const status = document.getElementById("importStatus");

  if (!input?.files?.length) {
    status.innerHTML = `<strong class="error">Select a JSON file first.</strong>`;
    return;
  }

  try {
    button.disabled = true;
    button.textContent = "Importing...";
    status.textContent = "Reading collection...";

    const text = await input.files[0].text();
    const collection = JSON.parse(text);

    if (collection?.format !== "sentencequest.collection") {
      throw new Error("Invalid collection format.");
    }

    if (!collection?.language?.code || !collection?.language?.name) {
      throw new Error("Missing language.code or language.name.");
    }

    if (!collection?.collection?.slug || !collection?.collection?.name) {
      throw new Error("Missing collection.slug or collection.name.");
    }

    status.textContent = "Sending collection to Supabase...";

    const { data, error } = await sb.functions.invoke("import-collection", {
      body: collection,
    });

    if (error) throw new Error(error.message || "Import function failed.");
    if (!data?.success) throw new Error(data?.error || "Collection import failed.");

    lastImportResult = data;

    await importView();
  } catch (error) {
    console.error("IMPORT ERROR:", error);
    status.innerHTML = `
      <strong class="error">Import failed</strong>
      <br><br>${esc(error.message || String(error))}
    `;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Import Collection";
    }
  }
}

let lastQuestPackResult = null;

async function importQuestPackView() {
  setActiveNav("import-quest-pack");

  try {
    const rows = await getLifeWorldInventory();

    app.innerHTML = `
      <h2>Import Quest Pack</h2>

      ${lastQuestPackResult ? `
        <div class="panel">
          <strong class="success">Import successful.</strong>
          <p>Destination: ${esc(lastQuestPackResult.destination)}</p>
          <p>Locations: ${esc(lastQuestPackResult.locations_count)}</p>
          <p>NPCs: ${esc(lastQuestPackResult.npcs_count)}</p>
          <p>Story nodes: ${esc(lastQuestPackResult.story_nodes_count)}</p>
          <p>Story choices: ${esc(lastQuestPackResult.story_choices_count)}</p>
          <p>Quests: ${esc(lastQuestPackResult.quests_count)}</p>
          <p>Quest steps: ${esc(lastQuestPackResult.quest_steps_count)}</p>
          <p>Dialogue lines: ${esc(lastQuestPackResult.dialogue_lines_count)}</p>
          <p>Cultural calendar events: ${esc(lastQuestPackResult.cultural_calendar_events_count)}</p>
          <p class="muted">${esc(lastQuestPackResult.note || "")}</p>
        </div>
      ` : ""}

      <div class="panel">
        <h3>Current Life World Inventory</h3>
        ${inventoryHtml(rows)}
      </div>

      <div class="panel">
        <h3>Import JSON Quest Pack</h3>
        <p class="muted">
          Quest steps and dialogue lines reference existing lessons by
          <code>lesson_slug</code>. Import that collection first.
        </p>
        <input id="questPackFile" type="file" accept=".json,application/json">
        <div class="toolbar">
          <button id="importQuestPackButton">Import Quest Pack</button>
        </div>
        <div id="questPackStatus" class="status"></div>
      </div>
    `;

    document.getElementById("importQuestPackButton").onclick = importQuestPack;
    lastQuestPackResult = null;
  } catch (error) {
    showError(error);
  }
}

async function importQuestPack() {
  const input = document.getElementById("questPackFile");
  const button = document.getElementById("importQuestPackButton");
  const status = document.getElementById("questPackStatus");

  if (!input?.files?.length) {
    status.innerHTML = `<strong class="error">Select a JSON file first.</strong>`;
    return;
  }

  try {
    button.disabled = true;
    button.textContent = "Importing...";
    status.textContent = "Reading quest pack...";

    const text = await input.files[0].text();
    const pack = JSON.parse(text);

    if (pack?.format !== "sentencequest.questpack") {
      throw new Error("Invalid quest pack format.");
    }

    if (!pack?.destination?.code || !pack?.destination?.name) {
      throw new Error("Missing destination.code or destination.name.");
    }

    status.textContent = "Sending quest pack to Supabase...";

    const { data, error } = await sb.functions.invoke("import-quest-pack", {
      body: pack,
    });

    if (error) throw new Error(error.message || "Import function failed.");
    if (!data?.success) throw new Error(data?.error || "Quest pack import failed.");

    lastQuestPackResult = data;

    await importQuestPackView();
  } catch (error) {
    console.error("IMPORT QUEST PACK ERROR:", error);
    status.innerHTML = `
      <strong class="error">Import failed</strong>
      <br><br>${esc(error.message || String(error))}
    `;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Import Quest Pack";
    }
  }
}

// =========================================================
// STORY GRAPH EDITOR (visual node/edge authoring for story_nodes
// and story_choices). No external libraries — plain DOM + drag.
// =========================================================

const graphState = {
  destinationId: null,
  destinations: [],
  locations: [],
  npcs: [],
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  linkMode: false,
  linkFromId: null,
};

async function storyGraphView() {
  setActiveNav("story-graph");

  try {
    const { data: destinations, error } = await sb
      .from("destinations")
      .select("id,code,name")
      .order("name", { ascending: true });

    if (error) throw error;
    graphState.destinations = destinations || [];

    if (
      graphState.destinationId &&
      !graphState.destinations.some((d) => d.id === graphState.destinationId)
    ) {
      graphState.destinationId = null;
    }
    if (!graphState.destinationId && graphState.destinations.length) {
      graphState.destinationId = graphState.destinations[0].id;
    }

    renderGraphShell();

    if (graphState.destinationId) {
      await loadGraphData(graphState.destinationId);
    }
  } catch (error) {
    showError(error);
  }
}

function quickCreateDestinationHtml() {
  return `
    <form id="quickDestinationForm" class="form-grid">
      <div class="field">
        <label>Code</label>
        <input id="qdCode" placeholder="US" required>
      </div>
      <div class="field">
        <label>Name</label>
        <input id="qdName" placeholder="United States" required>
      </div>
      <button type="submit">Create Destination</button>
    </form>
  `;
}

async function quickCreateDestination() {
  const code = document.getElementById("qdCode").value.trim();
  const name = document.getElementById("qdName").value.trim();
  if (!code || !name) return;

  try {
    const { error } = await sb.from("destinations").insert({ code, name });
    if (error) throw error;
    await storyGraphView();
  } catch (error) {
    alert(error.message || String(error));
  }
}

function renderGraphShell() {
  app.innerHTML = `
    <h2>Story Graph</h2>
    <div class="graph-toolbar">
      <select id="graphDestination">
        <option value="">Select destination...</option>
        ${graphState.destinations.map((d) => `
          <option value="${esc(d.id)}" ${d.id === graphState.destinationId ? "selected" : ""}>
            ${esc(d.name)} (${esc(d.code)})
          </option>
        `).join("")}
      </select>
      <button id="graphAddNode" ${graphState.destinationId ? "" : "disabled"}>+ Add Node</button>
      <button id="graphLinkMode" ${graphState.destinationId ? "" : "disabled"}>
        ${graphState.linkMode ? "Cancel Linking" : "Connect Nodes"}
      </button>
      <button id="graphRefresh" ${graphState.destinationId ? "" : "disabled"}>Refresh</button>
      ${graphState.linkMode ? `<span class="muted">Click a source node, then a target node.</span>` : ""}
    </div>

    ${!graphState.destinations.length ? `
      <div class="panel">
        <p class="muted">No destinations yet. Import a quest pack first, or create one here.</p>
        ${quickCreateDestinationHtml()}
      </div>
    ` : ""}

    <div class="graph-layout">
      <div id="graphCanvasWrap" class="graph-canvas-wrap">
        <div id="graphCanvas" class="graph-canvas"></div>
      </div>
      <div id="graphInspector" class="graph-inspector">
        <p class="muted">Select a node or edge, or click "+ Add Node".</p>
      </div>
    </div>
  `;

  const destinationSelect = document.getElementById("graphDestination");
  if (destinationSelect) {
    destinationSelect.onchange = async (e) => {
      graphState.destinationId = e.target.value || null;
      graphState.selectedNodeId = null;
      graphState.selectedEdgeId = null;
      graphState.linkMode = false;
      graphState.linkFromId = null;
      if (graphState.destinationId) {
        renderGraphShell();
        await loadGraphData(graphState.destinationId);
      } else {
        renderGraphShell();
      }
    };
  }

  const addBtn = document.getElementById("graphAddNode");
  if (addBtn) addBtn.onclick = () => showNodeForm(null);

  const linkBtn = document.getElementById("graphLinkMode");
  if (linkBtn) {
    linkBtn.onclick = () => {
      graphState.linkMode = !graphState.linkMode;
      graphState.linkFromId = null;
      renderGraphShell();
      if (graphState.destinationId) renderGraph();
    };
  }

  const refreshBtn = document.getElementById("graphRefresh");
  if (refreshBtn) refreshBtn.onclick = () => loadGraphData(graphState.destinationId);

  const quickForm = document.getElementById("quickDestinationForm");
  if (quickForm) {
    quickForm.onsubmit = async (e) => {
      e.preventDefault();
      await quickCreateDestination();
    };
  }
}

async function loadGraphData(destinationId) {
  try {
    const [{ data: nodes, error: nodesError },
      { data: locations, error: locError },
      { data: npcs, error: npcError }] = await Promise.all([
      sb.from("story_nodes").select("*").eq("destination_id", destinationId),
      sb.from("locations").select("id,code,name").eq("destination_id", destinationId),
      sb.from("npcs").select("id,code,name").eq("destination_id", destinationId),
    ]);

    if (nodesError) throw nodesError;
    if (locError) throw locError;
    if (npcError) throw npcError;

    graphState.nodes = nodes || [];
    graphState.locations = locations || [];
    graphState.npcs = npcs || [];

    const nodeIds = graphState.nodes.map((n) => n.id);
    let edges = [];
    if (nodeIds.length) {
      const { data, error } = await sb
        .from("story_choices")
        .select("*")
        .in("from_node_id", nodeIds);
      if (error) throw error;
      edges = data || [];
    }
    graphState.edges = edges;

    renderGraph();
  } catch (error) {
    showError(error);
  }
}

function nodePosition(node, index) {
  if (typeof node.editor_x === "number" && typeof node.editor_y === "number") {
    return { x: node.editor_x, y: node.editor_y };
  }
  const day = Number(node.day_number ?? 0);
  return { x: day * 260 + 40, y: index * 160 + 40 };
}

function clearInspector() {
  const inspector = document.getElementById("graphInspector");
  if (inspector) {
    inspector.innerHTML = `<p class="muted">Select a node or edge, or click "+ Add Node".</p>`;
  }
}

function renderGraph() {
  const canvas = document.getElementById("graphCanvas");
  if (!canvas) return;

  canvas.innerHTML = "";

  const positions = new Map();
  graphState.nodes.forEach((node, index) => {
    positions.set(node.id, nodePosition(node, index));
  });

  let maxX = 600;
  let maxY = 400;
  positions.forEach((p) => {
    maxX = Math.max(maxX, p.x + 260);
    maxY = Math.max(maxY, p.y + 160);
  });
  canvas.style.width = maxX + "px";
  canvas.style.height = maxY + "px";

  // edges (drawn first, behind nodes)
  graphState.edges.forEach((edge) => {
    const from = positions.get(edge.from_node_id);
    const to = positions.get(edge.to_node_id);
    if (!from || !to) return;

    const x1 = from.x + 100;
    const y1 = from.y + 40;
    const x2 = to.x + 100;
    const y2 = to.y + 40;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

    const edgeEl = document.createElement("div");
    edgeEl.className = "graph-edge" + (edge.id === graphState.selectedEdgeId ? " selected" : "");
    edgeEl.style.left = x1 + "px";
    edgeEl.style.top = y1 + "px";
    edgeEl.style.width = length + "px";
    edgeEl.style.transform = `rotate(${angle}deg)`;

    edgeEl.innerHTML = `
      <div class="edge-line"></div>
      <div class="edge-arrow">&#9656;</div>
      <div class="edge-label" style="transform: translate(-50%,-50%) rotate(${-angle}deg)">
        ${esc(edge.choice_text || "(no text)")}
      </div>
    `;

    edgeEl.onclick = (e) => {
      e.stopPropagation();
      graphState.selectedNodeId = null;
      graphState.selectedEdgeId = edge.id;
      renderGraph();
      showEdgeInspector(edge);
    };

    canvas.appendChild(edgeEl);
  });

  // nodes
  graphState.nodes.forEach((node) => {
    const pos = positions.get(node.id);
    const nodeEl = document.createElement("div");
    nodeEl.className = "graph-node"
      + (node.id === graphState.selectedNodeId ? " selected" : "")
      + (graphState.linkMode && graphState.linkFromId === node.id ? " link-source" : "")
      + (!node.is_published ? " draft" : "");
    nodeEl.style.left = pos.x + "px";
    nodeEl.style.top = pos.y + "px";
    nodeEl.dataset.dragged = "0";

    const location = graphState.locations.find((l) => l.id === node.location_id);
    const npc = graphState.npcs.find((n) => n.id === node.npc_id);

    nodeEl.innerHTML = `
      <div class="node-header">${esc(node.title)}</div>
      <div class="node-meta">
        ${node.day_number != null ? `Day ${esc(node.day_number)}` : "No day set"}
        ${node.time_of_day ? " · " + esc(node.time_of_day) : ""}
      </div>
      <div class="node-meta">${esc(node.node_type)}${location ? " · " + esc(location.name) : ""}</div>
      ${npc ? `<div class="node-meta">${esc(npc.name)}</div>` : ""}
      ${node.is_start ? `<span class="badge">start</span>` : ""}
      ${!node.is_published ? `<span class="badge warning">draft</span>` : ""}
    `;

    nodeEl.onmousedown = (e) => startNodeDrag(e, node, nodeEl);

    nodeEl.onclick = (e) => {
      if (nodeEl.dataset.dragged === "1") {
        nodeEl.dataset.dragged = "0";
        return;
      }
      e.stopPropagation();
      if (graphState.linkMode) {
        handleLinkClick(node.id);
        return;
      }
      graphState.selectedEdgeId = null;
      graphState.selectedNodeId = node.id;
      renderGraph();
      showNodeForm(node);
    };

    canvas.appendChild(nodeEl);
  });

  canvas.onclick = () => {
    graphState.selectedNodeId = null;
    graphState.selectedEdgeId = null;
    clearInspector();
  };
}

function startNodeDrag(e, node, nodeEl) {
  if (graphState.linkMode) return;
  e.preventDefault();

  const startX = e.clientX;
  const startY = e.clientY;
  const originLeft = parseFloat(nodeEl.style.left) || 0;
  const originTop = parseFloat(nodeEl.style.top) || 0;
  let moved = false;

  function onMove(ev) {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    nodeEl.style.left = Math.max(0, originLeft + dx) + "px";
    nodeEl.style.top = Math.max(0, originTop + dy) + "px";
  }

  async function onUp() {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);

    if (moved) {
      nodeEl.dataset.dragged = "1";
      const left = parseFloat(nodeEl.style.left) || 0;
      const top = parseFloat(nodeEl.style.top) || 0;
      node.editor_x = left;
      node.editor_y = top;
      try {
        await sb.from("story_nodes")
          .update({ editor_x: left, editor_y: top })
          .eq("id", node.id);
      } catch (error) {
        console.error("Failed to save node position:", error);
      }
      renderGraph();
    }
  }

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function handleLinkClick(nodeId) {
  if (!graphState.linkFromId) {
    graphState.linkFromId = nodeId;
    renderGraph();
    return;
  }
  if (graphState.linkFromId === nodeId) {
    graphState.linkFromId = null;
    renderGraph();
    return;
  }
  showEdgeCreateForm(graphState.linkFromId, nodeId);
}

function showEdgeCreateForm(fromId, toId) {
  const fromNode = graphState.nodes.find((n) => n.id === fromId);
  const toNode = graphState.nodes.find((n) => n.id === toId);
  const inspector = document.getElementById("graphInspector");

  inspector.innerHTML = `
    <h3>New Connection</h3>
    <p class="muted">${esc(fromNode?.title || "?")} &rarr; ${esc(toNode?.title || "?")}</p>
    <form id="edgeCreateForm" class="form-stack">
      <label>Choice text</label>
      <textarea id="ecText" placeholder="Book the flight and head to the airport." required></textarea>
      <label>Requires preference key (optional)</label>
      <input id="ecPrefKey" placeholder="social_style">
      <label>Requires preference value (optional)</label>
      <input id="ecPrefValue" placeholder="outgoing">
      <div class="toolbar">
        <button type="submit">Create Connection</button>
        <button type="button" id="edgeCreateCancel">Cancel</button>
      </div>
    </form>
  `;

  document.getElementById("edgeCreateForm").onsubmit = async (e) => {
    e.preventDefault();
    const choice_text = document.getElementById("ecText").value.trim();
    const requires_preference_key = document.getElementById("ecPrefKey").value.trim() || null;
    const requires_preference_value = document.getElementById("ecPrefValue").value.trim() || null;

    try {
      const { error } = await sb.from("story_choices").upsert({
        from_node_id: fromId,
        to_node_id: toId,
        choice_text,
        requires_preference_key,
        requires_preference_value,
      }, { onConflict: "from_node_id,to_node_id" });
      if (error) throw error;

      graphState.linkFromId = null;
      await loadGraphData(graphState.destinationId);
      clearInspector();
    } catch (error) {
      alert(error.message || String(error));
    }
  };

  document.getElementById("edgeCreateCancel").onclick = () => {
    graphState.linkFromId = null;
    renderGraph();
    clearInspector();
  };
}

function showEdgeInspector(edge) {
  const fromNode = graphState.nodes.find((n) => n.id === edge.from_node_id);
  const toNode = graphState.nodes.find((n) => n.id === edge.to_node_id);
  const inspector = document.getElementById("graphInspector");

  inspector.innerHTML = `
    <h3>Connection</h3>
    <p class="muted">${esc(fromNode?.title || "?")} &rarr; ${esc(toNode?.title || "?")}</p>
    <form id="edgeEditForm" class="form-stack">
      <label>Choice text</label>
      <textarea id="eeText" required>${esc(edge.choice_text || "")}</textarea>
      <label>Requires preference key (optional)</label>
      <input id="eePrefKey" value="${esc(edge.requires_preference_key || "")}">
      <label>Requires preference value (optional)</label>
      <input id="eePrefValue" value="${esc(edge.requires_preference_value || "")}">
      <div class="toolbar">
        <button type="submit">Save</button>
        <button type="button" id="edgeDelete" class="danger">Delete Connection</button>
      </div>
    </form>
  `;

  document.getElementById("edgeEditForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const { error } = await sb.from("story_choices").update({
        choice_text: document.getElementById("eeText").value.trim(),
        requires_preference_key: document.getElementById("eePrefKey").value.trim() || null,
        requires_preference_value: document.getElementById("eePrefValue").value.trim() || null,
      }).eq("id", edge.id);
      if (error) throw error;
      await loadGraphData(graphState.destinationId);
    } catch (error) {
      alert(error.message || String(error));
    }
  };

  document.getElementById("edgeDelete").onclick = async () => {
    if (!confirm("Delete this connection?")) return;
    try {
      const { error } = await sb.from("story_choices").delete().eq("id", edge.id);
      if (error) throw error;
      graphState.selectedEdgeId = null;
      await loadGraphData(graphState.destinationId);
      clearInspector();
    } catch (error) {
      alert(error.message || String(error));
    }
  };
}

function showNodeForm(node) {
  const inspector = document.getElementById("graphInspector");
  const isNew = !node;

  const locationsOptions = graphState.locations.map((l) =>
    `<option value="${esc(l.id)}" ${node?.location_id === l.id ? "selected" : ""}>${esc(l.name)}</option>`
  ).join("");
  const npcOptions = graphState.npcs.map((n) =>
    `<option value="${esc(n.id)}" ${node?.npc_id === n.id ? "selected" : ""}>${esc(n.name)}</option>`
  ).join("");

  inspector.innerHTML = `
    <h3>${isNew ? "New Story Node" : "Edit Node"}</h3>
    <form id="nodeForm" class="form-stack">
      <label>Code (unique, no spaces)</label>
      <input id="nfCode" value="${esc(node?.code || "")}" ${isNew ? "" : "readonly"} required>

      <label>Title</label>
      <input id="nfTitle" value="${esc(node?.title || "")}" required>

      <label>Node type</label>
      <select id="nfType">
        ${["quest", "dialogue", "choice", "cutscene", "free_life"].map((t) =>
          `<option value="${t}" ${node?.node_type === t ? "selected" : ""}>${t}</option>`
        ).join("")}
      </select>

      <label>Location</label>
      <select id="nfLocation">
        <option value="">(none)</option>
        ${locationsOptions}
      </select>

      <label>NPC</label>
      <select id="nfNpc">
        <option value="">(none)</option>
        ${npcOptions}
      </select>

      <label>Day number</label>
      <input id="nfDay" type="number" min="1" value="${node?.day_number ?? ""}">

      <label>Time of day</label>
      <select id="nfTime">
        <option value="">(any)</option>
        ${["morning", "afternoon", "evening", "night"].map((t) =>
          `<option value="${t}" ${node?.time_of_day === t ? "selected" : ""}>${t}</option>`
        ).join("")}
      </select>

      <label>Description</label>
      <textarea id="nfDescription">${esc(node?.description || "")}</textarea>

      <label><input id="nfStart" type="checkbox" ${node?.is_start ? "checked" : ""}> Is start node</label>
      <label><input id="nfPublished" type="checkbox" ${node?.is_published ? "checked" : ""}> Published (visible to players)</label>

      <div class="toolbar">
        <button type="submit">${isNew ? "Create Node" : "Save Node"}</button>
        ${!isNew ? `<button type="button" id="nodeDelete" class="danger">Delete Node</button>` : ""}
      </div>
    </form>

    ${!isNew ? `
      <div class="toolbar">
        <button type="button" id="viewNodeQuests">View Quests Here</button>
        <button type="button" id="viewNodeDialogue">View Dialogue Here</button>
      </div>
    ` : ""}
  `;

  document.getElementById("nodeForm").onsubmit = async (e) => {
    e.preventDefault();

    const payload = {
      destination_id: graphState.destinationId,
      code: document.getElementById("nfCode").value.trim(),
      title: document.getElementById("nfTitle").value.trim(),
      node_type: document.getElementById("nfType").value,
      location_id: document.getElementById("nfLocation").value || null,
      npc_id: document.getElementById("nfNpc").value || null,
      day_number: document.getElementById("nfDay").value
        ? Number(document.getElementById("nfDay").value) : null,
      time_of_day: document.getElementById("nfTime").value || null,
      description: document.getElementById("nfDescription").value.trim() || null,
      is_start: document.getElementById("nfStart").checked,
      is_published: document.getElementById("nfPublished").checked,
    };

    try {
      if (isNew) {
        const { error } = await sb.from("story_nodes").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await sb.from("story_nodes").update(payload).eq("id", node.id);
        if (error) throw error;
      }
      await loadGraphData(graphState.destinationId);
      clearInspector();
    } catch (error) {
      alert(error.message || String(error));
    }
  };

  const deleteBtn = document.getElementById("nodeDelete");
  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      if (!confirm("Delete this node? Connections to/from it will also be removed.")) return;
      try {
        const { error } = await sb.from("story_nodes").delete().eq("id", node.id);
        if (error) throw error;
        graphState.selectedNodeId = null;
        await loadGraphData(graphState.destinationId);
        clearInspector();
      } catch (error) {
        alert(error.message || String(error));
      }
    };
  }

  const viewQuestsBtn = document.getElementById("viewNodeQuests");
  if (viewQuestsBtn) {
    viewQuestsBtn.onclick = () => tableView(
      "quests",
      `Quests at "${node.title}"`,
      ["code", "title", "level", "xp_reward", "is_published"],
      { column: "story_node_id", value: node.id }
    );
  }

  const viewDialogueBtn = document.getElementById("viewNodeDialogue");
  if (viewDialogueBtn) {
    viewDialogueBtn.onclick = () => tableView(
      "dialogue_lines",
      `Dialogue at "${node.title}"`,
      ["speaker_type", "line_order", "target_text", "native_translation"],
      { column: "story_node_id", value: node.id }
    );
  }
}

async function tableView(table, title, columns, filter = null) {
  try {
    app.innerHTML = `<h2>${esc(title)}</h2><div class="status">Loading...</div>`;

    let query = sb.from(table).select(columns.join(",")).limit(100);
    if (filter) query = query.eq(filter.column, filter.value);

    const { data, error } = await query;

    if (error) throw error;

    app.innerHTML = `
      <h2>${esc(title)}</h2>
      <div class="toolbar">
        <button id="tableRefresh">Refresh</button>
        ${filter ? `<button id="tableBackToGraph">Back to Story Graph</button>` : ""}
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
          <tbody>
            ${(data || []).map((row) => `
              <tr>
                ${columns.map((column) => `<td>${esc(jsonText(row[column]))}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById("tableRefresh").onclick =
      () => tableView(table, title, columns, filter);

    const backButton = document.getElementById("tableBackToGraph");
    if (backButton) backButton.onclick = () => storyGraphView();
  } catch (error) {
    showError(error);
  }
}

async function grammarIntro() {
  try {
    app.innerHTML = `<h2>Grammar Intro</h2><div class="status">Loading...</div>`;

    const { data, error } = await sb
      .from("lesson_grammar_intro")
      .select(`
        id,lesson_id,title,short_text,detailed_text,
        image_url,audio_url,video_url,
        audio_duration_seconds,video_duration_seconds,
        sort_order,is_active,version,created_at,updated_at
      `)
      .order("lesson_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .limit(100);

    if (error) throw error;

    app.innerHTML = `
      <h2>Grammar Intro</h2>
      <div class="card-grid">
        ${(data || []).map((item) => `
          <div class="panel">
            <h3>${esc(item.title)}</h3>
            <p>${esc(item.short_text)}</p>
            ${item.detailed_text ? `<p>${esc(item.detailed_text)}</p>` : ""}
            ${item.image_url ? `<img class="preview" src="${esc(item.image_url)}">` : ""}
            ${item.audio_url ? `<audio controls src="${esc(item.audio_url)}"></audio>` : ""}
            ${item.video_url ? `<video controls src="${esc(item.video_url)}"></video>` : ""}
          </div>
        `).join("")}
      </div>
    `;
  } catch (error) {
    showError(error);
  }
}

async function databaseVersion() {
  setActiveNav("database-version");

  try {
    const { data, error } = await sb
      .from("database_versions")
      .select(`
        id,version,major_version,minor_version,display_version,
        release_name,checksum,notes,created_at,is_current,
        published_at,published_by
      `)
      .order("version", { ascending: false })
      .limit(50);

    if (error) throw error;

    app.innerHTML = `
      <h2>Database Version</h2>
      <div class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Version</th><th>Release</th><th>Current</th>
                <th>Notes</th><th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${(data || []).map((row) => `
                <tr>
                  <td>${esc(row.display_version || versionString(row.major_version, row.minor_version))}</td>
                  <td>${esc(row.release_name)}</td>
                  <td>${row.is_current ? "YES" : "NO"}</td>
                  <td>${esc(row.notes)}</td>
                  <td>${esc(row.created_at)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (error) {
    showError(error);
  }
}

async function appVersion() {
  setActiveNav("version");

  try {
    const { data, error } = await sb
      .from("app_release")
      .select(`
        id,major_version,minor_version,app_version,
        minimum_supported_version,release_notes,updated_at
      `)
      .eq("id", true)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      app.innerHTML = `
        <h2>App Version</h2>
        <div class="panel"><p class="error">App release record not found.</p></div>
      `;
      return;
    }

    app.innerHTML = `
      <h2>App Version</h2>
      <div class="panel">
        <h3>Current version</h3>
        <div class="version">${esc(data.app_version)}</div>
        <p>Major version: <strong>${esc(data.major_version)}</strong></p>
        <p>Minor version: <strong>${esc(data.minor_version)}</strong></p>
        <p>Minimum supported version: ${esc(data.minimum_supported_version)}</p>
        <p>${esc(data.release_notes)}</p>
      </div>

      <div class="panel">
        <h3>Version policy</h3>
        <p>Content/database update: 1.07 → 1.08</p>
        <p>Major structural update: 1.99 → 2.00</p>
        <p>App version and database version are independent.</p>
        <p>Major app version changes are manual.</p>
      </div>
    `;
  } catch (error) {
    showError(error);
  }
}

async function getDatabaseRelease() {
  const { data, error } = await sb
    .from("database_release")
    .select(`
      id,major_version,minor_version,database_version,
      release_name,notes,checksum,published_at,published_by
    `)
    .eq("id", true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function publishView() {
  setActiveNav("publish");

  try {
    const [{ data: collections, error: collectionError }, release] =
      await Promise.all([
        sb.from("collections").select(`
          id,name,slug,version,is_published,updated_at
        `).order("updated_at", { ascending: false }),
        getDatabaseRelease(),
      ]);

    if (collectionError) throw collectionError;

    const currentVersion = release
      ? (release.database_version ||
        versionString(release.major_version, release.minor_version))
      : "—";

    app.innerHTML = `
      <h2>Publish / Sync</h2>

      <div class="panel">
        <h3>Current Database</h3>
        <p>Database Version: <strong>${esc(currentVersion)}</strong></p>
        <p>Release: ${esc(release?.release_name || "Initial Database")}</p>
        <p class="muted">Import does not change this version. Publish creates the next version.</p>
      </div>

      <div class="panel">
        <div class="toolbar">
          <button id="refreshPublish">Refresh</button>
          <button id="syncDatabase">Sync Check</button>
        </div>
        <div id="syncStatus" class="status"></div>
      </div>

      <div class="panel">
        <h3>Collections</h3>
        ${(collections || []).length ? collections.map((collection) => `
          <div class="panel">
            <h3>${esc(collection.name)}</h3>
            <p>Slug: ${esc(collection.slug)}</p>
            <p>Collection version: ${esc(collection.version)}</p>
            <p>
              Status:
              <strong>${collection.is_published ? "Published" : "Draft"}</strong>
            </p>
            <button
              data-publish-id="${esc(collection.id)}"
              data-published="${collection.is_published ? "true" : "false"}"
            >
              ${collection.is_published ? "Republish" : "Publish"}
            </button>
          </div>
        `).join("") : `<p class="muted">No collections imported yet.</p>`}
      </div>

      <div id="publishStatus" class="status"></div>
    `;

    document.querySelectorAll("[data-publish-id]").forEach((button) => {
      button.onclick = () => publishCollection(button.dataset.publishId);
    });

    document.getElementById("refreshPublish").onclick = publishView;
    document.getElementById("syncDatabase").onclick = syncDatabase;
  } catch (error) {
    showError(error);
  }
}

async function publishCollection(collectionId) {
  const status = document.getElementById("publishStatus");

  if (!confirm("Publish this collection? This will create the next database version.")) {
    return;
  }

  try {
    status.textContent = "Publishing...";

    const { data, error } = await sb.functions.invoke("publish-collection", {
      body: { collection_id: collectionId },
    });

    if (error) throw new Error(error.message || "Publish function failed.");
    if (!data?.success) throw new Error(data?.error || "Publish failed.");

    status.innerHTML = `
      <strong class="success">Published successfully.</strong>
      <br><br>
      Database version: ${esc(data.database_version)}
      <br>
      Collection version: ${esc(data.collection_version)}
      <br>
      Published lessons: ${esc(data.published_lessons)}
      <br>
      Sync changes: ${esc(data.sync_changes)}
    `;

    await publishView();
  } catch (error) {
    console.error("PUBLISH ERROR:", error);
    status.innerHTML = `
      <strong class="error">Publish failed</strong>
      <br><br>${esc(error.message || String(error))}
    `;
  }
}

async function syncDatabase() {
  const status = document.getElementById("syncStatus");

  try {
    status.textContent = "Checking synchronization system...";

    // 0.00 is intentionally used here as a diagnostic baseline.
    // This checks that the endpoint can read the current release and return changes.
    const { data, error } = await sb.functions.invoke("sync-database", {
      body: { database_version: "0.00" },
    });

    if (error) throw new Error(error.message || "Sync check failed.");
    if (!data?.success) throw new Error(data?.error || "Sync check failed.");

    status.innerHTML = `
      <strong class="success">Sync system is working.</strong>
      <br><br>
      Current database version: ${esc(data.database_version)}
      <br>
      Changes returned from 0.00: ${esc(data.changes?.length || 0)}
      <br>
      No database data was changed by this check.
    `;
  } catch (error) {
    console.error("SYNC CHECK ERROR:", error);
    status.innerHTML = `
      <strong class="error">Sync check failed</strong>
      <br><br>${esc(error.message || String(error))}
    `;
  }
}
async function worldPublishView() {
  setActiveNav("world-publish");

  try {
    const [
      { data: destinations, error: destinationError },
      release
    ] = await Promise.all([
      sb
        .from("destinations")
        .select("id,code,name,is_active")
        .order("name", { ascending: true }),

      getDatabaseRelease(),
    ]);

    if (destinationError) {
      throw destinationError;
    }

    const currentVersion =
      release
        ? (
            release.database_version ||
            versionString(
              release.major_version,
              release.minor_version
            )
          )
        : "—";

    app.innerHTML = `
      <h2>Publish World</h2>

      <div class="panel">
        <h3>Current Database</h3>

        <p>
          Database Version:
          <strong>
            ${esc(currentVersion)}
          </strong>
        </p>

        <p>
          Current Release:
          <strong>
            ${esc(
              release?.release_name ||
              "Initial Database"
            )}
          </strong>
        </p>

        <p class="muted">
          Publishing a World creates a new database version
          and adds the published World data to the sync system.
        </p>
      </div>

      <div class="panel">
        <h3>Select Destination</h3>

        ${
          (destinations || []).length
            ? `
              <div class="form-stack">

                <select id="worldPublishDestination">
                  <option value="">
                    Select destination...
                  </option>

                  ${destinations
                    .filter(
                      (destination) =>
                        destination.is_active
                    )
                    .map(
                      (destination) => `
                        <option value="${esc(
                          destination.id
                        )}">
                          ${esc(
                            destination.name
                          )}
                          (${esc(
                            destination.code
                          )})
                        </option>
                      `
                    )
                    .join("")}
                </select>

                <button
                  id="publishWorldButton"
                  disabled
                >
                  Validate & Publish World
                </button>

              </div>
            `
            : `
              <p class="muted">
                No destinations found.
                Import a Quest Pack first.
              </p>
            `
        }

        <div
          id="worldPublishStatus"
          class="status"
        ></div>
      </div>
    `;

    const select =
      document.getElementById(
        "worldPublishDestination"
      );

    const button =
      document.getElementById(
        "publishWorldButton"
      );

    if (select && button) {
      select.onchange = () => {
        button.disabled =
          !select.value;
      };

      button.onclick =
        () =>
          publishWorld(
            select.value
          );
    }
  } catch (error) {
    showError(error);
  }
}

async function publishWorld(
  destinationId
) {
  const status =
    document.getElementById(
      "worldPublishStatus"
    );

  const button =
    document.getElementById(
      "publishWorldButton"
    );

  if (!destinationId) {
    return;
  }

  if (
    !confirm(
      "Publish this World? This will create a new database version."
    )
  ) {
    return;
  }

  try {
    if (button) {
      button.disabled = true;
      button.textContent =
        "Validating...";
    }

    status.textContent =
      "Validating Story Graph, Quests and Dialogue...";

    const {
      data,
      error
    } = await sb.functions.invoke(
      "publish-world",
      {
        body: {
          destination_id:
            destinationId,
        },
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "World publish function failed."
      );
    }

    if (!data?.success) {
      let message =
        data?.error ||
        "World publish failed.";

      if (
        data?.validation?.errors?.length
      ) {
        message +=
          "\n\nValidation errors:\n" +
          data.validation.errors
            .map(
              (item) =>
                "• " + item
            )
            .join("\n");
      }

      throw new Error(
        message
      );
    }

    status.innerHTML = `
      <strong class="success">
        World published successfully.
      </strong>

      <br><br>

      Database version:
      <strong>
        ${esc(
          data.database_version
        )}
      </strong>

      <br>

      Story Nodes:
      ${esc(
        data.published_story_nodes
      )}

      <br>

      Quests:
      ${esc(
        data.published_quests
      )}

      <br>

      Quest Steps:
      ${esc(
        data.published_quest_steps
      )}

      <br>

      Dialogue Lines:
      ${esc(
        data.published_dialogue_lines
      )}

      <br>

      Sync Changes:
      ${esc(
        data.sync_changes
      )}

      ${
        data.warnings?.length
          ? `
            <br><br>
            <strong>
              Warnings
            </strong>

            <ul>
              ${data.warnings
                .map(
                  (warning) =>
                    `<li>${esc(
                      warning
                    )}</li>`
                )
                .join("")}
            </ul>
          `
          : ""
      }
    `;

    if (button) {
      button.disabled = false;
      button.textContent =
        "Validate & Publish World";
    }

    await worldPublishView();
  } catch (error) {
    console.error(
      "WORLD PUBLISH ERROR:",
      error
    );

    status.innerHTML = `
      <strong class="error">
        World publish failed.
      </strong>

      <br><br>

      ${esc(
        error.message ||
        String(error)
      )}
    `;

    if (button) {
      button.disabled = false;
      button.textContent =
        "Validate & Publish World";
    }
  }
}
function showError(error) {
  console.error(error);

  app.innerHTML = `
    <div class="panel">
      <h2>Error</h2>
      <p class="error">${esc(error?.message || String(error))}</p>
      <button id="errorRetry">Retry</button>
    </div>
  `;

  document.getElementById("errorRetry").onclick = dashboard;
}

function view(value) {
  switch (value) {
    case "dashboard":
      dashboard();
      break;
    case "vocabulary":
      setActiveNav(value);
      tableView("vocabulary", "Vocabulary", [
        "word", "part_of_speech", "translation", "level", "is_active"
      ]);
      break;
    case "grammar":
      setActiveNav(value);
      tableView("grammar", "Grammar", [
        "code", "name", "level", "description", "is_active"
      ]);
      break;
    case "grammar-intro":
      setActiveNav(value);
      grammarIntro();
      break;
    case "lessons":
      setActiveNav(value);
      tableView("lessons", "Lessons", [
        "title", "slug", "level", "order_index", "is_published", "base_xp"
      ]);
      break;
    case "collections":
      setActiveNav(value);
      tableView("collections", "Collections", [
        "name", "slug", "version", "is_published", "updated_at"
      ]);
      break;
    case "import":
      importView();
      break;
    case "publish":
      publishView();
      break;
    case "destinations":
      setActiveNav(value);
      tableView("destinations", "Destinations", [
        "code", "name", "calendar_type", "timezone", "is_active"
      ]);
      break;
    case "locations":
      setActiveNav(value);
      tableView("locations", "Locations", [
        "code", "name", "location_type", "destination_id", "is_active"
      ]);
      break;
    case "npcs":
      setActiveNav(value);
      tableView("npcs", "NPCs", [
        "code", "name", "role", "location_id", "is_active"
      ]);
      break;
    case "story-graph":
      storyGraphView();
      break;
    case "story-nodes":
      setActiveNav(value);
      tableView("story_nodes", "Story Nodes", [
        "code", "title", "node_type", "day_number", "time_of_day", "is_published"
      ]);
      break;
    case "quests":
      setActiveNav(value);
      tableView("quests", "Quests", [
        "code", "title", "level", "xp_reward", "is_published", "version"
      ]);
      break;
    case "dialogue-lines":
      setActiveNav(value);
      tableView("dialogue_lines", "Dialogue Lines", [
        "story_node_id", "speaker_type", "line_order", "target_text", "native_translation"
      ]);
      break;
    case "cultural-events":
      setActiveNav(value);
      tableView("cultural_calendar_events", "Cultural Calendar", [
        "destination_id", "month", "day", "title", "is_recurring"
      ]);
      break;
    case "import-quest-pack":
      importQuestPackView();
      break;
    case "world-publish":
      worldPublishView();
      break;
    case "database-version":
      databaseVersion();
      break;
    case "version":
      appVersion();
      break;
    default:
      dashboard();
  }
}

document.querySelectorAll("nav button").forEach((button) => {
  button.onclick = () => view(button.dataset.view);
});

const logout = document.getElementById("logout");
if (logout) {
  logout.onclick = async () => {
    await sb.auth.signOut();
    await boot();
  };
}

boot();
