/* =========================================================
   SENTENCEQUEST ADMIN
   FINAL ADMIN.JS
   ========================================================= */

const SUPABASE_URL =
  "https://rmzmlehgsksvrlefyvqa.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_mGaig4vsOn0UUYOXLLl-_g_MEKvIW8r";


const sb =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );


const app =
  document.getElementById("app");

const conn =
  document.getElementById(
    "connection"
  );


/* =========================================================
   HELPERS
   ========================================================= */

function esc(value) {

  return String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[c]
  );

}


function pretty(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "object"
  ) {
    return JSON.stringify(
      value,
      null,
      2
    );
  }

  return String(value);
}


function showError(error) {

  console.error(error);

  const message =
    error?.message ||
    error?.error_description ||
    String(error);

  app.innerHTML = `
    <div class="panel">

      <h2>Error</h2>

      <p class="error">
        ${esc(message)}
      </p>

      <button
        id="retryButton"
      >
        Retry
      </button>

    </div>
  `;

  const retry =
    document.getElementById(
      "retryButton"
    );

  if (retry) {
    retry.onclick =
      () => dashboard();
  }
}


/* =========================================================
   BOOT
   ========================================================= */

async function boot() {

  try {

    const {
      data: {
        session
      },
      error
    } =
      await sb.auth.getSession();

    if (error) {
      login(error.message);
      return;
    }

    if (!session) {
      login();
      return;
    }

    await checkAdmin(
      session
    );

  } catch (error) {

    showError(error);

  }
}


/* =========================================================
   LOGIN
   ========================================================= */

