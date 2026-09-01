const SUPABASE_URL =
  "https://rmzmlehgsksvrlefyvqa.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_mGaig4vsOn0UUYOXLLl-_g_MEKvIW8r";

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
      })[c]
  );


/* =========================================================
   BOOT
========================================================= */

async function boot() {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await sb.auth.getSession();

    if (sessionError) {
      console.error(sessionError);
      login(sessionError.message);
      return;
    }

    if (!session) {
      login();
      return;
    }

    const {
      data: profile,
      error: profileError,
    } = await sb
      .from("profiles")
      .select("id, display_name, role")
      .eq("id", session.user.id)
      .maybeSingle();

    console.log("Logged user:", session.user);
    console.log("Profile:", profile);
    console.log("Profile error:", profileError);

    if (profileError) {
      console.error("PROFILE ERROR:", profileError);

      login(
        "Profile error: " +
        profileError.message
      );

      return;
    }

    if (!profile) {
      await sb.auth.signOut();

      login(
        "Your account has no profile record."
      );

      return;
    }

    if (profile.role !== "admin") {
      await sb.auth.signOut();

      login(
        "This account does not have admin access. Current role: " +
        profile.role
      );

      return;
    }

    conn.textContent =
      "Connected as " +
      (profile.display_name || "Admin");

    dashboard();

  } catch (error) {
    console.error(error);

    login(
      error?.message ||
      "Unexpected error."
    );
  }
}


/* =========================================================
   LOGIN
========================================================= */

function login(message = "") {

  app.innerHTML = `
    <div class="login">

      <h2>Sentence Quest Admin</h2>

      ${
        message
          ? `
            <p class="muted">
              ${esc(message)}
            </p>
          `
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

      <button id="sign">
        Sign in
      </button>

    </div>
  `;

  document.getElementById("sign").onclick =
    async () => {

      const email =
        document
          .getElementById("email")
          .value
          .trim();

      const password =
        document
          .getElementById("password")
          .value;

      if (!email || !password) {
        alert(
          "Enter email and password."
        );
        return;
      }

      const {
        data,
        error,
      } =
        await sb.auth.signInWithPassword({
          email,
          password,
        });

      if (error) {
        alert(error.message);
        return;
      }

      console.log(
        "Login successful:",
        data.user
      );

      await boot();
    };
}


/* =========================================================
   DATABASE COUNTS
========================================================= */

async function count(table) {

  const {
    count,
    error
  } = await sb
    .from(table)
    .select("*", {
      count: "exact",
      head: true,
    });

  if (error) {
    throw error;
  }

  return count || 0;
}


/* =========================================================
   DASHBOARD
========================================================= */

async function dashboard() {

  try {

    const [
      vocabulary,
      lessons,
      collections,
      grammar,
      patterns,
    ] = await Promise.all([

      count("vocabulary"),

      count("lessons"),

      count("collections"),

      count("grammar"),

      count("sentence_patterns"),

    ]);


    app.innerHTML = `

      <h2>Dashboard</h2>

      <div class="grid">

        <div class="stat">
          Vocabulary
          <b>${vocabulary}</b>
        </div>

        <div class="stat">
          Grammar
          <b>${grammar}</b>
        </div>

        <div class="stat">
          Patterns
          <b>${patterns}</b>
        </div>

        <div class="stat">
          Lessons
          <b>${lessons}</b>
        </div>

      </div>


      <div class="panel" style="margin-top:14px">

        <h3>Collection Import</h3>

        <p>
          Import a SentenceQuest JSON collection
          directly into the database.
        </p>

        <input
          id="collectionFile"
          type="file"
          accept=".json,application/json"
        >

        <div
          class="toolbar"
          style="margin-top:12px"
        >

          <button id="importCollection">
            Import Collection
          </button>

          <button id="refreshDashboard">
            Refresh
          </button>

        </div>

        <div
          id="importStatus"
          class="muted"
          style="margin-top:12px"
        ></div>

      </div>


      <div
        class="panel"
        style="margin-top:14px"
      >

        <h3>Architecture</h3>

        <p>
          PostgreSQL master →
          protected API →
          mobile local DB →
          offline mode →
          incremental sync.
        </p>

      </div>

    `;


    document
      .getElementById("refreshDashboard")
      .onclick = () => dashboard();


    document
      .getElementById("importCollection")
      .onclick = importCollection;

  } catch (error) {

    console.error(error);

    app.innerHTML = `

      <div class="panel">

        <h2>Database Error</h2>

        <p>
          ${esc(error.message)}
        </p>

        <button
          onclick="dashboard()"
        >
          Retry
        </button>

      </div>

    `;
  }
}


/* =========================================================
   IMPORT COLLECTION
========================================================= */

