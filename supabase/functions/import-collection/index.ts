import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",

  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};


function reply(
  data: unknown,
  status = 200
) {

  return new Response(
    JSON.stringify(data),
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


const supabaseUrl =
  Deno.env.get("SUPABASE_URL")!;


const serviceRoleKey =
  Deno.env.get(
    "SUPABASE_SERVICE_ROLE_KEY"
  )!;


const db =
  createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );


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
      "Missing authorization"
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
      "Invalid session"
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
      .single();


  if (
    profileError ||
    profile?.role !== "admin"
  ) {

    throw new Error(
      "Admin access required"
    );
  }


  return data.user;
}


function normalizeWord(
  word: string
) {

  return word
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      " "
    );
}


Deno.serve(
  async (req) => {

    if (
      req.method ===
      "OPTIONS"
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
      req.method !==
      "POST"
    ) {

      return reply(
        {
          success: false,
          error:
            "POST required",
        },
        405
      );
    }


    try {

      /* =====================================================
         AUTH
      ===================================================== */

      await requireAdmin(
        req
      );


      /* =====================================================
         READ JSON
      ===================================================== */

      const data =
        await req.json();


      if (
        data?.format !==
        "sentencequest.collection"
      ) {

        throw new Error(
          'Invalid collection format. Expected "sentencequest.collection".'
        );
      }


      const languageData =
        data.language;


      const collectionData =
        data.collection;


      if (
        !languageData?.code
      ) {

        throw new Error(
          "Missing language.code"
        );
      }


      if (
        !collectionData?.slug
      ) {

        throw new Error(
          "Missing collection.slug"
        );
      }


      /* =====================================================
         LANGUAGE
      ===================================================== */

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
                languageData.native_name,

              is_active:
                true,
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


      /* =====================================================
         COLLECTION
      ===================================================== */

      const {
        data: collection,
        error: collectionError,
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
                data.version ??
                1,

              is_published:
                collectionData.publish === true,
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


      /* =====================================================
         VOCABULARY
      ===================================================== */

      const vocabularyMap =
        new Map<
          string,
          string
        >();


      for (
        const item
        of data.vocabulary ?? []
      ) {

        if (
          !item?.id ||
          !item?.word ||
          !item?.part_of_speech
        ) {

          throw new Error(
            "Vocabulary item is missing id, word or part_of_speech."
          );
        }


        const {
          data: vocabulary,
          error,
        } =
          await db
            .from(
              "vocabulary"
            )
            .upsert(
              {
                language_id:
                  language.id,

                word:
                  item.word,

                normalized_word:
                  normalizeWord(
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

                is_active:
                  true,
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


        /* WORD FORMS */

        if (
          item.forms
        ) {

          for (
            const [
              type,
              form
            ]
            of Object.entries(
              item.forms
            )
          ) {

            const {
              error:
                formError,
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
                      type,

                    form:
                      String(form),
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


      /* =====================================================
         GRAMMAR
      ===================================================== */

      const grammarMap =
        new Map<
          string,
          string
        >();


      for (
        const item
        of data.grammar ?? []
      ) {

        if (
          !item?.code
        ) {

          throw new Error(
            "Grammar item is missing code."
          );
        }


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

                is_active:
                  true,
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


      /* =====================================================
         PATTERNS
      ===================================================== */

      const patternMap =
        new Map<
          string,
          string
        >();


      for (
        const item
        of data.patterns ?? []
      ) {

        if (
          !item?.code
        ) {

          throw new Error(
            "Pattern item is missing code."
          );
        }


        const grammarCode =
          item.grammar_code ??
          data.grammar?.[0]?.code;


        const grammarId =
          grammarMap.get(
            grammarCode
          );


        if (!grammarId) {

          throw new Error(
            `Grammar not found for pattern ${item.code}`
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
                  item.slots ??
                  [],

                rules:
                  item.rules ??
                  {},
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


      /* =====================================================
         LESSONS
      ===================================================== */

      let lessonCount =
        0;


      for (
        const item
        of data.lessons ?? []
      ) {

        if (
          !item?.slug ||
          !item?.title
        ) {

          throw new Error(
            "Lesson is missing slug or title."
          );
        }


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


        const targetSentence =
          item.target_sentence ??
          [];


        const {
          data: lesson,
          error,
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
                  targetSentence,

                base_xp:
                  item.base_xp ??
                  50,

                creativity_xp:
                  item.creativity_xp ??
                  20,

                hint:
                  item.hint ??
                  null,

                settings:
                  {},

                is_published:
                  item.publish === true,
              },
              {
                onConflict:
                  "slug",
              }
            )
            .select()
            .single();


        if (error)
          throw error;


        lessonCount++;


        /* ===================================================
           LESSON WORDS
        =================================================== */

        const {
          error:
            deleteLessonWordsError,
        } =
          await db
            .from(
              "lesson_words"
            )
            .delete()
            .eq(
              "lesson_id",
              lesson.id
            );


        if (
          deleteLessonWordsError
        ) {

          throw deleteLessonWordsError;
        }


        const lessonWords =
          (
            item.available_words ??
            []
          )
            .map(
              (
                jsonId: string,
                index: number
              ) => {

                const vocabularyId =
                  vocabularyMap.get(
                    jsonId
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
              (
                x:
                  | {
                      lesson_id: string;
                      vocabulary_id: string;
                      sort_order: number;
                    }
                  | null
              ): x is {
                lesson_id: string;
                vocabulary_id: string;
                sort_order: number;
              } =>
                x !== null
            );


        if (
          lessonWords.length
        ) {

          const {
            error:
              lessonWordsError,
          } =
            await db
              .from(
                "lesson_words"
              )
              .insert(
                lessonWords
              );


          if (
            lessonWordsError
          ) {

            throw lessonWordsError;
          }
        }


        /* ===================================================
           COLLECTION → LESSON
        =================================================== */

        const {
          error:
            collectionLessonError,
        } =
          await db
            .from(
              "collection_items"
            )
            .upsert(
              {
                collection_id:
                  collection.id,

                lesson_id:
                  lesson.id,

                vocabulary_id:
                  null,

                sort_order:
                  item.order_index ??
                  0,
              },
              {
                onConflict:
                  "collection_id,lesson_id",
              }
            );


        if (
          collectionLessonError
        ) {

          throw collectionLessonError;
        }
      }


      /* =====================================================
         COLLECTION → VOCABULARY
      ===================================================== */

      for (
        const item
        of data.vocabulary ?? []
      ) {

        const vocabularyId =
          vocabularyMap.get(
            item.id
          );


        if (
          !vocabularyId
        ) {
          continue;
        }


        const {
          error,
        } =
          await db
            .from(
              "collection_items"
            )
            .upsert(
              {
                collection_id:
                  collection.id,

                vocabulary_id:
                  vocabularyId,

                lesson_id:
                  null,

                sort_order:
                  0,
              },
              {
                onConflict:
                  "collection_id,vocabulary_id",
              }
            );


        if (error)
          throw error;
      }


      /* =====================================================
         RESULT
      ===================================================== */

      return reply({

        success:
          true,

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

    } catch (
      error
    ) {

      console.error(
        error
      );


      return reply(
        {
          success:
            false,

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
