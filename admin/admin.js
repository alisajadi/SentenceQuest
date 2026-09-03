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
    const rows = await getInventory(true);

    app.innerHTML = `
      <h2>Dashboard</h2>
      ${inventoryHtml(rows)}

      <div class="panel">
        <h3>SentenceQuest Content System</h3>
        <p>Dashboard shows the current database inventory only.</p>
        <p>Import adds or updates content without publishing it.</p>
        <p>Publish creates the next database version and sync changes.</p>
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

async function tableView(table, title, columns) {
  try {
    app.innerHTML = `<h2>${esc(title)}</h2><div class="status">Loading...</div>`;

    const { data, error } = await sb
      .from(table)
      .select(columns.join(","))
      .limit(100);

    if (error) throw error;

    app.innerHTML = `
      <h2>${esc(title)}</h2>
      <div class="toolbar"><button id="tableRefresh">Refresh</button></div>
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
      () => tableView(table, title, columns);
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
