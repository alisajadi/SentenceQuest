/* =========================================================
   SENTENCEQUEST — INTERACTIONS
   Dialogue / Multiple Choice / Reading
   ========================================================= */

window.SQInteractions = {

  async loadDialogueStep(step) {

    const SQ = window.SQ;

    if (!SQ) {
      throw new Error(
        "SentenceQuest bridge is not ready."
      );
    }

    const state = SQ.state;
    const sb = SQ.sb;
    const app = SQ.app;

    const aq =
      state.activeQuest;

    if (!aq) {
      return;
    }

    let lines = [];

    if (step.dialogue_line_id) {

      const {
        data,
        error
      } = await sb
        .from("dialogue_lines")
        .select("*")
        .eq(
          "id",
          step.dialogue_line_id
        )
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        lines = [data];
      }

    } else {

      const {
        data,
        error
      } = await sb
        .from("dialogue_lines")
        .select("*")
        .eq(
          "story_node_id",
          aq.quest.story_node_id
        )
        .order(
          "line_order",
          {
            ascending: true
          }
        );

      if (error) {
        throw error;
      }

      lines = data || [];
    }

    if (!lines.length) {

      app.innerHTML = `
        <div class="card quest-step-card">

          <h2>
            ${SQ.esc(
              aq.quest.title
            )}
          </h2>

          <p class="error">
            No dialogue lines found.
          </p>

          <button
            id="dialogueContinue"
          >
            Continue
          </button>

        </div>
      `;

      document.getElementById(
        "dialogueContinue"
      ).onclick =
        () =>
          window.advanceQuestStep();

      return;
    }

    aq.dialogueLines = lines;
    aq.dialogueIndex = 0;

    this.renderDialogueStep();
  },


  renderDialogueStep() {

    const SQ = window.SQ;

    const state = SQ.state;
    const app = SQ.app;

    const aq =
      state.activeQuest;

    if (!aq) {
      return;
    }

    const lines =
      aq.dialogueLines || [];

    const index =
      Number(
        aq.dialogueIndex || 0
      );

    const line =
      lines[index];

    if (!line) {

      window.advanceQuestStep();

      return;
    }

    const speaker =
      line.speaker_type === "npc"
        ? state.npc?.name ||
          "NPC"
        : line.speaker_type ===
          "player"
          ? "You"
          : "Narrator";

    const isLast =
      index >=
      lines.length - 1;

    app.innerHTML = `
      <div class="card quest-step-card">

        <div class="quest-progress">
          Step
          ${SQ.esc(
            aq.stepIndex + 1
          )}
          of
          ${SQ.esc(
            aq.steps.length
          )}
        </div>

        <div class="quest-type">
          Dialogue
        </div>

        <h2>
          ${SQ.esc(
            aq.quest.title
          )}
        </h2>

        <div class="
          dialogue-interaction
          ${
            line.speaker_type ===
            "player"
              ? "player"
              : ""
          }
        ">

          <div class="speaker">
            ${SQ.esc(speaker)}
          </div>

          <div class="bubble">

            <div class="dialogue-text">
              ${SQ.esc(
                line.target_text
              )}
            </div>

            ${
              line.native_translation
                ? `
                  <div class="translation">
                    ${SQ.esc(
                      line.native_translation
                    )}
                  </div>
                `
                : ""
            }

            ${
              line.audio_url
                ? `
                  <audio
                    controls
                    src="${SQ.esc(
                      line.audio_url
                    )}"
                  ></audio>
                `
                : ""
            }

          </div>

        </div>

        <div class="dialogue-progress">
          ${SQ.esc(
            index + 1
          )}
          /
          ${SQ.esc(
            lines.length
          )}
        </div>

        <div class="toolbar">

          <button
            id="dialogueNext"
          >
            ${
              isLast
                ? "Finish Dialogue"
                : "Continue"
            }
          </button>

          <button
            id="dialogueBack"
            class="secondary"
          >
            Back to Story
          </button>

        </div>

      </div>
    `;

    document.getElementById(
      "dialogueNext"
    ).onclick =
      () => {

        if (isLast) {

          window.advanceQuestStep();

          return;
        }

        aq.dialogueIndex =
          index + 1;

        this.renderDialogueStep();
      };

    document.getElementById(
      "dialogueBack"
    ).onclick =
      () => {

        state.activeQuest =
          null;

        window.goToStoryView();
      };
  },


  renderMultipleChoiceStep(
    step
  ) {

    const SQ = window.SQ;

    const state = SQ.state;
    const app = SQ.app;

    const aq =
      state.activeQuest;

    let data = {};

    try {
      data =
        typeof step.interaction_data ===
        "string"
          ? JSON.parse(
              step.interaction_data
            )
          : (
              step.interaction_data ||
              {}
            );
    } catch {
      data = {};
    }

    const question =
      data.question ||
      step.prompt_target ||
      "Choose the correct answer.";

    const options =
      Array.isArray(data.options)
        ? data.options
        : [];

    if (!options.length) {

      app.innerHTML = `
        <div class="card quest-step-card">

          <h2>
            ${SQ.esc(
              aq.quest.title
            )}
          </h2>

          <p class="error">
            This multiple-choice step has no options.
          </p>

        </div>
      `;

      return;
    }

    app.innerHTML = `
      <div class="card quest-step-card">

        <div class="quest-progress">
          Step
          ${SQ.esc(
            aq.stepIndex + 1
          )}
          of
          ${SQ.esc(
            aq.steps.length
          )}
        </div>

        <div class="quest-type">
          Multiple Choice
        </div>

        <h2>
          ${SQ.esc(
            aq.quest.title
          )}
        </h2>

        <div class="instruction">
          ${SQ.esc(question)}
        </div>

        <div
          id="multipleChoiceOptions"
        >
          ${options
            .map(
              (option, index) => `
                <button
                  class="mcq-option"
                  data-mcq-index="${index}"
                >
                  ${SQ.esc(
                    option.text
                  )}
                </button>
              `
            )
            .join("")}
        </div>

        <div
          id="mcqFeedback"
        ></div>

        <button
          id="mcqBack"
          class="secondary"
        >
          Back to Story
        </button>

      </div>
    `;

    const buttons =
      document.querySelectorAll(
        "[data-mcq-index]"
      );

    buttons.forEach(
      (button) => {

        button.onclick =
          async () => {

            buttons.forEach(
              (item) => {
                item.disabled =
                  true;
              }
            );

            const index =
              Number(
                button.dataset.mcqIndex
              );

            const selected =
              options[index];

            const feedback =
              document.getElementById(
                "mcqFeedback"
              );

            if (
              selected?.correct
            ) {

              feedback.innerHTML = `
                <div class="feedback correct">
                  <strong>
                    Correct!
                  </strong>
                </div>
              `;

              setTimeout(
                () =>
                  window.advanceQuestStep(),
                700
              );

            } else {

              feedback.innerHTML = `
                <div class="feedback incorrect">
                  <strong>
                    Not quite.
                  </strong>
                  Try again.
                </div>
              `;

              setTimeout(
                () => {

                  buttons.forEach(
                    (item) => {
                      item.disabled =
                        false;
                    }
                  );

                },
                500
              );
            }
          };
      }
    );

    document.getElementById(
      "mcqBack"
    ).onclick =
      () => {

        state.activeQuest =
          null;

        window.goToStoryView();
      };
  }
};
