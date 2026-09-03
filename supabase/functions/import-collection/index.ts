import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(req: Request) {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("Missing authorization token.");
  const token = header.slice(7);

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid authentication session.");

  const { data: profile, error: profileError } = await db
    .from("profiles").select("role").eq("id", data.user.id).maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (profile?.role !== "admin") throw new Error("Admin access required.");
  return data.user;
}

function normalizedWord(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isObject(value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "POST required." }, 405);

  try {
    await requireAdmin(req);
    const body = await req.json();

    if (body?.format !== "sentencequest.collection") {
      throw new Error("Invalid collection format.");
    }

    const languageData = body.language;
    const collectionData = body.collection;

    if (!languageData?.code || !languageData?.name) {
      throw new Error("language.code and language.name are required.");
    }
    if (!collectionData?.slug || !collectionData?.name) {
      throw new Error("collection.slug and collection.name are required.");
    }

    const { data: language, error: languageError } = await db
      .from("languages")
      .upsert({
        code: String(languageData.code),
        name: String(languageData.name),
        native_name: languageData.native_name ?? null,
        is_active: true,
      }, { onConflict: "code" })
      .select()
      .single();

    if (languageError) throw languageError;

    // IMPORT NEVER changes collection version or publication state.
    // New collections use the table defaults: version=1, is_published=false.
    const { data: existingCollection, error: existingCollectionError } = await db
      .from("collections")
      .select("id,version,is_published")
      .eq("slug", String(collectionData.slug))
      .maybeSingle();

    if (existingCollectionError) throw existingCollectionError;

    const collectionPayload: Record<string, unknown> = {
      language_id: language.id,
      slug: String(collectionData.slug),
      name: String(collectionData.name),
      description: collectionData.description ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data: collection, error: collectionError } = await db
      .from("collections")
      .upsert(collectionPayload, { onConflict: "slug" })
      .select()
      .single();

    if (collectionError) throw collectionError;

    const vocabularyMap = new Map<string, string>();

    for (const item of body.vocabulary ?? []) {
      if (!item?.id || !item?.word || !item?.part_of_speech) {
        throw new Error("Invalid vocabulary item.");
      }

      const { data: vocabulary, error } = await db
        .from("vocabulary")
        .upsert({
          language_id: language.id,
          word: String(item.word),
          normalized_word: normalizedWord(String(item.word)),
          part_of_speech: String(item.part_of_speech),
          translation: item.translation ?? null,
          pronunciation: item.pronunciation ?? null,
          level: item.level ?? null,
          definition: item.definition ?? null,
          image_url: item.image_url ?? null,
          audio_url: item.audio_url ?? null,
          metadata: isObject(item.metadata) ? item.metadata : {},
          is_active: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "language_id,normalized_word,part_of_speech",
        })
        .select()
        .single();

      if (error) throw error;
      vocabularyMap.set(String(item.id), vocabulary.id);

      if (isObject(item.forms)) {
        for (const [formType, formValue] of Object.entries(item.forms)) {
          const { error: formError } = await db
            .from("word_forms")
            .upsert({
              vocabulary_id: vocabulary.id,
              form_type: formType,
              form: String(formValue),
            }, { onConflict: "vocabulary_id,form_type" });
          if (formError) throw formError;
        }
      }
    }

    const grammarMap = new Map<string, string>();

    for (const item of body.grammar ?? []) {
      if (!item?.code || !item?.name) throw new Error("Invalid grammar item.");

      const { data: grammar, error } = await db
        .from("grammar")
        .upsert({
          language_id: language.id,
          code: String(item.code),
          name: String(item.name),
          level: item.level ?? null,
          description: item.description ?? null,
          rules: isObject(item.rules) ? item.rules : {},
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "language_id,code" })
        .select()
        .single();

      if (error) throw error;
      grammarMap.set(String(item.code), grammar.id);
    }

    const patternMap = new Map<string, string>();

    for (const item of body.patterns ?? []) {
      if (!item?.code || !item?.name) throw new Error("Invalid pattern item.");

      const grammarCode = item.grammar_code ?? body.grammar?.[0]?.code;
      const grammarId = grammarMap.get(String(grammarCode));
      if (!grammarId) throw new Error(`Grammar not found for pattern: ${item.code}`);

      const { data: pattern, error } = await db
        .from("sentence_patterns")
        .upsert({
          grammar_id: grammarId,
          code: String(item.code),
          name: String(item.name),
          slots: Array.isArray(item.slots) ? item.slots : [],
          rules: isObject(item.rules) ? item.rules : {},
        }, { onConflict: "grammar_id,code" })
        .select()
        .single();

      if (error) throw error;
      patternMap.set(String(item.code), pattern.id);
    }

    let lessonCount = 0;

    for (const item of body.lessons ?? []) {
      if (!item?.slug || !item?.title) throw new Error("Invalid lesson item.");

      const grammarId = item.grammar_code
        ? grammarMap.get(String(item.grammar_code)) ?? null
        : null;
      const patternId = item.pattern_code
        ? patternMap.get(String(item.pattern_code)) ?? null
        : null;

      // IMPORT NEVER overwrites is_published/version.
      const lessonPayload: Record<string, unknown> = {
        language_id: language.id,
        grammar_id: grammarId,
        pattern_id: patternId,
        slug: String(item.slug),
        title: String(item.title),
        level: item.level ?? null,
        order_index: Number(item.order_index ?? 0),
        target_sentence: Array.isArray(item.target_sentence) ? item.target_sentence : [],
        image_url: item.image_url ?? null,
        audio_url: item.audio_url ?? null,
        base_xp: Number(item.base_xp ?? 50),
        creativity_xp: Number(item.creativity_xp ?? 20),
        hint: item.hint ?? null,
        settings: isObject(item.settings)
          ? item.settings
          : { available_words: item.available_words ?? [] },
        updated_at: new Date().toISOString(),
      };

      const { data: lesson, error: lessonError } = await db
        .from("lessons")
        .upsert(lessonPayload, { onConflict: "slug" })
        .select()
        .single();

      if (lessonError) throw lessonError;
      lessonCount++;

      const { error: deleteWordsError } = await db
        .from("lesson_words").delete().eq("lesson_id", lesson.id);
      if (deleteWordsError) throw deleteWordsError;

      const lessonWords = (item.available_words ?? [])
        .map((externalId: unknown, index: number) => {
          const vocabularyId = vocabularyMap.get(String(externalId));
          if (!vocabularyId) return null;
          return {
            lesson_id: lesson.id,
            vocabulary_id: vocabularyId,
            sort_order: index,
          };
        })
        .filter(Boolean);

      if (lessonWords.length) {
        const { error } = await db.from("lesson_words").insert(lessonWords);
        if (error) throw error;
      }

      const { data: existingCollectionItem, error: collectionItemError } = await db
        .from("collection_items")
        .select("id")
        .eq("collection_id", collection.id)
        .eq("lesson_id", lesson.id)
        .is("vocabulary_id", null)
        .maybeSingle();

      if (collectionItemError) throw collectionItemError;

      const itemPayload = {
        collection_id: collection.id,
        vocabulary_id: null,
        lesson_id: lesson.id,
        sort_order: Number(item.order_index ?? 0),
      };

      if (existingCollectionItem) {
        const { error } = await db.from("collection_items")
          .update({ sort_order: itemPayload.sort_order })
          .eq("id", existingCollectionItem.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("collection_items").insert(itemPayload);
        if (error) throw error;
      }

      if (item.grammar_intro) {
        const intro = item.grammar_intro;
        const { data: existingIntro, error: introLookupError } = await db
          .from("lesson_grammar_intro")
          .select("id")
          .eq("lesson_id", lesson.id)
          .eq("sort_order", Number(intro.sort_order ?? 0))
          .maybeSingle();

        if (introLookupError) throw introLookupError;

        const introPayload = {
          lesson_id: lesson.id,
          title: intro.title ?? "Grammar",
          short_text: intro.short_text ?? null,
          detailed_text: intro.detailed_text ?? null,
          image_url: intro.image_url || null,
          audio_url: intro.audio_url || null,
          audio_duration_seconds: intro.audio_duration_seconds ?? null,
          video_url: intro.video_url || null,
          video_duration_seconds: intro.video_duration_seconds ?? null,
          sort_order: Number(intro.sort_order ?? 0),
          is_active: true,
          updated_at: new Date().toISOString(),
        };

        if (existingIntro) {
          const { error } = await db.from("lesson_grammar_intro")
            .update(introPayload).eq("id", existingIntro.id);
          if (error) throw error;
        } else {
          const { error } = await db.from("lesson_grammar_intro").insert(introPayload);
          if (error) throw error;
        }
      }
    }

    for (const item of body.vocabulary ?? []) {
      const vocabularyId = vocabularyMap.get(String(item.id));
      if (!vocabularyId) continue;

      const { data: existingItem, error: lookupError } = await db
        .from("collection_items")
        .select("id")
        .eq("collection_id", collection.id)
        .eq("vocabulary_id", vocabularyId)
        .is("lesson_id", null)
        .maybeSingle();

      if (lookupError) throw lookupError;

      if (existingItem) {
        const { error } = await db.from("collection_items")
          .update({ sort_order: 0 }).eq("id", existingItem.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("collection_items").insert({
          collection_id: collection.id,
          vocabulary_id: vocabularyId,
          lesson_id: null,
          sort_order: 0,
        });
        if (error) throw error;
      }
    }

    return json({
      success: true,
      collection: collection.slug,
      collection_id: collection.id,
      collection_version: existingCollection?.version ?? collection.version,
      is_published: existingCollection?.is_published ?? collection.is_published,
      vocabulary_count: vocabularyMap.size,
      grammar_count: grammarMap.size,
      pattern_count: patternMap.size,
      lesson_count: lessonCount,
      database_version_changed: false,
    });
  } catch (error) {
    console.error("IMPORT ERROR:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});