function login(
  message = ""
) {

  if (conn) {
    conn.textContent =
      "Not connected";
  }

  app.innerHTML = `

    <div class="login">

      <h2>
        SentenceQuest Admin
      </h2>

      ${
        message
          ? `
            <p class="error">
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

      <button
        id="sign"
      >
        Sign in
      </button>

    </div>

  `;


  document
    .getElementById("sign")
    .onclick =
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

      if (
        !email ||
        !password
      ) {

        alert(
          "Enter email and password."
        );

        return;
      }


      const button =
        document
          .getElementById("sign");

      button.disabled =
        true;

      button.textContent =
        "Signing in...";


      const {
        data,
        error
      } =
        await sb.auth
          .signInWithPassword({
            email,
            password
          });


      if (error) {

        button.disabled =
          false;

        button.textContent =
          "Sign in";

        alert(
          error.message
        );

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
   ADMIN CHECK
   ========================================================= */

async function checkAdmin(
  session
) {

  const {
    data: profile,
    error
  } =
    await sb
      .from("profiles")
      .select(
        "id,display_name,role"
      )
      .eq(
        "id",
        session.user.id
      )
      .maybeSingle();


  if (error) {

    login(
      "Profile error: " +
      error.message
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


  if (
    profile.role !==
    "admin"
  ) {

    await sb.auth.signOut();

    login(
      "This account does not have admin access. Current role: " +
      profile.role
    );

    return;
  }


  if (conn) {

    conn.textContent =
      "Connected as " +
      (
        profile.display_name ||
        "Admin"
      );

  }


  dashboard();

}


/* =========================================================
   COUNT
   ========================================================= */

async function count(
  table
) {

  const {
    count,
    error
  } =
    await sb
      .from(table)
      .select(
        "*",
        {
          count:
            "exact",
          head:
            true
        }
      );


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
      patterns
    ] =
      await Promise.all([

        count(
          "vocabulary"
        ),

        count(
          "lessons"
        ),

        count(
          "collections"
        ),

        count(
          "grammar"
        ),

        count(
          "sentence_patterns"
        )

      ]);


    app.innerHTML = `

      <h2>
        Dashboard
      </h2>

      <div class="grid">

        <div class="stat">
          Vocabulary
          <b>
            ${vocabulary}
          </b>
        </div>

        <div class="stat">
          Grammar
          <b>
            ${grammar}
          </b>
        </div>

        <div class="stat">
          Patterns
          <b>
            ${patterns}
          </b>
        </div>

        <div class="stat">
          Lessons
          <b>
            ${lessons}
          </b>
        </div>

        <div class="stat">
          Collections
          <b>
            ${collections}
          </b>
        </div>

      </div>


      <div class="panel">

        <h3>
          Import Collection
        </h3>

        <p>
          Import a SentenceQuest JSON collection.
        </p>

        <input
          id="collectionFile"
          type="file"
          accept=".json,application/json"
        >

        <div class="toolbar">

          <button
            id="importCollection"
          >
            Import Collection
          </button>

          <button
            id="refreshDashboard"
          >
            Refresh
          </button>

        </div>

        <div
          id="importStatus"
          class="status"
        ></div>

      </div>


      <div class="panel">

        <h3>
          SentenceQuest Architecture
        </h3>

        <p>
          PostgreSQL master →
          protected API →
          mobile local database →
          offline mode →
          incremental synchronization.
        </p>

      </div>

    `;


    document
      .getElementById(
        "refreshDashboard"
      )
      .onclick =
      () => dashboard();


    document
      .getElementById(
        "importCollection"
      )
      .onclick =
      importCollection;


  } catch (error) {

    showError(error);

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


  if (
    !fileInput ||
    !fileInput.files ||
    !fileInput.files.length
  ) {

    alert(
      "Please select a JSON collection first."
    );

    return;
  }


  const file =
    fileInput.files[0];


  if (
    !file.name
      .toLowerCase()
      .endsWith(".json")
  ) {

    alert(
      "Please select a JSON file."
    );

    return;
  }


  try {

    button.disabled =
      true;

    button.textContent =
      "Importing...";


    status.innerHTML =
      "Reading collection...";


    const text =
      await file.text();


    let collection;


    try {

      collection =
        JSON.parse(text);

    } catch {

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


    status.innerHTML =
      "Uploading collection to Supabase...";


    const {
      data,
      error
    } =
      await sb.functions.invoke(
        "import-collection",
        {
          body:
            collection
        }
      );


    if (error) {

      console.error(
        "Edge Function error:",
        error
      );

      throw new Error(
        error.message ||
        "Import Edge Function failed."
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

      <strong class="success">
        Import successful.
      </strong>

      <br><br>

      Collection:
      ${esc(
        data.collection
      )}

      <br>

      Vocabulary:
      ${esc(
        data.vocabulary_count
      )}

      <br>

      Grammar:
      ${esc(
        data.grammar_count
      )}

      <br>

      Patterns:
      ${esc(
        data.pattern_count
      )}

      <br>

      Lessons:
      ${esc(
        data.lesson_count
      )}

    `;


    alert(
      "Collection imported successfully."
    );


    await dashboard();


  } catch (error) {

    console.error(
      "IMPORT ERROR:",
      error
    );


    const message =
      error?.message ||
      String(error);


    status.innerHTML = `

      <strong class="error">
        Import failed
      </strong>

      <br><br>

      ${esc(message)}

    `;


    alert(
      "Import failed: " +
      message
    );


  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
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
    } =
      await sb
        .from(table)
        .select(
          columns.join(",")
        )
        .limit(100);


    if (error) {
      throw error;
    }


    app.innerHTML = `

      <h2>
        ${esc(title)}
      </h2>

      <div class="toolbar">

        <button
          id="ref"
        >
          Refresh
        </button>

      </div>


      <div class="table-wrap">

        <table class="table">

          <thead>

            <tr>

              ${
                columns
                  .map(
                    column =>
                      `<th>${esc(column)}</th>`
                  )
                  .join("")
              }

            </tr>

          </thead>


          <tbody>

            ${
              (data || [])
                .map(
                  row => `

                    <tr>

                      ${
                        columns
                          .map(
                            column => `

                              <td>
                                ${esc(
                                  pretty(
                                    row[column]
                                  )
                                )}
                              </td>

                            `
                          )
                          .join("")
                      }

                    </tr>

                  `
                )
                .join("")
            }

          </tbody>

        </table>

      </div>

    `;


    document
      .getElementById("ref")
      .onclick =
      () =>
        tableView(
          table,
          title,
          columns
        );


  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   GRAMMAR INTRO
   ========================================================= */

