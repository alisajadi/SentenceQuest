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

function jsonText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value ===
    "object"
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
      login(
        error.message
      );
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

  conn.textContent =
    "Not connected";

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
    .getElementById(
      "sign"
    )
    .onclick =
    async () => {

      const email =
        document
          .getElementById(
            "email"
          )
          .value
          .trim();

      const password =
        document
          .getElementById(
            "password"
          )
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
          .getElementById(
            "sign"
          );

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

    const tables = [
      [
        "languages",
        "Languages"
      ],
      [
        "vocabulary",
        "Vocabulary"
      ],
      [
        "grammar",
        "Grammar"
      ],
      [
        "sentence_patterns",
        "Patterns"
      ],
      [
        "lessons",
        "Lessons"
      ],
      [
        "lesson_words",
        "Lesson Words"
      ],
      [
        "lesson_grammar_intro",
        "Grammar Intro"
      ],
      [
        "collections",
        "Collections"
      ],
      [
        "collection_items",
        "Collection Items"
      ],
      [
        "word_forms",
        "Word Forms"
      ],
      [
        "word_relations",
        "Word Relations"
      ],
      [
        "valid_sentences",
        "Valid Sentences"
      ],
      [
        "gifts",
        "Gifts"
      ],
      [
        "database_versions",
        "DB Versions"
      ],
      [
        "sync_changes",
        "Sync Changes"
      ]
    ];

    const counts =
      await Promise.all(
        tables.map(
          async ([table]) => [
            table,
            await count(
              table
            )
          ]
        )
      );

    app.innerHTML = `

      <h2>
        Dashboard
      </h2>

      <div class="grid">

        ${
          counts
            .map(
              ([table, value]) => {

                const label =
                  tables.find(
                    ([name]) =>
                      name === table
                  )?.[1] ||
                  table;

                return `
                  <div class="stat">

                    ${esc(label)}

                    <b>
                      ${esc(value)}
                    </b>

                  </div>
                `;
              }
            )
            .join("")
        }

      </div>

      <div class="panel">

        <h3>
          SentenceQuest Content System
        </h3>

        <p>
          Dashboard shows the current database inventory.
        </p>

        <p>
          Use Import to add content.
          Use Publish / Sync to publish content and manage synchronization.
        </p>

      </div>

    `;

  } catch (error) {

    showError(
      error
    );

  }
}

/* =========================================================
   IMPORT
========================================================= */

let lastImportResult =
  null;

