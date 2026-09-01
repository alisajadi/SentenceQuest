const SUPABASE_URL = "https://rmzmlehgsksvrlefyvqa.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mGaig4vsOn0UUYOXLLl-_g_MEKvIW8r";

const sb = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const app = document.getElementById("app");
const conn = document.getElementById("connection");

const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[c])
  );

async function boot() {
  if (
    SUPABASE_URL === "YOUR_SUPABASE_URL" ||
    SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY"
  ) {
    login("Configure Supabase credentials in admin.js.");
    return;
  }

  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session) {
    login();
    return;
  }

  const { data: profile, error } = await sb
    .from("profiles")
    .select("display_name, role")
    .eq("id", session.user.id)
    .single();

  if (error || profile?.role !== "admin") {
    await sb.auth.signOut();

    login("This account does not have admin access.");
    return;
  }

  conn.textContent = "Connected";
  dashboard();
}

function login(message = "") {
  app.innerHTML = `
    <div class="login">
      <h2>Sentence Quest Admin</h2>
      ${
        message
          ? `<p class="muted">${esc(message)}</p>`
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

      <button id="sign">Sign in</button>
    </div>
  `;

  document.getElementById("sign").onclick =
    async () => {
      const email =
        document.getElementById("email").value.trim();

      const password =
        document.getElementById("password").value;

      if (!email || !password) {
        alert("Enter email and password.");
        return;
      }

      const { error } =
        await sb.auth.signInWithPassword({
          email,
          password,
        });

      if (error) {
        alert(error.message);
        return;
      }

      boot();
    };
}

async function count(table) {
  const { count, error } =
    await sb
      .from(table)
      .select("*", {
        count: "exact",
        head: true,
      });

  if (error) throw error;

  return count || 0;
}

async function dashboard() {
  try {
    const [
      vocabulary,
      lessons,
      collections,
      grammar,
    ] = await Promise.all([
      count("vocabulary"),
      count("lessons"),
      count("collections"),
      count("grammar"),
    ]);

    app.innerHTML = `
      <h2>Dashboard</h2>

      <div class="grid">
        <div class="stat">
          Vocabulary
          <b>${vocabulary}</b>
        </div>

        <div class="stat">
          Lessons
          <b>${lessons}</b>
        </div>

        <div class="stat">
          Collections
          <b>${collections}</b>
        </div>

        <div class="stat">
          Grammar
          <b>${grammar}</b>
        </div>
      </div>

      <div class="panel">
        <h3>Collection Import</h3>

        <p>
          Import a SentenceQuest JSON collection directly
          into Supabase.
        </p>

        <input
          id="collectionFile"
          type="file"
          accept=".json,application/json"
        >

        <button id="importBtn">
          Import Collection
        </button>

        <pre id="importResult"></pre>
      </div>
    `;

    document.getElementById("importBtn").onclick =
      importCollection;

  } catch (error) {
    showError(error);
  }
}

async function importCollection() {
  const file =
    document.getElementById("collectionFile").files[0];

  const result =
    document.getElementById("importResult");

  if (!file) {
    alert("Select a JSON collection first.");
    return;
  }

  try {
    result.textContent = "Importing...";

    const json = JSON.parse(
      await file.text()
    );

    const {
      data: { session },
    } = await sb.auth.getSession();

    if (!session) {
      throw new Error("Session expired.");
    }

    const response =
      await fetch(
        `${SUPABASE_URL}/functions/v1/import-collection`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,

            apikey: SUPABASE_ANON_KEY,

            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(json),
        }
      );

    const data =
      await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || "Import failed."
      );
    }

    result.textContent =
      JSON.stringify(data, null, 2);

    alert(
      `Collection imported successfully.\n\n` +
      `Vocabulary: ${data.vocabulary_count}\n` +
      `Grammar: ${data.grammar_count}\n` +
      `Patterns: ${data.pattern_count}\n` +
      `Lessons: ${data.lesson_count}`
    );

    dashboard();

  } catch (error) {
    result.textContent =
      error.message || String(error);

    alert(
      error.message || String(error)
    );
  }
}

