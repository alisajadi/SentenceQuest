import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

const supabaseUrl =
  Deno.env.get("SUPABASE_URL")!;

const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const db = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function response(
  body: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );
}

async function requireAdmin(
  req: Request
) {
  const auth =
    req.headers.get(
      "Authorization"
    );

  if (
    !auth ||
    !auth.startsWith("Bearer ")
  ) {
    throw new Error(
      "Missing authorization token."
    );
  }

  const token =
    auth.substring(7);

  const {
    data,
    error,
  } =
    await db.auth.getUser(
      token
    );

  if (
    error ||
    !data.user
  ) {
    throw new Error(
      "Invalid authentication session."
    );
  }

  const {
    data: profile,
    error: profileError,
  } =
    await db
      .from("profiles")
      .select("role")
      .eq(
        "id",
        data.user.id
      )
      .maybeSingle();

  if (profileError) {
    throw new Error(
      profileError.message
    );
  }

  if (
    profile?.role !== "admin"
  ) {
    throw new Error(
      "Admin access required."
    );
  }

  return data.user;
}

function normalizedWord(
  value: string
) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

Deno.serve(
  async (req) => {

    if (
      req.method === "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers:
            corsHeaders,
        }
      );
    }

    if (
      req.method !== "POST"
    ) {
      return response(
        {
          success: false,
          error:
            "POST required.",
        },
        405
      );
    }

    try {

      await requireAdmin(req);

      const json =
        await req.json();

      if (
        json?.format !==
        "sentencequest.collection"
      ) {
        throw new Error(
          "Invalid collection format."
        );
      }

      const languageData =
        json.language;

      const collectionData =
        json.collection;

      if (
        !languageData?.code
      ) {
        throw new Error(
          "Missing language.code."
        );
      }

      if (
        !collectionData?.slug
      ) {
        throw new Error(
          "Missing collection.slug."
        );
      }

      /*
       * LANGUAGE
       */

      const {
        data: language,
        error: languageError,
      } =
        await db
          .from("languages")
          .upsert(
            {
              code:
                languageData.code,

              name:
                languageData.name,

              native_name:
                languageData.native_name ??
                null,

              is_active: true,
            },
            {
              onConflict:
                "code",
            }
          )
          .select()
          .single();

      if (languageError)
        throw languageError;

      /*
       * COLLECTION
       */

      const {
        data: collection,
        error:
          collectionError,
      } =
        await db
          .from("collections")
          .upsert(
            {
              language_id:
                language.id,

              slug:
                collectionData.slug,

              name:
                collectionData.name,

              description:
                collectionData.description ??
                null,

              version:
                json.version ??
                1,

              is_published: false,
            },
            {
              onConflict:
                "slug",
            }
          )
          .select()
          .single();

      if (collectionError)
        throw collectionError;

      /*
       * VOCABULARY MAP
       */

      const vocabularyMap =
        new Map();

      /*
       * VOCABULARY
       */

      for (
        const item of
        json.vocabulary ?? []
      ) {

        if (
          !item.id ||
          !item.word ||
          !item.part_of_speech
        ) {
          throw new Error(
            "Invalid vocabulary item."
          );
        }

        const {
          data: vocabulary,
          error,
        } =
          await db
            .from("vocabulary")
            .upsert(
              {
                language_id:
                  language.id,

                word:
                  item.word,

                normalized_word:
                  normalizedWord(
                    item.word
                  ),

                part_of_speech:
                  item.part_of_speech,

                translation:
                  item.translation ??
                  null,

                pronunciation:
                  item.pronunciation ??
                  null,

                level:
                  item.level ??
                  null,

                definition:
                  item.definition ??
                  null,

                metadata:
                  item.metadata ??
                  {},

                is_active: true,
              },
              {
                onConflict:
                  "language_id,normalized_word,part_of_speech",
              }
            )
            .select()
            .single();

        if (error)
          throw error;

        vocabularyMap.set(
          item.id,
          vocabulary.id
        );

        /*
         * WORD FORMS
         */

        if (
          item.forms &&
          typeof item.forms ===
            "object"
        ) {

          for (
            const [
              formType,
              formValue,
            ] of Object.entries(
              item.forms
            )
          ) {

            const {
              error: formError,
            } =
              await db
                .from(
                  "word_forms"
                )
                .upsert(
                  {
                    vocabulary_id:
                      vocabulary.id,

                    form_type:
                      formType,

                    form:
                      String(
                        formValue
                      ),
                  },
                  {
                    onConflict:
                      "vocabulary_id,form_type",
                  }
                );

            if (formError)
              throw formError;
          }
        }
      }

      /*
       * GRAMMAR
       */

      const grammarMap =
        new Map();

      for (
        const item of
        json.grammar ?? []
      ) {

        const {
          data: grammar,
          error,
        } =
          await db
            .from("grammar")
            .upsert(
              {
                language_id:
                  language.id,

                code:
                  item.code,

                name:
                  item.name,

                level:
                  item.level ??
                  null,

                description:
                  item.description ??
                  null,

                rules:
                  item.rules ??
                  {},
              },
              {
                onConflict:
                  "language_id,code",
              }
            )
            .select()
            .single();

        if (error)
          throw error;

        grammarMap.set(
          item.code,
          grammar.id
        );
      }

      /*
       * PATTERNS
       */

      const patternMap =
        new Map();

      for (
        const item of
        json.patterns ?? []
      ) {

        const grammarId =
          grammarMap.get(
            item.grammar_code ??
            json.grammar?.[0]?.code
          );

        if (!grammarId) {
          throw new Error(
            "Grammar not found for pattern: " +
            item.code
          );
        }

        const {
          data: pattern,
          error,
        } =
          await db
            .from(
              "sentence_patterns"
            )
            .upsert(
              {
                grammar_id:
                  grammarId,

                code:
                  item.code,

                name:
                  item.name,

                slots:
                  item.slots ?? [],

                rules:
                  item.rules ?? {},
              },
              {
                onConflict:
                  "grammar_id,code",
              }
            )
            .select()
            .single();

        if (error)
          throw error;

        patternMap.set(
          item.code,
          pattern.id
        );
      }

      /*
       * LESSONS
       */

      let lessonCount = 0;

      for (
        const item of
        json.lessons ?? []
      ) {

        const grammarId =
          item.grammar_code
            ? grammarMap.get(
                item.grammar_code
              )
            : null;

        const patternId =
          item.pattern_code
            ? patternMap.get(
                item.pattern_code
              )
            : null;

        const {
          data: lesson,
          error:
            lessonError,
        } =
          await db
            .from("lessons")
            .upsert(
              {
                language_id:
                  language.id,

                grammar_id:
                  grammarId,

                pattern_id:
                  patternId,

                slug:
                  item.slug,

                title:
                  item.title,

                level:
                  item.level ??
                  null,

                order_index:
                  item.order_index ??
                  0,

                target_sentence:
                  item.target_sentence ??
                  [],

                base_xp:
                  item.base_xp ??
                  50,

                creativity_xp:
                  item.creativity_xp ??
                  20,

                hint:
                  item.hint ??
                  null,

                is_published:
                  false,
              },
              {
                onConflict:
                  "slug",
              }
            )
            .select()
            .single();

        if (lessonError)
          throw lessonError;

        lessonCount++;

        /*
         * LESSON WORDS
         */

        await db
          .from("lesson_words")
          .delete()
          .eq(
            "lesson_id",
            lesson.id
          );

        const lessonWords =
          (
            item.available_words ??
            []
          )
            .map(
              (
                externalId: string,
                index: number
              ) => {

                const vocabularyId =
                  vocabularyMap.get(
                    externalId
                  );

                if (
                  !vocabularyId
                ) {
                  return null;
                }

                return {
                  lesson_id:
                    lesson.id,

                  vocabulary_id:
                    vocabularyId,

                  sort_order:
                    index,
                };
              }
            )
            .filter(
              Boolean
            );

        if (
          lessonWords.length
        ) {

          const {
            error,
          } =
            await db
              .from(
                "lesson_words"
              )
              .insert(
                lessonWords
              );

          if (error)
            throw error;
        }

        /*
         * COLLECTION → LESSON
         */

        const {
          data: existingLesson,
        } =
          await db
            .from(
              "collection_items"
            )
            .select(
              "collection_id,lesson_id,vocabulary_id"
            )
            .eq(
              "collection_id",
              collection.id
            )
            .eq(
              "lesson_id",
              lesson.id
            )
            .is(
              "vocabulary_id",
              null
            )
            .maybeSingle();

        if (existingLesson) {

          const {
            error,
          } =
            await db
              .from(
                "collection_items"
              )
              .update({
                sort_order:
                  item.order_index ??
                  0,
              })
              .eq(
                "collection_id",
                collection.id
              )
              .eq(
                "lesson_id",
                lesson.id
              )
              .is(
                "vocabulary_id",
                null
              );

          if (error)
            throw error;

        } else {

          const {
            error,
          } =
            await db
              .from(
                "collection_items"
              )
              .insert({
                collection_id:
                  collection.id,

                vocabulary_id:
                  null,

                lesson_id:
                  lesson.id,

                sort_order:
                  item.order_index ??
                  0,
              });

          if (error)
            throw error;
        }

        /*
         * GRAMMAR INTRO
         */

        if (
          item.grammar_intro
        ) {

          const intro =
            item.grammar_intro;

          const {
            data:
              existingIntro,
          } =
            await db
              .from(
                "lesson_grammar_intro"
              )
              .select("id")
              .eq(
                "lesson_id",
                lesson.id
              )
              .eq(
                "sort_order",
                0
              )
              .maybeSingle();

          const introData = {
            lesson_id:
              lesson.id,

            title:
              intro.title ??
              "Grammar",

            short_text:
              intro.short_text ??
              null,

            detailed_text:
              intro.detailed_text ??
              null,

            image_url:
              intro.image_url ??
              null,

            audio_url:
              intro.audio_url ??
              null,

            video_url:
              intro.video_url ??
              null,

            audio_duration_seconds:
              intro.audio_duration_seconds ??
              null,

            video_duration_seconds:
              intro.video_duration_seconds ??
              null,

            sort_order: 0,

            is_active: true,

            version: 1,
          };

          if (
            existingIntro
          ) {

            const {
              error,
            } =
              await db
                .from(
                  "lesson_grammar_intro"
                )
                .update(
                  introData
                )
                .eq(
                  "id",
                  existingIntro.id
                );

            if (error)
              throw error;

          } else {

            const {
              error,
            } =
              await db
                .from(
                  "lesson_grammar_intro"
                )
                .insert(
                  introData
                );

            if (error)
              throw error;
          }
        }
      }

      /*
       * COLLECTION → VOCABULARY
       */

      for (
        const item of
        json.vocabulary ?? []
      ) {

        const vocabularyId =
          vocabularyMap.get(
            item.id
          );

        if (!vocabularyId)
          continue;

        const {
          data:
            existingVocabulary,
        } =
          await db
            .from(
              "collection_items"
            )
            .select(
              "collection_id,lesson_id,vocabulary_id"
            )
            .eq(
              "collection_id",
              collection.id
            )
            .eq(
              "vocabulary_id",
              vocabularyId
            )
            .is(
              "lesson_id",
              null
            )
            .maybeSingle();

        if (
          existingVocabulary
        ) {

          const {
            error,
          } =
            await db
              .from(
                "collection_items"
              )
              .update({
                sort_order: 0,
              })
              .eq(
                "collection_id",
                collection.id
              )
              .eq(
                "vocabulary_id",
                vocabularyId
              )
              .is(
                "lesson_id",
                null
              );

          if (error)
            throw error;

        } else {

          const {
            error,
          } =
            await db
              .from(
                "collection_items"
              )
              .insert({
                collection_id:
                  collection.id,

                vocabulary_id:
                  vocabularyId,

                lesson_id:
                  null,

                sort_order: 0,
              });

          if (error)
            throw error;
        }
      }

      return response({
        success: true,

        collection:
          collectionData.slug,

        vocabulary_count:
          vocabularyMap.size,

        grammar_count:
          grammarMap.size,

        pattern_count:
          patternMap.size,

        lesson_count:
          lessonCount,
      });

    } catch (error) {

      console.error(
        "IMPORT ERROR:",
        error
      );

      return response(
        {
          success: false,

          error:
            error instanceof Error
              ? error.message
              : String(error),
        },
        400
      );
    }
  }
);