async function importView() {

  try {

    const tables = [
      [
        "languages",
        "Languages"
      ],
      [
        "vocabulary",
        "Vocabulary"
      ],
      [
        "grammar",
        "Grammar"
      ],
      [
        "sentence_patterns",
        "Patterns"
      ],
      [
        "lessons",
        "Lessons"
      ],
      [
        "lesson_words",
        "Lesson Words"
      ],
      [
        "lesson_grammar_intro",
        "Grammar Intro"
      ],
      [
        "collections",
        "Collections"
      ],
      [
        "collection_items",
        "Collection Items"
      ],
      [
        "word_forms",
        "Word Forms"
      ],
      [
        "word_relations",
        "Word Relations"
      ],
      [
        "valid_sentences",
        "Valid Sentences"
      ],
      [
        "gifts",
        "Gifts"
      ]
    ];

    const counts =
      await Promise.all(
        tables.map(
          async ([table]) => [
            table,
            await count(
              table
            )
          ]
        )
      );

    app.innerHTML = `

      <h2>
        Import Collection
      </h2>

      <div class="panel">

        <h3>
          Import JSON Collection
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
            id="refreshImport"
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
          Current Database Inventory
        </h3>

        <div class="grid">

          ${
            counts
              .map(
                ([table, value]) => {

                  const label =
                    tables.find(
                      ([name]) =>
                        name ===
                        table
                    )?.[1] ||
                    table;

                  return `
                    <div class="stat">
                      ${esc(label)}
                      <b>
                        ${esc(value)}
                      </b>
                    </div>
                  `;
                }
              )
              .join("")
          }

        </div>

      </div>

      ${
        lastImportResult
          ? `

            <div class="panel">

              <h3>
                Last Successful Import
              </h3>

              <p>
                Collection:
                <strong>
                  ${esc(
                    lastImportResult.collection
                  )}
                </strong>
              </p>

              <div class="grid">

                <div class="stat">
                  Vocabulary
                  <b>
                    ${esc(
                      lastImportResult.vocabulary_count
                    )}
                  </b>
                </div>

                <div class="stat">
                  Grammar
                  <b>
                    ${esc(
                      lastImportResult.grammar_count
                    )}
                  </b>
                </div>

                <div class="stat">
                  Patterns
                  <b>
                    ${esc(
                      lastImportResult.pattern_count
                    )}
                  </b>
                </div>

                <div class="stat">
                  Lessons
                  <b>
                    ${esc(
                      lastImportResult.lesson_count
                    )}
                  </b>
                </div>

              </div>

            </div>

          `
          : ""
      }

    `;

    document
      .getElementById(
        "importCollection"
      )
      .onclick =
      importCollection;

    document
      .getElementById(
        "refreshImport"
      )
      .onclick =
      importView;

  } catch (error) {

    showError(
      error
    );

  }
}

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
      !collection
        .language
        ?.code
    ) {
      throw new Error(
        "Missing language.code."
      );
    }

    if (
      !collection
        .collection
        ?.slug
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
      data.success !==
        true
    ) {
      throw new Error(
        data?.error ||
        "Collection import failed."
      );
    }

    lastImportResult =
      data;

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

    await importView();

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

    showError(
      error
    );

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
            ascending:
              true
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

    showError(
      error
    );

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
            major_version,
            minor_version,
            release_name,
            checksum,
            notes,
            created_at,
            is_current,
            published_at,
            published_by
          `
        )
        .order(
          "version",
          {
            ascending:
              false
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
                            row.major_version
                          )}.${String(
                            row.minor_version ??
                            0
                          ).padStart(
                            2,
                            "0"
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

    showError(
      error
    );

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

    showError(
      error
    );

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
            ascending:
              false
          }
        );

    if (error) {
      throw error;
    }

    const {
      data: release,
      error:
        releaseError
    } =
      await sb
        .from(
          "database_release"
        )
        .select(
          `
            major_version,
            minor_version,
            database_version,
            release_name,
            updated_at
          `
        )
        .eq(
          "id",
          true
        )
        .maybeSingle();

    if (releaseError) {
      throw releaseError;
    }

    const currentVersion =
      release
        ? `${release.major_version}.${String(
            release.minor_version
          ).padStart(
            2,
            "0"
          )}`
        : "—";

    app.innerHTML = `

      <h2>
        Publish / Sync
      </h2>

      <div class="panel">

        <h3>
          Current Database
        </h3>

        <p>
          Database Version:
          <strong>
            ${esc(
              currentVersion
            )}
          </strong>
        </p>

        ${
          release?.release_name
            ? `
              <p>
                Release:
                ${esc(
                  release.release_name
                )}
              </p>
            `
            : ""
        }

        <div class="toolbar">

          <button
            id="syncDatabase"
          >
            Sync
          </button>

          <button
            id="refreshPublish"
          >
            Refresh
          </button>

        </div>

        <div
          id="syncStatus"
          class="status"
        ></div>

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
                button.dataset
                  .publishId
              );

        }
      );

    document
      .getElementById(
        "refreshPublish"
      )
      .onclick =
      publishView;

    document
      .getElementById(
        "syncDatabase"
      )
      .onclick =
      syncDatabase;

  } catch (error) {

    showError(
      error
    );

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
      data.success !==
        true
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

      <br>

      Sync changes:
      ${esc(
        data.sync_changes
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
   SYNC
========================================================= */

async function syncDatabase() {

  const status =
    document.getElementById(
      "syncStatus"
    );

  try {

    status.textContent =
      "Checking synchronization...";

    const {
      data: release,
      error:
        releaseError
    } =
      await sb
        .from(
          "database_release"
        )
        .select(
          `
            major_version,
            minor_version,
            database_version
          `
        )
        .eq(
          "id",
          true
        )
        .single();

    if (releaseError) {
      throw releaseError;
    }

    const version =
      `${release.major_version}.${String(
        release.minor_version
      ).padStart(
        2,
        "0"
      )}`;

    const {
      data,
      error
    } =
      await sb.functions.invoke(
        "sync-database",
        {
          body: {
            database_version:
              version
          }
        }
      );

    if (error) {
      throw error;
    }

    if (
      !data ||
      data.success !==
        true
    ) {
      throw new Error(
        data?.error ||
        "Sync check failed."
      );
    }

    status.innerHTML = `

      <strong class="success">
        Database is synchronized.
      </strong>

      <br><br>

      Current version:
      ${esc(
        data.database_version
      )}

      <br>

      Changes available:
      ${esc(
        data.changes?.length ||
        0
      )}

    `;

  } catch (error) {

    console.error(
      "SYNC ERROR:",
      error
    );

    status.innerHTML = `

      <strong class="error">
        Sync failed
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

  console.error(
    error
  );

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
            button.dataset
              .view
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