async function importCollection() {

  const fileInput =
    document.getElementById(
      "collectionFile"
    );

  const status =
    document.getElementById(
      "importStatus"
    );

  const button =
    document.getElementById(
      "importCollection"
    );


  if (!fileInput.files.length) {

    alert(
      "Please select a JSON collection first."
    );

    return;
  }


  const file =
    fileInput.files[0];


  if (
    file.type &&
    file.type !== "application/json" &&
    !file.name.toLowerCase().endsWith(".json")
  ) {

    alert(
      "Please select a JSON file."
    );

    return;
  }


  try {

    button.disabled = true;

    button.textContent =
      "Importing...";


    status.textContent =
      "Reading collection...";


    const text =
      await file.text();


    let collection;

    try {

      collection =
        JSON.parse(text);

    } catch (error) {

      throw new Error(
        "The selected file is not valid JSON."
      );
    }


    if (
      collection?.format !==
      "sentencequest.collection"
    ) {

      throw new Error(
        'Invalid collection format. Expected "sentencequest.collection".'
      );
    }


    if (
      !collection.language?.code
    ) {

      throw new Error(
        "Collection is missing language.code."
      );
    }


    if (
      !collection.collection?.slug
    ) {

      throw new Error(
        "Collection is missing collection.slug."
      );
    }


    status.textContent =
      "Uploading collection to Supabase...";


    const {
      data,
      error,
    } = await sb.functions.invoke(
      "import-collection",
      {
        body: collection,
      }
    );


    if (error) {

      console.error(
        "Import function error:",
        error
      );

      throw new Error(
        error.message ||
        "Import function failed."
      );
    }


    console.log(
      "Import response:",
      data
    );


    if (
      !data ||
      data.success !== true
    ) {

      throw new Error(
        data?.error ||
        "Collection import failed."
      );
    }


    status.innerHTML = `

      <strong>
        Import successful.
      </strong>

      <br><br>

      Collection:
      ${esc(data.collection)}

      <br>

      Vocabulary:
      ${esc(data.vocabulary_count)}

      <br>

      Grammar:
      ${esc(data.grammar_count)}

      <br>

      Patterns:
      ${esc(data.pattern_count)}

      <br>

      Lessons:
      ${esc(data.lesson_count)}

    `;


    alert(
      "Collection imported successfully."
    );


    await dashboard();


  } catch (error) {

    console.error(error);

    status.innerHTML = `

      <strong>
        Import failed
      </strong>

      <br><br>

      ${esc(
        error?.message ||
        String(error)
      )}

    `;

    alert(
      "Import failed: " +
      (
        error?.message ||
        String(error)
      )
    );

  } finally {

    const currentButton =
      document.getElementById(
        "importCollection"
      );

    if (currentButton) {

      currentButton.disabled = false;

      currentButton.textContent =
        "Import Collection";
    }
  }
}


/* =========================================================
   TABLE VIEW
========================================================= */

async function tableView(
  table,
  title,
  columns
) {

  try {

    const {
      data,
      error
    } = await sb
      .from(table)
      .select(columns.join(","))
      .limit(100);


    if (error) {
      throw error;
    }


    app.innerHTML = `

      <h2>${esc(title)}</h2>

      <div class="toolbar">

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

            ${(data || [])
              .map(
                (row) => `

                  <tr>

                    ${columns
                      .map(
                        (c) => `

                          <td>
                            ${esc(
                              typeof row[c] ===
                              "object"
                                ? JSON.stringify(
                                    row[c]
                                  )
                                : row[c]
                            )}
                          </td>

                        `
                      )
                      .join("")}

                  </tr>

                `
              )
              .join("")}

          </tbody>

        </table>

      </div>

    `;


    document.getElementById(
      "ref"
    ).onclick = () =>
      tableView(
        table,
        title,
        columns
      );

  } catch (error) {

    console.error(error);

    app.innerHTML = `

      <div class="panel">

        ${esc(error.message)}

      </div>

    `;
  }
}


/* =========================================================
   FRONT CONFIG
========================================================= */

function config() {

  app.innerHTML = `

    <h2>Front Config</h2>

    <div class="panel">

      <p>
        Production editor will control
        theme, XP, hints, creativity bonus,
        feature flags and maintenance mode
        through <b>app_config</b>.
      </p>

    </div>

  `;
}


/* =========================================================
   SYNC
========================================================= */

function sync() {

  app.innerHTML = `

    <h2>Publish / Sync</h2>

    <div class="panel">

      <p>
        Draft → Validate → Publish →
        increment database version →
        generate sync changes →
        clients download delta.
      </p>

      <p class="muted">
        Secure Edge Function is the next
        implementation step.
      </p>

    </div>

  `;
}


/* =========================================================
   NAVIGATION
========================================================= */

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


/* =========================================================
   NAV BUTTONS
========================================================= */

document
  .querySelectorAll("nav button")
  .forEach(
    (button) => {

      button.onclick = () =>
        view(
          button.dataset.v
        );

    }
  );


/* =========================================================
   LOGOUT
========================================================= */

const logoutButton =
  document.getElementById(
    "logout"
  );


if (logoutButton) {

  logoutButton.onclick =
    async () => {

      await sb.auth.signOut();

      boot();

    };
}


/* =========================================================
   START
========================================================= */

boot();
