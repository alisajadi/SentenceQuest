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
        "'": "&#039;",
      })[c]
  );

}


/* =========================================================
   BOOT
========================================================= */

async function boot() {

  try {

    const {
      data,
      error
    } =
      await sb.auth.getSession();


    if (error) {

      login(
        error.message
      );

      return;

    }


    if (!data.session) {

      login();

      return;

    }


    await checkAdmin(
      data.session
    );

  } catch (error) {

    login(
      error.message
    );

  }

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


  conn.textContent =
    "Connected as " +
    (
      profile.display_name ||
      "Admin"
    );


  dashboard();

}


/* =========================================================
   LOGIN
========================================================= */

function login(
  message = ""
) {

  app.innerHTML = `

    <div class="login">

      <h2>
        Sentence Quest Admin
      </h2>

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
