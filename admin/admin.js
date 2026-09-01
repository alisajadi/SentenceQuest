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
      console.error(
        "PROFILE ERROR:",
        profileError
      );

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

    conn.textContent = "Connected";

    dashboard();

  } catch (error) {
    console.error(error);

    login(
      error?.message ||
      "Unexpected error."
    );
  }
}


function login(message = "") {

  app.innerHTML = `
    <div class="login">

      <h2>Sentence Quest Admin</h2>

      ${
        message
          ? `<p class="muted">
              ${esc(message)}
             </p>`
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

  } catch (error) {

    console.error(error);

    app.innerHTML = `

      <div class="panel">

        <h2>Database Error</h2>

        <p>
          ${esc(error.message)}
        </p>

      </div>

    `;
  }
}


async function tableView(
  table,
  title,
  columns
) {

  const {
    data,
    error
  } = await sb
    .from(table)
    .select(columns.join(","))
    .limit(100);

  if (error) {

    app.innerHTML = `
      <div class="panel">
        ${esc(error.message)}
      </div>
    `;

    return;
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

          ${data
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
}


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
  .forEach(
    (button) => {

      button.onclick = () =>
        view(
          button.dataset.v
        );

    }
  );


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


boot();
