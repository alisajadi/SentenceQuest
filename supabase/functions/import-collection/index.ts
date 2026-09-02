const { data: existingLessonItem } =
  await db
    .from("collection_items")
    .select("id")
    .eq(
      "collection_id",
      collection.id
    )
    .eq(
      "lesson_id",
      lesson.id
    )
    .maybeSingle();

if (existingLessonItem) {

  const {
    error:
      updateCollectionLessonError,
  } = await db
    .from("collection_items")
    .update({
      sort_order:
        item.order_index ??
        0,
      vocabulary_id:
        null,
    })
    .eq(
      "id",
      existingLessonItem.id
    );

  if (
    updateCollectionLessonError
  ) {
    throw updateCollectionLessonError;
  }

} else {

  const {
    error:
      insertCollectionLessonError,
  } = await db
    .from("collection_items")
    .insert({
      collection_id:
        collection.id,

      lesson_id:
        lesson.id,

      vocabulary_id:
        null,

      sort_order:
        item.order_index ??
        0,
    });

  if (
    insertCollectionLessonError
  ) {
    throw insertCollectionLessonError;
  }
}