async function tableView(
  table,
  title,
  columns
) {
  const { data, error } =
    await sb
      .from(table)
      .select(columns.join(","))
      .limit(200);

  if (error) {
    showError(error);
    return;
  }

  app.innerHTML = `
    <h2>${esc(title)}</h2>

    <div class="toolbar">
      <input
        id="q"
        placeholder="Search..."
      >

      <button id="ref">
        Refresh
      </button>
    </div>

    <div class="table-wrap">
      <table class="table">

        <thead>
          <tr>
            ${columns
              .map(
                (c) =>
                  `<th>${esc(c)}</th>`
              )
              .join("")}
          </tr>
        </thead>

        <tbody>
          ${
            (data || [])
              .map(
                (row) =>
                  `<tr>
                    ${columns
                      .map((c) => {
                        const value =
                          typeof row[c] ===
                          "object"
                            ? JSON.stringify(
                                row[c]
                              )
                            : row[c];

                        return `<td>${esc(
                          value
                        )}</td>`;
                      })
                      .join("")}
                  </tr>`
              )
              .join("")
          }
        </tbody>

      </table>
    </div>
  `;

  document.getElementById("ref").onclick =
    () =>
      tableView(
        table,
        title,
        columns
      );

  document.getElementById("q").oninput =
    function () {
      const search =
        this.value.toLowerCase();

      document
        .querySelectorAll(".table tbody tr")
        .forEach((row) => {
          row.style.display =
            row.textContent
              .toLowerCase()
              .includes(search)
              ? ""
              : "none";
        });
    };
}

async function publishCollection() {
  const slug =
    document
      .getElementById("publishSlug")
      .value.trim();

  const result =
    document.getElementById("publishResult");

  if (!slug) {
    alert("Enter collection slug.");
    return;
  }

  try {
    result.textContent = "Publishing...";

    const {
      data: { session },
    } = await sb.auth.getSession();

    if (!session) {
      throw new Error("Session expired.");
    }

    const response =
      await fetch(
        `${SUPABASE_URL}/functions/v1/publish`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,

            apikey: SUPABASE_ANON_KEY,

            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            collection_slug: slug,
          }),
        }
      );

    const data =
      await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || "Publish failed."
      );
    }

    result.textContent =
      JSON.stringify(data, null, 2);

    alert(
      `Published successfully.\nVersion: ${data.version}`
    );

  } catch (error) {
    result.textContent =
      error.message || String(error);

    alert(
      error.message || String(error)
    );
  }
}

function config() {
  app.innerHTML = `
    <h2>Front Config</h2>

    <div class="panel">
      <p>
        Front-end configuration will be managed
        through app_config.
      </p>
    </div>
  `;
}

function sync() {
  app.innerHTML = `
    <h2>Publish / Sync</h2>

    <div class="panel">

      <h3>Publish Collection</h3>

      <input
        id="publishSlug"
        placeholder="a1-food-present-simple-001"
      >

      <button id="publishBtn">
        Publish
      </button>

      <pre id="publishResult"></pre>

    </div>
  `;

  document.getElementById("publishBtn").onclick =
    publishCollection;
}

function showError(error) {
  app.innerHTML = `
    <div class="panel error">
      ${esc(
        error?.message ||
        String(error)
      )}
    </div>
  `;
}

function view(v) {
  if (v === "dashboard")
    dashboard();

  if (v === "vocabulary")
    tableView(
      "vocabulary",
      "Vocabulary",
      [
        "word",
        "part_of_speech",
        "translation",
        "level",
        "is_active",
      ]
    );

  if (v === "lessons")
    tableView(
      "lessons",
      "Lessons",
      [
        "title",
        "slug",
        "level",
        "order_index",
        "is_published",
        "base_xp",
      ]
    );

  if (v === "collections")
    tableView(
      "collections",
      "Collections",
      [
        "name",
        "slug",
        "version",
        "is_published",
      ]
    );

  if (v === "grammar")
    tableView(
      "grammar",
      "Grammar",
      [
        "name",
        "code",
        "level",
        "is_active",
      ]
    );

  if (v === "config")
    config();

  if (v === "sync")
    sync();
}

document
  .querySelectorAll("nav button")
  .forEach((button) => {
    button.onclick = () =>
      view(button.dataset.v);
  });

document.getElementById("logout").onclick =
  async () => {
    await sb.auth.signOut();
    boot();
  };

boot();
