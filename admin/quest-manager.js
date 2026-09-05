/* =========================================================
   SENTENCEQUEST — QUEST MANAGER
   ========================================================= */

async function questManagerView() {
  setActiveNav("quest-manager");

  try {
    const [
      { data: destinations, error: destinationError },
      { data: quests, error: questError }
    ] = await Promise.all([
      sb
        .from("destinations")
        .select("id,code,name")
        .order("name", { ascending: true }),

      sb
        .from("quests")
        .select(`
          id,
          destination_id,
          story_node_id,
          code,
          title,
          description,
          level,
          xp_reward,
          is_repeatable,
          is_published,
          version,
          created_at,
          updated_at
        `)
        .order("updated_at", { ascending: false })
    ]);

    if (destinationError) throw destinationError;
    if (questError) throw questError;

    const destinationMap = new Map(
      (destinations || []).map(item => [
        item.id,
        item
      ])
    );

    app.innerHTML = `
      <h2>Quest Manager</h2>

      <div class="toolbar">
        <button id="newQuestButton">
          + New Quest
        </button>

        <button id="questRefresh">
          Refresh
        </button>
      </div>

      <div id="questManagerContent"></div>
    `;

    document.getElementById("newQuestButton").onclick =
      () => showQuestEditor(null, destinations || []);

    document.getElementById("questRefresh").onclick =
      () => questManagerView();

    const content =
      document.getElementById("questManagerContent");

    if (!quests?.length) {
      content.innerHTML = `
        <div class="panel">
          <p class="muted">
            No quests yet.
          </p>
        </div>
      `;

      return;
    }

    content.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Code</th>
              <th>Destination</th>
              <th>Level</th>
              <th>XP</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            ${(quests || []).map(quest => {
              const destination =
                destinationMap.get(
                  quest.destination_id
                );

              return `
                <tr>
                  <td>
                    <strong>
                      ${esc(quest.title)}
                    </strong>
                  </td>

                  <td>
                    ${esc(quest.code)}
                  </td>

                  <td>
                    ${esc(
                      destination?.name ||
                      "Unknown"
                    )}
                  </td>

                  <td>
                    ${esc(quest.level || "")}
                  </td>

                  <td>
                    ${esc(quest.xp_reward || 0)}
                  </td>

                  <td>
                    ${
                      quest.is_published
                        ? `<strong class="success">Published</strong>`
                        : `<strong class="muted">Draft</strong>`
                    }
                  </td>

                  <td>
                    <button
                      data-edit-quest="${esc(
                        quest.id
                      )}"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;

    document
      .querySelectorAll("[data-edit-quest]")
      .forEach(button => {
        button.onclick = () => {
          const quest =
            quests.find(
              item =>
                item.id ===
                button.dataset.editQuest
            );

          if (quest) {
            showQuestEditor(
              quest,
              destinations || []
            );
          }
        };
      });

  } catch (error) {
    showError(error);
  }
}


/* =========================================================
   QUEST EDITOR
   ========================================================= */

async function showQuestEditor(
  quest,
  destinations
) {
  const isNew = !quest;

  let nodes = [];
  let lessons = [];
  let dialogueLines = [];
  let steps = [];

  try {
    if (!isNew) {
      const [
        nodesRes,
        lessonsRes,
        dialogueRes,
        stepsRes
      ] = await Promise.all([
        sb
          .from("story_nodes")
          .select(`
            id,
            destination_id,
            code,
            title,
            day_number,
            time_of_day
          `)
          .eq(
            "destination_id",
            quest.destination_id
          )
          .order("day_number", {
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
          }),

        sb
          .from("dialogue_lines")
          .select(`
            id,
            story_node_id,
            speaker_type,
            line_order,
            target_text
          `)
          .order("line_order", {
            ascending: true
          }),

        sb
          .from("quest_steps")
          .select("*")
          .eq(
            "quest_id",
            quest.id
          )
          .order("step_order", {
            ascending: true
          })
      ]);

      if (nodesRes.error) throw nodesRes.error;
      if (lessonsRes.error) throw lessonsRes.error;
      if (dialogueRes.error) throw dialogueRes.error;
      if (stepsRes.error) throw stepsRes.error;

      nodes = nodesRes.data || [];
      lessons = lessonsRes.data || [];
      dialogueLines = dialogueRes.data || [];
      steps = stepsRes.data || [];
    } else {
      const [
        lessonsRes
      ] = await Promise.all([
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

      if (lessonsRes.error) {
        throw lessonsRes.error;
      }

      lessons = lessonsRes.data || [];
    }

    app.innerHTML = `
      <h2>
        ${isNew ? "New Quest" : "Edit Quest"}
      </h2>

      <div class="toolbar">
        <button id="questBack">
          ← Back
        </button>
      </div>

      <div class="panel">

        <form id="questForm" class="form-stack">

          <label>Destination</label>

          <select
            id="questDestination"
            required
          >
            <option value="">
              Select destination...
            </option>

            ${(destinations || []).map(
              destination => `
                <option
                  value="${esc(destination.id)}"
                  ${
                    quest?.destination_id ===
                    destination.id
                      ? "selected"
                      : ""
                  }
                >
                  ${esc(destination.name)}
                  (${esc(destination.code)})
                </option>
              `
            ).join("")}
          </select>

          <label>Story Node</label>

          <select
            id="questStoryNode"
            required
          >
            <option value="">
              Select Story Node...
            </option>

            ${nodes.map(node => `
              <option
                value="${esc(node.id)}"
                ${
                  quest?.story_node_id ===
                  node.id
                    ? "selected"
                    : ""
                }
              >
                Day ${esc(node.day_number || "")}
                ·
                ${esc(node.title)}
              </option>
            `).join("")}
          </select>

          <label>Code</label>

          <input
            id="questCode"
            value="${esc(quest?.code || "")}"
            ${isNew ? "" : "readonly"}
            required
          >

          <label>Title</label>

          <input
            id="questTitle"
            value="${esc(quest?.title || "")}"
            required
          >

          <label>Description</label>

          <textarea
            id="questDescription"
          >${esc(
            quest?.description || ""
          )}</textarea>

          <label>Level</label>

          <input
            id="questLevel"
            value="${esc(
              quest?.level || ""
            )}"
            placeholder="A1"
          >

          <label>XP Reward</label>

          <input
            id="questXp"
            type="number"
            min="0"
            value="${esc(
              quest?.xp_reward ?? 0
            )}"
          >

          <label>
            <input
              id="questRepeatable"
              type="checkbox"
              ${
                quest?.is_repeatable
                  ? "checked"
                  : ""
              }
            >
            Repeatable Quest
          </label>

          <label>
            <input
              id="questPublished"
              type="checkbox"
              ${
                quest?.is_published
                  ? "checked"
                  : ""
              }
            >
            Published
          </label>

          <div class="toolbar">

            <button type="submit">
              ${isNew
                ? "Create Quest"
                : "Save Quest"}
            </button>

            ${
              !isNew
                ? `
                  <button
                    type="button"
                    id="deleteQuest"
                    class="danger"
                  >
                    Delete Quest
                  </button>
                `
                : ""
            }

          </div>

        </form>

      </div>

      ${
        !isNew
          ? `
            <div class="panel">

              <div class="toolbar">
                <h3>Quest Steps</h3>

                <button
                  id="addQuestStep"
                >
                  + Add Step
                </button>
              </div>

              <div
                id="questStepsEditor"
              ></div>

            </div>
          `
          : ""
      }

      <div
        id="questEditorStatus"
        class="status"
      ></div>
    `;

    document.getElementById(
      "questBack"
    ).onclick = () =>
      questManagerView();

    document.getElementById(
      "questDestination"
    ).onchange = async event => {

      const destinationId =
        event.target.value;

      const nodeSelect =
        document.getElementById(
          "questStoryNode"
        );

      nodeSelect.innerHTML = `
        <option value="">
          Select Story Node...
        </option>
      `;

      if (!destinationId) {
        return;
      }

      const {
        data,
        error
      } = await sb
        .from("story_nodes")
        .select(`
          id,
          title,
          day_number
        `)
        .eq(
          "destination_id",
          destinationId
        )
        .order("day_number", {
          ascending: true
        });

      if (error) {
        alert(error.message);
        return;
      }

      nodeSelect.innerHTML +=
        (data || []).map(node => `
          <option
            value="${esc(node.id)}"
          >
            Day ${esc(
              node.day_number || ""
            )}
            ·
            ${esc(node.title)}
          </option>
        `).join("");
    };


    document.getElementById(
      "questForm"
    ).onsubmit = async event => {

      event.preventDefault();

      const status =
        document.getElementById(
          "questEditorStatus"
        );

      try {

        status.textContent =
          "Saving Quest...";

        const payload = {
          destination_id:
            document.getElementById(
              "questDestination"
            ).value,

          story_node_id:
            document.getElementById(
              "questStoryNode"
            ).value,

          code:
            document.getElementById(
              "questCode"
            ).value.trim(),

          title:
            document.getElementById(
              "questTitle"
            ).value.trim(),

          description:
            document.getElementById(
              "questDescription"
            ).value.trim() || null,

          level:
            document.getElementById(
              "questLevel"
            ).value.trim() || null,

          xp_reward:
            Number(
              document.getElementById(
                "questXp"
              ).value || 0
            ),

          is_repeatable:
            document.getElementById(
              "questRepeatable"
            ).checked,

          is_published:
            document.getElementById(
              "questPublished"
            ).checked,

          updated_at:
            new Date().toISOString()
        };

        if (isNew) {

          const {
            data,
            error
          } = await sb
            .from("quests")
            .insert(payload)
            .select()
            .single();

          if (error) throw error;

          showQuestEditor(
            data,
            destinations
          );

          return;
        }

        const {
          data,
          error
        } = await sb
          .from("quests")
          .update(payload)
          .eq(
            "id",
            quest.id
          )
          .select()
          .single();

        if (error) throw error;

        status.innerHTML = `
          <strong class="success">
            Quest saved.
          </strong>
        `;

        quest = data;

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


    const deleteButton =
      document.getElementById(
        "deleteQuest"
      );

    if (deleteButton) {

      deleteButton.onclick =
        async () => {

          if (
            !confirm(
              "Delete this Quest? Its Steps will also be deleted."
            )
          ) {
            return;
          }

          const {
            error
          } = await sb
            .from("quests")
            .delete()
            .eq(
              "id",
              quest.id
            );

          if (error) {
            alert(error.message);
            return;
          }

          await questManagerView();
        };
    }


    if (!isNew) {

      renderQuestSteps(
        quest,
        steps,
        lessons,
        dialogueLines
      );

      document.getElementById(
        "addQuestStep"
      ).onclick = async () => {

        const nextOrder =
          steps.length
            ? Math.max(
                ...steps.map(
                  step =>
                    Number(
                      step.step_order
                    )
                )
              ) + 1
            : 1;

        const {
          data,
          error
        } = await sb
          .from("quest_steps")
          .insert({
            quest_id:
              quest.id,

            step_order:
              nextOrder,

            step_type:
              "sentence"
          })
          .select()
          .single();

        if (error) {
          alert(error.message);
          return;
        }

        steps.push(data);

        renderQuestSteps(
          quest,
          steps,
          lessons,
          dialogueLines
        );
      };
    }

  } catch (error) {
    showError(error);
  }
}


/* =========================================================
   QUEST STEPS
   ========================================================= */

function renderQuestSteps(
  quest,
  steps,
  lessons,
  dialogueLines
) {
  const container =
    document.getElementById(
      "questStepsEditor"
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    steps.length
      ? steps.map(step => `
        <div
          class="panel"
          data-step-id="${esc(step.id)}"
        >

          <h4>
            Step ${esc(step.step_order)}
          </h4>

          <div class="form-stack">

            <label>Step Type</label>

            <select
              data-step-type
            >
              ${[
                "sentence",
                "dialogue",
                "listening",
                "reading",
                "multiple_choice",
                "fill_blank",
                "free_sentence"
              ].map(type => `
                <option
                  value="${type}"
                  ${
                    step.step_type === type
                      ? "selected"
                      : ""
                  }
                >
                  ${type}
                </option>
              `).join("")}
            </select>


            <label>Lesson</label>

            <select
              data-step-lesson
            >
              <option value="">
                No lesson
              </option>

              ${lessons.map(
                lesson => `
                  <option
                    value="${esc(
                      lesson.id
                    )}"
                    ${
                      step.lesson_id ===
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
              ).join("")}
            </select>


            <label>Dialogue Line</label>

            <select
              data-step-dialogue
            >
              <option value="">
                No dialogue line
              </option>

              ${dialogueLines.map(
                line => `
                  <option
                    value="${esc(
                      line.id
                    )}"
                    ${
                      step.dialogue_line_id ===
                      line.id
                        ? "selected"
                        : ""
                    }
                  >
                    ${esc(
                      line.speaker_type
                    )}
                    #${esc(
                      line.line_order
                    )}
                    ·
                    ${esc(
                      line.target_text
                    )}
                  </option>
                `
              ).join("")}
            </select>


            <label>Native Prompt</label>

            <textarea
              data-step-native
            >${esc(
              step.prompt_native || ""
            )}</textarea>


            <label>Target Prompt</label>

            <textarea
              data-step-target
            >${esc(
              step.prompt_target || ""
            )}</textarea>


            <label>Media URL</label>

            <input
              data-step-media
              value="${esc(
                step.media_url || ""
              )}"
              placeholder="https://..."
            />


            <div class="toolbar">

              <button
                data-save-step
              >
                Save Step
              </button>

              <button
                data-delete-step
                class="danger"
              >
                Delete Step
              </button>

            </div>

            <div
              data-step-status
              class="status"
            ></div>

          </div>

        </div>
      `).join("")
      : `
        <div class="panel">
          <p class="muted">
            No steps yet.
          </p>
        </div>
      `;


  container
    .querySelectorAll(
      "[data-save-step]"
    )
    .forEach(button => {

      button.onclick =
        async () => {

          const panel =
            button.closest(
              "[data-step-id]"
            );

          const stepId =
            panel.dataset.stepId;

          const status =
            panel.querySelector(
              "[data-step-status]"
            );

          try {

            const payload = {
              step_type:
                panel.querySelector(
                  "[data-step-type]"
                ).value,

              lesson_id:
                panel.querySelector(
                  "[data-step-lesson]"
                ).value || null,

              dialogue_line_id:
                panel.querySelector(
                  "[data-step-dialogue]"
                ).value || null,

              prompt_native:
                panel.querySelector(
                  "[data-step-native]"
                ).value.trim() || null,

              prompt_target:
                panel.querySelector(
                  "[data-step-target]"
                ).value.trim() || null,

              media_url:
                panel.querySelector(
                  "[data-step-media]"
                ).value.trim() || null,

              updated_at:
                new Date().toISOString()
            };

            const {
              error
            } = await sb
              .from("quest_steps")
              .update(payload)
              .eq(
                "id",
                stepId
              );

            if (error) throw error;

            status.innerHTML = `
              <strong class="success">
                Step saved.
              </strong>
            `;

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
    });


  container
    .querySelectorAll(
      "[data-delete-step]"
    )
    .forEach(button => {

      button.onclick =
        async () => {

          const panel =
            button.closest(
              "[data-step-id]"
            );

          const stepId =
            panel.dataset.stepId;

          if (
            !confirm(
              "Delete this Quest Step?"
            )
          ) {
            return;
          }

          const {
            error
          } = await sb
            .from("quest_steps")
            .delete()
            .eq(
              "id",
              stepId
            );

          if (error) {
            alert(error.message);
            return;
          }

          panel.remove();
        };
    });
}
