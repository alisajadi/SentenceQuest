/* =========================================================
   SENTENCEQUEST — DIALOGUE MANAGER
   ========================================================= */

let dialogueManagerState = {
  destinationId: null,
  nodeId: null,
  destinations: [],
  nodes: [],
  npcs: [],
  lessons: [],
  lines: []
};


/* =========================================================
   MAIN VIEW
   ========================================================= */

async function dialogueManagerView() {
  setActiveNav("dialogue-manager");

  try {
    const { data: destinations, error } =
      await sb
        .from("destinations")
        .select("id,code,name")
        .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    dialogueManagerState.destinations =
      destinations || [];

    if (
      dialogueManagerState.destinationId &&
      !dialogueManagerState.destinations.some(
        (item) =>
          item.id ===
          dialogueManagerState.destinationId
      )
    ) {
      dialogueManagerState.destinationId =
        null;
    }

    if (
      !dialogueManagerState.destinationId &&
      dialogueManagerState.destinations.length
    ) {
      dialogueManagerState.destinationId =
        dialogueManagerState.destinations[0].id;
    }

    renderDialogueManagerShell();

    if (dialogueManagerState.destinationId) {
      await loadDialogueManagerData(
        dialogueManagerState.destinationId
      );
    }

  } catch (error) {
    showError(error);
  }
}


/* =========================================================
   SHELL
   ========================================================= */

function renderDialogueManagerShell() {
  app.innerHTML = `
    <h2>Dialogue Manager</h2>

    <div class="toolbar">

      <select id="dialogueDestination">
        <option value="">
          Select destination...
        </option>

        ${dialogueManagerState.destinations
          .map(
            (destination) => `
              <option
                value="${esc(destination.id)}"
                ${
                  destination.id ===
                  dialogueManagerState.destinationId
                    ? "selected"
                    : ""
                }
              >
                ${esc(destination.name)}
                (${esc(destination.code)})
              </option>
            `
          )
          .join("")}
      </select>

      <button id="dialogueRefresh">
        Refresh
      </button>

      <button id="dialogueNew">
        + New Dialogue
      </button>

    </div>

    <div
      id="dialogueManagerContent"
    ></div>
  `;

  const destination =
    document.getElementById(
      "dialogueDestination"
    );

  destination.onchange =
    async () => {

      dialogueManagerState.destinationId =
        destination.value || null;

      dialogueManagerState.nodeId =
        null;

      renderDialogueManagerShell();

      if (
        dialogueManagerState.destinationId
      ) {
        await loadDialogueManagerData(
          dialogueManagerState.destinationId
        );
      }
    };

  document.getElementById(
    "dialogueRefresh"
  ).onclick =
    () =>
      dialogueManagerView();

  document.getElementById(
    "dialogueNew"
  ).onclick =
    () =>
      showDialogueEditor(null);
}


/* =========================================================
   LOAD DATA
   ========================================================= */

async function loadDialogueManagerData(
  destinationId
) {
  try {

    const [
      nodesRes,
      npcsRes,
      lessonsRes
    ] = await Promise.all([

      sb
        .from("story_nodes")
        .select(`
          id,
          destination_id,
          code,
          title,
          day_number,
          time_of_day,
          is_published
        `)
        .eq(
          "destination_id",
          destinationId
        )
        .order("day_number", {
          ascending: true
        }),

      sb
        .from("npcs")
        .select(`
          id,
          destination_id,
          location_id,
          code,
          name,
          role
        `)
        .eq(
          "destination_id",
          destinationId
        )
        .order("name", {
          ascending: true
        }),

      sb
        .from("lessons")
        .select(`
          id,
          slug,
          title,
          level,
          is_published
        `)
        .order("title", {
          ascending: true
        })

    ]);

    if (nodesRes.error) {
      throw nodesRes.error;
    }

    if (npcsRes.error) {
      throw npcsRes.error;
    }

    if (lessonsRes.error) {
      throw lessonsRes.error;
    }

    dialogueManagerState.nodes =
      nodesRes.data || [];

    dialogueManagerState.npcs =
      npcsRes.data || [];

    dialogueManagerState.lessons =
      lessonsRes.data || [];

    const nodeIds =
      dialogueManagerState.nodes.map(
        (node) => node.id
      );

    if (!nodeIds.length) {
      renderDialogueList([]);
      return;
    }

    const {
      data: lines,
      error: linesError
    } = await sb
      .from("dialogue_lines")
      .select("*")
      .in(
        "story_node_id",
        nodeIds
      )
      .order("line_order", {
        ascending: true
      });

    if (linesError) {
      throw linesError;
    }

    dialogueManagerState.lines =
      lines || [];

    renderDialogueList(
      dialogueManagerState.lines
    );

  } catch (error) {
    showError(error);
  }
}


