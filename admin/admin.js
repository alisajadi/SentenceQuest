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
  document.getElementById("connection");


function esc(value) {

  return String(value ?? "").replace(
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


function jsonText(value) {

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


    const {
      data: profile,
      error: profileError
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


    if (profileError) {

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


    if (
      profile.role !== "admin"
    ) {

      await sb.auth.signOut();

      login(
        "This account does not have admin access. Current role: " +
        profile.role
      );

      return;
    }


    conn.textContent =
      "Connected as " +
      (
        profile.display_name ||
        "Admin"
      );


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

      <button id="sign">
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


      await boot();

    };

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
          count: "exact",
          head: true
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
      grammar,
      lessons,
      collections,
      patterns
    ] =
      await Promise.all([

        count(
          "vocabulary"
        ),

        count(
          "grammar"
        ),

        count(
          "lessons"
        ),

        count(
          "collections"
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

        <div class="stat">
          Collections
          <b>${collections}</b>
        </div>

      </div>


      <div class="panel">

        <h3>
          Import Collection
        </h3>

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

    `;


    document
      .getElementById(
        "importCollection"
      )
      .onclick =
      importCollection;


    document
      .getElementById(
        "refreshDashboard"
      )
      .onclick =
      dashboard;


  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   IMPORT
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


  try {

    button.disabled =
      true;

    button.textContent =
      "Importing...";


    status.textContent =
      "Reading collection...";


    const file =
      fileInput.files[0];


    const text =
      await file.text();


    let collection;


    try {

      collection =
        JSON.parse(text);

    } catch {

      throw new Error(
        "Invalid JSON file."
      );

    }


    if (
      collection.format !==
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
        "Missing language.code."
      );

    }


    if (
      !collection.collection?.slug
    ) {

      throw new Error(
        "Missing collection.slug."
      );

    }


    status.textContent =
      "Sending collection to Supabase...";


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
        error
      );

      throw new Error(
        error.message ||
        "Import function failed."
      );

    }


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


    dashboard();


  } catch (error) {

    console.error(
      "IMPORT ERROR:",
      error
    );


    status.innerHTML = `

      <strong class="error">
        Import failed
      </strong>

      <br><br>

      ${esc(
        error.message ||
        String(error)
      )}

    `;


    alert(
      "Import failed: " +
      (
        error.message ||
        String(error)
      )
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
          id="tableRefresh"
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
                                  jsonText(
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
      .getElementById(
        "tableRefresh"
      )
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
          Grammar introduction for lessons.
        </p>

        <p>
          Each lesson can contain:
        </p>

        <ul>

          <li>
            Text
          </li>

          <li>
            Image
          </li>

          <li>
            Audio
          </li>

          <li>
            Video
          </li>

        </ul>

      </div>


      <div class="card-grid">

        ${
          (data || [])
            .map(
              item => `

                <div class="panel">

                  <h3>
                    ${esc(
                      item.title
                    )}
                  </h3>


                  <p>
                    ${esc(
                      item.short_text
                    )}
                  </p>


                  ${
                    item.detailed_text
                      ? `
                        <p>
                          ${esc(
                            item.detailed_text
                          )}
                        </p>
                      `
                      : ""
                  }


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
   CONFIG
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
                          ${esc(
                            row.key
                          )}
                        </td>

                        <td>
                          <pre>${esc(
                            jsonText(
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
          `
          id,
          version,
          release_name,
          checksum,
          notes,
          created_at,
          is_current
          `
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
          `
          id,
          major_version,
          minor_version,
          app_version,
          minimum_supported_version,
          release_notes,
          updated_at
          `
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

          <p class="error">
            App release record not found.
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

        <h3>
          Current version
        </h3>

        <div class="version">
          ${esc(
            data.app_version
          )}
        </div>


        <p>
          Major version:
          <strong>
            ${esc(
              data.major_version
            )}
          </strong>
        </p>


        <p>
          Minor version:
          <strong>
            ${esc(
              data.minor_version
            )}
          </strong>
        </p>


        <p>
          Minimum supported version:
          ${esc(
            data.minimum_supported_version
          )}
        </p>


        <p>
          ${esc(
            data.release_notes
          )}
        </p>

      </div>


      <div class="panel">

        <h3>
          Version policy
        </h3>

        <p>
          Content/database update:
          1.07 → 1.08
        </p>

        <p>
          Major structural update:
          1.99 → 2.00
        </p>

        <p>
          Major version is changed manually.
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

async function publishView() {

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
          `
          id,
          name,
          slug,
          version,
          is_published,
          updated_at
          `
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

        <p>
          Import creates draft content.
        </p>

        <p>
          Publish makes the collection
          available to the application.
        </p>

        <p>
          Publishing also increments
          the database version.
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
                    Slug:
                    ${esc(
                      collection.slug
                    )}
                  </p>


                  <p>
                    Collection version:
                    ${esc(
                      collection.version
                    )}
                  </p>


                  <p>
                    Status:
                    ${
                      collection.is_published
                        ? "Published"
                        : "Draft"
                    }
                  </p>


                  ${
                    collection.is_published
                      ? `
                        <span class="success">
                          Published
                        </span>
                      `
                      : `
                        <button
                          data-publish-id="${esc(
                            collection.id
                          )}"
                        >
                          Publish
                        </button>
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

    status.textContent =
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
        "Publish failed."
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

      Published lessons:
      ${esc(
        data.published_lessons
      )}

    `;


    await publishView();


  } catch (error) {

    console.error(
      "PUBLISH ERROR:",
      error
    );


    status.innerHTML = `

      <strong class="error">
        Publish failed
      </strong>

      <br><br>

      ${esc(
        error.message ||
        String(error)
      )}

    `;

  }

}


/* =========================================================
   ERROR
========================================================= */

function showError(
  error
) {

  console.error(error);


  app.innerHTML = `

    <div class="panel">

      <h2>
        Error
      </h2>

      <p class="error">
        ${esc(
          error?.message ||
          String(error)
        )}
      </p>

      <button
        id="errorRetry"
      >
        Retry
      </button>

    </div>

  `;


  const retry =
    document.getElementById(
      "errorRetry"
    );


  if (retry) {

    retry.onclick =
      dashboard;

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


    case "grammar":

      tableView(
        "grammar",
        "Grammar",
        [
          "code",
          "name",
          "level",
          "description",
          "is_active"
        ]
      );

      break;


    case "grammar-intro":

      grammarIntro();

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


    case "import":

      dashboard();

      break;


    case "publish":

      publishView();

      break;


    case "config":

      config();

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

          view(
            button.dataset.view
          );

        };

    }
  );


/* =========================================================
   LOGOUT
========================================================= */

const logout =
  document.getElementById(
    "logout"
  );


if (logout) {

  logout.onclick =
    async () => {

      await sb.auth.signOut();

      boot();

    };

}


/* =========================================================
   START
========================================================= */

boot();
