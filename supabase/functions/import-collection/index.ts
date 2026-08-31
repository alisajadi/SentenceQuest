import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const adminClient = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeWord(word: string) {
  return word.trim().toLowerCase().replace(/\s+/g, " ");
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization");

  if (!auth?.startsWith("Bearer ")) {
    throw new Error("Missing authorization");
  }

  const token = auth.replace("Bearer ", "").trim();

  const { data: userData, error: userError } =
    await adminClient.auth.getUser(token);

  if (userError || !userData.user) {
    throw new Error("Invalid session");
  }

  const { data: profile, error: profileError } =
    await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

  if (profileError || profile?.role !== "admin") {
    throw new Error("Admin access required");
  }

  return userData.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "POST required" }, 405);
  }

  try {
    await requireAdmin(req);

    const collection = await req.json();

    if (collection?.format !== "sentencequest.collection") {
      return json({
        error: "Invalid collection format",
      }, 400);
    }

    const languageData = collection.language;
    const collectionData = collection.collection;

    if (!languageData?.code || !collectionData?.slug) {
      return json({
        error: "Missing language or collection data",
      }, 400);
    }

    // -----------------------------------------------------
    // LANGUAGE
    // -----------------------------------------------------

    const { data: language, error: languageError } =
      await adminClient
        .from("languages")
        .upsert(
          {
            code: languageData.code,
            name: languageData.name,
            native_name: languageData.native_name,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "code",
          }
        )
        .select()
        .single();

    if (languageError) throw languageError;

    // -----------------------------------------------------
    // COLLECTION
    // -----------------------------------------------------

    const { data: dbCollection, error: collectionError } =
      await adminClient
        .from("collections")
        .upsert(
          {
            language_id: language.id,
            slug: collectionData.slug,
            name: collectionData.name,
            description: collectionData.description ?? null,
            version: collection.version ?? 1,
            is_published: false,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "slug",
          }
        )
        .select()
        .single();

    if (collectionError) throw collectionError;

    // -----------------------------------------------------
    // VOCABULARY
    // -----------------------------------------------------

    const vocabularyMap = new Map<string, string>();

    for (const item of collection.vocabulary ?? []) {
      const { data: vocab, error } = await adminClient
        .from("vocabulary")
        .upsert(
          {
            language_id: language.id,
            word: item.word,
            normalized_word: normalizeWord(item.word),
            part_of_speech: item.part_of_speech,
            translation: item.translation ?? null,
            pronunciation: item.pronunciation ?? null,
            level: item.level ?? null,
            definition: item.definition ?? null,
            metadata: item.metadata ?? {},
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict:
              "language_id,normalized_word,part_of_speech",
          }
        )
        .select()
        .single();

      if (error) throw error;

      vocabularyMap.set(item.id, vocab.id);

      if (item.forms) {
        for (const [formType, form] of Object.entries(item.forms)) {
          const { error: formError } = await adminClient
            .from("word_forms")
            .upsert(
              {
                vocabulary_id: vocab.id,
                form_type: formType,
                form: String(form),
              },
              {
                onConflict: "vocabulary_id,form_type",
              }
            );

          if (formError) throw formError;
        }
      }
    }

    // -----------------------------------------------------
    // GRAMMAR
    // -----------------------------------------------------

    const grammarMap = new Map<string, string>();

    for (const item of collection.grammar ?? []) {
      const { data: grammar, error } = await adminClient
        .from("grammar")
        .upsert(
          {
            language_id: language.id,
            code: item.code,
            name: item.name,
            level: item.level ?? null,
            description: item.description ?? null,
            rules: item.rules ?? {},
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "language_id,code",
          }
        )
        .select()
        .single();

      if (error) throw error;

      grammarMap.set(item.code, grammar.id);
    }

    // -----------------------------------------------------
    // PATTERNS
    // -----------------------------------------------------

    const patternMap = new Map<string, string>();

    for (const item of collection.patterns ?? []) {
      const grammarId =
        grammarMap.get(
          collection.grammar?.[0]?.code
        );

      if (!grammarId) {
        throw new Error(
          `No grammar found for pattern ${item.code}`
        );
      }

      const { data: pattern, error } = await adminClient
        .from("sentence_patterns")
        .upsert(
          {
            grammar_id: grammarId,
            code: item.code,
            name: item.name,
            slots: item.slots ?? [],
            rules: item.rules ?? {},
          },
          {
            onConflict: "grammar_id,code",
          }
        )
        .select()
        .single();

      if (error) throw error;

      patternMap.set(item.code, pattern.id);
    }

    // -----------------------------------------------------
    // LESSONS
    // -----------------------------------------------------

    const lessonIds: string[] = [];

    for (const item of collection.lessons ?? []) {
      const grammarId = item.grammar_code
        ? grammarMap.get(item.grammar_code)
        : null;

      const patternId = item.pattern_code
        ? patternMap.get(item.pattern_code)
        : null;

      const { data: lesson, error } = await adminClient
        .from("lessons")
        .upsert(
          {
            language_id: language.id,
            grammar_id: grammarId ?? null,
            pattern_id: patternId ?? null,
            slug: item.slug,
            title: item.title,
            level: item.level ?? null,
            order_index: item.order_index ?? 0,
            target_sentence: item.target_sentence ?? [],
            base_xp: item.base_xp ?? 50,
            creativity_xp: item.creativity_xp ?? 20,
            hint: item.hint ?? null,
            settings: item.settings ?? {},
            is_published: false,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "slug",
          }
        )
        .select()
        .single();

      if (error) throw error;

      lessonIds.push(lesson.id);

      // Remove old lesson-word relations.
      await adminClient
        .from("lesson_words")
        .delete()
        .eq("lesson_id", lesson.id);

      const lessonWords = (item.available_words ?? [])
        .map((id: string, index: number) => ({
          lesson_id: lesson.id,
          vocabulary_id: vocabularyMap.get(id),
          sort_order: index,
        }))
        .filter((x: any) => x.vocabulary_id);

      if (lessonWords.length) {
        const { error: lwError } = await adminClient
          .from("lesson_words")
          .insert(lessonWords);

        if (lwError) throw lwError;
      }

      // Add lesson to collection.
      await adminClient
        .from("collection_items")
        .delete()
        .eq("collection_id", dbCollection.id)
        .eq("lesson_id", lesson.id);

      const { error: ciError } = await adminClient
        .from("collection_items")
        .insert({
          collection_id: dbCollection.id,
          lesson_id: lesson.id,
          sort_order: item.order_index ?? 0,
        });

      if (ciError) throw ciError;
    }

    // -----------------------------------------------------
    // COLLECTION VOCABULARY ITEMS
    // -----------------------------------------------------

    for (const item of collection.vocabulary ?? []) {
      const vocabularyId = vocabularyMap.get(item.id);

      if (!vocabularyId) continue;

      await adminClient
        .from("collection_items")
        .delete()
        .eq("collection_id", dbCollection.id)
        .eq("vocabulary_id", vocabularyId);

      const { error } = await adminClient
        .from("collection_items")
        .insert({
          collection_id: dbCollection.id,
          vocabulary_id: vocabularyId,
          sort_order: 0,
        });

      if (error) throw error;
    }

    return json({
      success: true,
      collection_id: dbCollection.id,
      collection: collectionData.slug,
      vocabulary_count: vocabularyMap.size,
      grammar_count: grammarMap.size,
      pattern_count: patternMap.size,
      lesson_count: lessonIds.length,
    });

  } catch (error) {
    console.error(error);

    return json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    }, 400);
  }
});