/* =========================================================
   LIST
   ========================================================= */

function renderDialogueList(lines) {

  const container =
    document.getElementById(
      "dialogueManagerContent"
    );

  if (!container) {
    return;
  }

  const nodeMap =
    new Map(
      dialogueManagerState.nodes.map(
        (node) => [
          node.id,
          node
        ]
      )
    );

  const npcMap =
    new Map(
      dialogueManagerState.npcs.map(
        (npc) => [
          npc.id,
          npc
        ]
      )
    );

  if (!lines.length) {

    container.innerHTML = `
      <div class="panel">
        <p class="muted">
          No dialogue lines yet.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = `
    <div class="table-wrap">

      <table class="table">

        <thead>
          <tr>
            <th>Node</th>
            <th>Day</th>
            <th>Speaker</th>
            <th>Line</th>
            <th>Translation</th>
            <th>Lesson</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>

          ${lines
            .map((line) => {

              const node =
                nodeMap.get(
                  line.story_node_id
                );

              const npc =
                npcMap.get(
                  line.npc_id
                );

              const lesson =
                dialogueManagerState.lessons.find(
                  (item) =>
                    item.id ===
                    line.lesson_id
                );

              return `
                <tr>

                  <td>
                    <strong>
                      ${esc(
                        node?.title ||
                        "Unknown"
                      )}
                    </strong>
                    <br>
                    <span class="muted">
                      ${esc(
                        node?.code ||
                        ""
                      )}
                    </span>
                  </td>

                  <td>
                    Day
                    ${esc(
                      node?.day_number ||
                      ""
                    )}
                    <br>
                    ${esc(
                      node?.time_of_day ||
                      ""
                    )}
                  </td>

                  <td>
                    <strong>
                      ${esc(
                        line.speaker_type
                      )}
                    </strong>

                    ${
                      npc
                        ? `
                          <br>
                          <span class="muted">
                            ${esc(
                              npc.name
                            )}
                          </span>
                        `
                        : ""
                    }
                  </td>

                  <td>
                    ${esc(
                      line.target_text
                    )}
                  </td>

                  <td>
                    ${esc(
                      line.native_translation ||
                      ""
                    )}
                  </td>

                  <td>
                    ${
                      lesson
                        ? esc(
                            lesson.title
                          )
                        : "—"
                    }
                  </td>

                  <td>
                    <button
                      data-edit-dialogue="${esc(
                        line.id
                      )}"
                    >
                      Edit
                    </button>
                  </td>

                </tr>
              `;
            })
            .join("")}

        </tbody>

      </table>

    </div>
  `;

  container
    .querySelectorAll(
      "[data-edit-dialogue]"
    )
    .forEach((button) => {

      button.onclick =
        () => {

          const line =
            lines.find(
              (item) =>
                item.id ===
                button.dataset.editDialogue
            );

          if (line) {
            showDialogueEditor(line);
          }
        };

    });
}


/* =========================================================
   EDITOR
   ========================================================= */

async function showDialogueEditor(
  line
) {

  const isNew =
    !line;

  if (
    !dialogueManagerState.nodes.length
  ) {

    alert(
      "Create a Story Node first."
    );

    return;
  }

  const firstNode =
    dialogueManagerState.nodes[0];

  /*
   * Determine the Story Node that will
   * initially be selected.
   */
  const selectedNodeId =
    line?.story_node_id ||
    firstNode.id;

  /*
   * For a new dialogue line, calculate
   * the next available order directly
   * from the database.
   *
   * For an existing line, preserve
   * its current order.
   */
  let initialOrder =
    line?.line_order;

  if (isNew) {

    initialOrder =
      await getNextDialogueOrder(
        selectedNodeId
      );
  }

  app.innerHTML = `
    <h2>
      ${
        isNew
          ? "New Dialogue Line"
          : "Edit Dialogue Line"
      }
    </h2>

    <div class="toolbar">

      <button id="dialogueBack">
        ← Back
      </button>

    </div>

    <div class="panel">

      <form
        id="dialogueForm"
        class="form-stack"
      >

        <label>
          Story Node
        </label>

        <select
          id="dialogueNode"
          required
        >

          ${dialogueManagerState.nodes
            .map(
              (node) => `
                <option
                  value="${esc(node.id)}"
                  ${
                    (
                      line?.story_node_id ||
                      firstNode.id
                    ) === node.id
                      ? "selected"
                      : ""
                  }
                >
                  Day
                  ${esc(
                    node.day_number ||
                    ""
                  )}
                  ·
                  ${esc(node.title)}
                  ${
                    node.is_published
                      ? " ✓"
                      : " · draft"
                  }
                </option>
              `
            )
            .join("")}

        </select>


        <label>
          Speaker Type
        </label>

        <select
          id="dialogueSpeaker"
        >

          ${[
            "npc",
            "player",
            "narrator"
          ]
            .map(
              (type) => `
                <option
                  value="${type}"
                  ${
                    (
                      line?.speaker_type ||
                      "npc"
                    ) === type
                      ? "selected"
                      : ""
                  }
                >
                  ${type}
                </option>
              `
            )
            .join("")}

        </select>


        <label>
          NPC
        </label>

        <select
          id="dialogueNpc"
        >

          <option value="">
            No NPC
          </option>

          ${dialogueManagerState.npcs
            .map(
              (npc) => `
                <option
                  value="${esc(npc.id)}"
                  ${
                    line?.npc_id ===
                    npc.id
                      ? "selected"
                      : ""
                  }
                >
                  ${esc(npc.name)}
                  ${
                    npc.role
                      ? ` · ${esc(
                          npc.role
                        )}`
                      : ""
                  }
                </option>
              `
            )
            .join("")}

        </select>


        <label>
          Line Order
        </label>

        <input
          id="dialogueOrder"
          type="number"
          min="1"
          value="${esc(
            initialOrder || 1
          )}"
          readonly
          required
        >

        <small class="muted">
          Line Order is assigned automatically for this Story Node.
        </small>


        <label>
          English / Target Text
        </label>

        <textarea
          id="dialogueTarget"
          required
        >${esc(
          line?.target_text ||
          ""
        )}</textarea>


        <label>
          Native Translation
        </label>

        <textarea
          id="dialogueNative"
        >${esc(
          line?.native_translation ||
          ""
        )}</textarea>


        <label>
          Audio URL
        </label>

        <input
          id="dialogueAudio"
          value="${esc(
            line?.audio_url ||
            ""
          )}"
          placeholder="https://..."
        >


        <label>
          Lesson
        </label>

        <select
          id="dialogueLesson"
        >

          <option value="">
            No Lesson
          </option>

          ${dialogueManagerState.lessons
            .map(
              (lesson) => `
                <option
                  value="${esc(
                    lesson.id
                  )}"
                  ${
                    line?.lesson_id ===
                    lesson.id
                      ? "selected"
                      : ""
                  }
                >
                  ${esc(
                    lesson.title
                  )}
                  ${
                    lesson.is_published
                      ? " ✓"
                      : " · draft"
                  }
                </option>
              `
            )
            .join("")}

        </select>


        <div class="toolbar">

          <button
            type="submit"
          >
            ${
              isNew
                ? "Create Dialogue"
                : "Save Dialogue"
            }
          </button>

          ${
            !isNew
              ? `
                <button
                  type="button"
                  id="deleteDialogue"
                  class="danger"
                >
                  Delete
                </button>
              `
              : ""
          }

        </div>

        <div
          id="dialogueStatus"
          class="status"
        ></div>

      </form>

    </div>
  `;


  /* =======================================================
     BACK BUTTON
     ======================================================= */

  document.getElementById(
    "dialogueBack"
  ).onclick =
    () =>
      dialogueManagerView();


  /* =======================================================
     AUTOMATIC LINE ORDER
     ======================================================= */

  const nodeSelect =
    document.getElementById(
      "dialogueNode"
    );

  const orderInput =
    document.getElementById(
      "dialogueOrder"
    );

  if (
    nodeSelect &&
    orderInput
  ) {

    nodeSelect.onchange =
      async () => {

        try {

          orderInput.value =
            await getNextDialogueOrder(
              nodeSelect.value
            );

        } catch (error) {

          console.error(
            "Failed to update dialogue order:",
            error
          );

          orderInput.value =
            "1";
        }
      };
  }


  /* =======================================================
     FORM SUBMIT
     ======================================================= */

  document.getElementById(
    "dialogueForm"
  ).onsubmit =
    async (event) => {

      event.preventDefault();

      const status =
        document.getElementById(
          "dialogueStatus"
        );

      try {

        status.textContent =
          "Saving...";


        const payload = {

          story_node_id:
            document.getElementById(
              "dialogueNode"
            ).value,

          npc_id:
            document.getElementById(
              "dialogueNpc"
            ).value ||
            null,

          speaker_type:
            document.getElementById(
              "dialogueSpeaker"
            ).value,

          line_order:
            Math.max(
              1,
              Number(
                document.getElementById(
                  "dialogueOrder"
                ).value ||
                1
              )
            ),

          target_text:
            document.getElementById(
              "dialogueTarget"
            ).value.trim(),

          native_translation:
            document.getElementById(
              "dialogueNative"
            ).value.trim() ||
            null,

          audio_url:
            document.getElementById(
              "dialogueAudio"
            ).value.trim() ||
            null,

          lesson_id:
            document.getElementById(
              "dialogueLesson"
            ).value ||
            null
        };


        if (!payload.target_text) {

          throw new Error(
            "Target text is required."
          );
        }


        /* =================================================
           CREATE
           ================================================= */

        if (isNew) {

          const {
            error
          } = await sb
            .from("dialogue_lines")
            .insert(payload);

          if (error) {
            throw error;
          }

        }


        /* =================================================
           UPDATE
           ================================================= */

        else {

          const {
            error
          } = await sb
            .from("dialogue_lines")
            .update(payload)
            .eq(
              "id",
              line.id
            );

          if (error) {
            throw error;
          }
        }


        status.innerHTML = `
          <strong class="success">
            Dialogue saved successfully.
          </strong>
        `;


        setTimeout(
          () =>
            dialogueManagerView(),
          500
        );


      } catch (error) {

        status.innerHTML = `
          <strong class="error">
            ${esc(
              error.message ||
              String(error)
            )}
          </strong>
        `;
      }
    };


  /* =======================================================
     DELETE
     ======================================================= */

  const deleteButton =
    document.getElementById(
      "deleteDialogue"
    );

  if (deleteButton) {

    deleteButton.onclick =
      async () => {

        if (
          !confirm(
            "Delete this dialogue line?"
          )
        ) {
          return;
        }


        const {
          error
        } = await sb
          .from("dialogue_lines")
          .delete()
          .eq(
            "id",
            line.id
          );


        if (error) {

          alert(
            error.message
          );

          return;
        }


        await dialogueManagerView();
      };
  }
}


/* =========================================================
   AUTOMATIC LINE ORDER
   ========================================================= */

/*
 * Returns the next available line_order
 * for the selected Story Node.
 *
 * Example:
 *
 * Existing:
 *   1
 *   2
 *   3
 *
 * New line:
 *   4
 *
 * If no lines exist:
 *   1
 */

async function getNextDialogueOrder(
  nodeId
) {

  if (!nodeId) {
    return 1;
  }


  const {
    data,
    error
  } = await sb
    .from("dialogue_lines")
    .select("line_order")
    .eq(
      "story_node_id",
      nodeId
    )
    .order(
      "line_order",
      {
        ascending: false
      }
    )
    .limit(1);


  if (error) {

    console.error(
      "Failed to calculate next dialogue order:",
      error
    );

    return 1;
  }


  if (
    !data ||
    !data.length
  ) {
    return 1;
  }


  return (
    Number(
      data[0].line_order ||
      0
    ) + 1
  );
}