async function grammarIntro() {

  try {

    const {
      data,
      error
    } =
      await sb
        .from(
          "lesson_grammar_intro"
        )
        .select(
          `
          id,
          lesson_id,
          title,
          short_text,
          detailed_text,
          image_url,
          audio_url,
          video_url,
          audio_duration_seconds,
          video_duration_seconds,
          sort_order,
          is_active,
          version,
          created_at,
          updated_at
          `
        )
        .order(
          "sort_order",
          {
            ascending: true
          }
        )
        .limit(100);


    if (error) {
      throw error;
    }


    app.innerHTML = `

      <h2>
        Grammar Intro
      </h2>

      <div class="panel">

        <p>
          Each lesson can have a short grammar
          introduction with text, image, audio
          and video.
        </p>

        <p class="muted">
          Upload management will be connected
          to Supabase Storage in the next stage.
        </p>

      </div>


      <div class="card-grid">

        ${
          (data || [])
            .map(
              item => `

                <div class="panel">

                  <h3>
                    ${esc(item.title)}
                  </h3>

                  <p>
                    ${esc(
                      item.short_text
                    )}
                  </p>

                  ${
                    item.image_url
                      ? `
                        <img
                          class="preview"
                          src="${esc(
                            item.image_url
                          )}"
                        >
                      `
                      : ""
                  }

                  ${
                    item.audio_url
                      ? `
                        <audio
                          controls
                          src="${esc(
                            item.audio_url
                          )}"
                        ></audio>
                      `
                      : ""
                  }

                  ${
                    item.video_url
                      ? `
                        <video
                          controls
                          src="${esc(
                            item.video_url
                          )}"
                        ></video>
                      `
                      : ""
                  }

                </div>

              `
            )
            .join("")
        }

      </div>

    `;

  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   FRONT CONFIG
   ========================================================= */

async function config() {

  try {

    const {
      data,
      error
    } =
      await sb
        .from(
          "app_config"
        )
        .select(
          "key,value,version,updated_at"
        )
        .order(
          "key",
          {
            ascending: true
          }
        );


    if (error) {
      throw error;
    }


    app.innerHTML = `

      <h2>
        Front Config
      </h2>

      <div class="panel">

        <p>
          Front-end configuration.
        </p>

        <div class="table-wrap">

          <table class="table">

            <thead>

              <tr>

                <th>
                  Key
                </th>

                <th>
                  Value
                </th>

                <th>
                  Version
                </th>

              </tr>

            </thead>

            <tbody>

              ${
                (data || [])
                  .map(
                    row => `

                      <tr>

                        <td>
                          ${esc(row.key)}
                        </td>

                        <td>
                          <pre>${esc(
                            pretty(
                              row.value
                            )
                          )}</pre>
                        </td>

                        <td>
                          ${esc(
                            row.version
                          )}
                        </td>

                      </tr>

                    `
                  )
                  .join("")
              }

            </tbody>

          </table>

        </div>

      </div>

    `;

  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   DATABASE VERSION
   ========================================================= */

async function databaseVersion() {

  try {

    const {
      data,
      error
    } =
      await sb
        .from(
          "database_versions"
        )
        .select(
          "id,version,release_name,checksum,notes,created_at,is_current"
        )
        .order(
          "version",
          {
            ascending: false
          }
        )
        .limit(50);


    if (error) {
      throw error;
    }


    app.innerHTML = `

      <h2>
        Database Version
      </h2>

      <div class="panel">

        <p>
          Database migration history.
        </p>

        <div class="table-wrap">

          <table class="table">

            <thead>

              <tr>

                <th>
                  Version
                </th>

                <th>
                  Release
                </th>

                <th>
                  Current
                </th>

                <th>
                  Notes
                </th>

                <th>
                  Date
                </th>

              </tr>

            </thead>

            <tbody>

              ${
                (data || [])
                  .map(
                    row => `

                      <tr>

                        <td>
                          ${esc(
                            row.version
                          )}
                        </td>

                        <td>
                          ${esc(
                            row.release_name
                          )}
                        </td>

                        <td>
                          ${
                            row.is_current
                              ? "YES"
                              : "NO"
                          }
                        </td>

                        <td>
                          ${esc(
                            row.notes
                          )}
                        </td>

                        <td>
                          ${esc(
                            row.created_at
                          )}
                        </td>

                      </tr>

                    `
                  )
                  .join("")
              }

            </tbody>

          </table>

        </div>

      </div>

    `;

  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   APP VERSION
   ========================================================= */

async function appVersion() {

  try {

    const {
      data,
      error
    } =
      await sb
        .from(
          "app_release"
        )
        .select(
          "id,major_version,minor_version,app_version,minimum_supported_version,release_notes,updated_at"
        )
        .eq(
          "id",
          true
        )
        .maybeSingle();


    if (error) {
      throw error;
    }


    if (!data) {

      app.innerHTML = `

        <h2>
          App Version
        </h2>

        <div class="panel">

          <p class="warning">
            app_release table is not available yet.
          </p>

          <p>
            Run the version migration SQL first.
          </p>

        </div>

      `;

      return;
    }


    app.innerHTML = `

      <h2>
        App Version
      </h2>

      <div class="panel">

        <div class="version">
          ${esc(
            data.app_version
          )}
        </div>

        <p>
          Major:
          <strong>
            ${esc(
              data.major_version
            )}
          </strong>
        </p>

        <p>
          Minor:
          <strong>
            ${esc(
              data.minor_version
            )}
          </strong>
        </p>

        <p>
          Minimum supported:
          ${esc(
            data.minimum_supported_version
          )}
        </p>

        <p>
          ${esc(
            data.release_notes
          )}
        </p>

        <p class="muted">
          Updated:
          ${esc(
            data.updated_at
          )}
        </p>

      </div>

      <div class="panel">

        <h3>
          Version policy
        </h3>

        <p>
          Database/content changes increase
          the decimal part.
        </p>

        <p>
          Example:
          1.07 → 1.08 → 1.09
        </p>

        <p>
          Major structural releases are entered
          manually:
          1.99 → 2.00
        </p>

      </div>

    `;

  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   PUBLISH / SYNC
   ========================================================= */

async function sync() {

  try {

    const {
      data,
      error
    } =
      await sb
        .from(
          "collections"
        )
        .select(
          "id,name,slug,version,is_published,updated_at"
        )
        .order(
          "updated_at",
          {
            ascending: false
          }
        );


    if (error) {
      throw error;
    }


    app.innerHTML = `

      <h2>
        Publish / Sync
      </h2>

      <div class="panel">

        <h3>
          Collections
        </h3>

        <p class="muted">
          Import creates draft content.
          Publish makes selected content
          available to the application.
        </p>

      </div>


      <div class="card-grid">

        ${
          (data || [])
            .map(
              collection => `

                <div class="panel">

                  <h3>
                    ${esc(
                      collection.name
                    )}
                  </h3>

                  <p>
                    ${esc(
                      collection.slug
                    )}
                  </p>

                  <p>
                    Version:
                    ${esc(
                      collection.version
                    )}
                  </p>

                  <p>

                    Status:

                    <span class="badge">

                      ${
                        collection.is_published
                          ? "Published"
                          : "Draft"
                      }

                    </span>

                  </p>


                  ${
                    !collection.is_published
                      ? `

                        <button
                          data-publish-id="${esc(
                            collection.id
                          )}"
                        >
                          Publish
                        </button>

                      `
                      : `
                        <span class="success">
                          Published
                        </span>
                      `
                  }

                </div>

              `
            )
            .join("")
        }

      </div>


      <div
        id="publishStatus"
        class="status"
      ></div>

    `;


    document
      .querySelectorAll(
        "[data-publish-id]"
      )
      .forEach(
        button => {

          button.onclick =
            () =>
              publishCollection(
                button.dataset.publishId
              );

        }
      );


  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   PUBLISH COLLECTION
   ========================================================= */

async function publishCollection(
  collectionId
) {

  const status =
    document.getElementById(
      "publishStatus"
    );


  if (
    !confirm(
      "Publish this collection?"
    )
  ) {
    return;
  }


  try {

    status.innerHTML =
      "Publishing...";


    const {
      data,
      error
    } =
      await sb.functions.invoke(
        "publish-collection",
        {
          body: {
            collection_id:
              collectionId
          }
        }
      );


    if (error) {

      console.error(
        error
      );

      throw new Error(
        error.message ||
        "Publish function failed."
      );

    }


    if (
      !data ||
      data.success !== true
    ) {

      throw new Error(
        data?.error ||
        "Publishing failed."
      );

    }


    status.innerHTML = `

      <strong class="success">
        Published successfully.
      </strong>

      <br><br>

      Database version:
      ${esc(
        data.database_version
      )}

      <br>

      App version:
      ${esc(
        data.app_version
      )}

    `;


    await sync();


  } catch (error) {

    console.error(
      error
    );


    status.innerHTML = `

      <strong class="error">
        Publish failed
      </strong>

      <br><br>

      ${esc(
        error.message
      )}

    `;

  }

}


/* =========================================================
   NAVIGATION
   ========================================================= */

function view(
  value
) {

  switch (value) {

    case "dashboard":
      dashboard();
      break;


    case "vocabulary":

      tableView(
        "vocabulary",
        "Vocabulary",
        [
          "word",
          "part_of_speech",
          "translation",
          "level",
          "is_active"
        ]
      );

      break;


    case "lessons":

      tableView(
        "lessons",
        "Lessons",
        [
          "title",
          "slug",
          "level",
          "order_index",
          "is_published",
          "base_xp"
        ]
      );

      break;


    case "collections":

      tableView(
        "collections",
        "Collections",
        [
          "name",
          "slug",
          "version",
          "is_published",
          "updated_at"
        ]
      );

      break;


    case "grammar":

      tableView(
        "grammar",
        "Grammar",
        [
          "name",
          "code",
          "level",
          "description",
          "is_active"
        ]
      );

      break;


    case "config":
      config();
      break;


    case "sync":
      sync();
      break;


    case "app-version":
      appVersion();
      break;


    case "grammar-intro":
      grammarIntro();
      break;


    case "database-version":
      databaseVersion();
      break;


    default:
      dashboard();

  }

}


/* =========================================================
   NAV BUTTONS
   ========================================================= */

document
  .querySelectorAll(
    "nav button"
  )
  .forEach(
    button => {

      button.onclick =
        () => {

          const value =
            button.dataset.v;

          document
            .querySelectorAll(
              "nav button"
            )
            .forEach(
              item =>
                item.classList
                  .remove(
                    "active"
                  )
            );


          button.classList
            .add(
              "active"
            );


          view(value);

        };

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
