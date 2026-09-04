# Life World Layer — Migration Guide

این راهنما توضیح می‌دهد چه چیزی اضافه شده، چرا، و چطور آن را روی پروژه‌ی فعلی (که خودم از فایل zip شما خواندم) اعمال کنید.

## چیزی که در کد فعلی شما از قبل درست ساخته شده بود
بعد از خواندن کامل `schema.sql`، هر سه Edge Function (`import-collection`, `publish-collection`, `sync-database`) و `admin.js`، این‌ها را دیدم:

- سیستم import/publish/versioning کاملاً کار می‌کند (نسخه‌ی دیتابیس، `sync_changes`، `app_release`، `checksum`).
- موتور جمله‌سازی (`lessons` + `lesson_words` + `valid_sentences`) از قبل دقیقاً همان چیزی است که سند طراحی برای «Creativity Reward» (بخش ۶) می‌خواست — `valid_sentences.is_approved` همان جمله‌های جایگزین تأییدشده است.
- یک فایل اضافه/ناقص وجود دارد: `supabase/functions/publish/Index.ts` که فقط یک proxy ۵۴ خطی به سمت `publish-collection` است. کارکرد اضافه‌ای ندارد؛ می‌توانید حذفش کنید یا نگه دارید، ضرری ندارد.

## چیزی که اضافه کردم و چرا
سند طراحی (Life World / Branching Story / Calendar / Quest) مفاهیمی می‌خواست که در schema شما وجود نداشت. **به‌جای بازنویسی موتور یادگیری**، یک لایه‌ی روایت/دنیا روی آن گذاشتم:

| فایل جدید | نقش |
|---|---|
| `supabase/schema/02_life_world.sql` | جدول‌های جدید: `destinations`, `locations`, `npcs`, `story_nodes`, `story_choices`, `quests`, `quest_steps`, `dialogue_lines`, `user_time_state`, `calendar_events`, `cultural_calendar_events`, `user_preferences`, `user_story_progress`, `user_story_choices_made`, `user_quest_progress` — با RLS دقیقاً به سبک خود شما (`is_admin()`, public read روی is_published/is_active). |
| `supabase/functions/import-quest-pack/index.ts` | Edge Function جدید (مثل `import-collection`) برای ایمپورت محتوای دنیای زندگی: مقصد، مکان‌ها، NPCها، گراف شاخه‌ای داستان، Questها، خطوط دیالوگ، مناسبت‌های فرهنگی. |
| `admin/admin.js` + `admin/index.html` + `admin/admin.css` | بخش «Life World» به ناوبری ادمین اضافه شد: مشاهده‌ی جدول‌های جدید + صفحه‌ی «Import Quest Pack». کدهای قبلی شما دست‌نخورده باقی مانده‌اند. |
| `collections/questpack-us-day1-travel.json` | نمونه‌ی محتوای واقعی: آژانس مسافرتی → فرودگاه → هتل، با یک Quest که به همان `a1-food-001` (Lesson موجود شما) وصل می‌شود. |

### تصمیم طراحی کلیدی
`quest_steps.lesson_id` و `dialogue_lines.lesson_id` مستقیماً به جدول `lessons` شما اشاره می‌کنند. یعنی:
- منطق ساخت جمله، Drag & Drop، امتیاز XP پایه/خلاقیت (`base_xp`/`creativity_xp`) و تأیید جمله‌های جایگزین (`valid_sentences`) **همان چیزی است که دارید** — فقط حالا داخل یک Quest و یک موقعیت داستانی (مکان + NPC + روز + زمان روز) قرار می‌گیرد.
- این یعنی کالکشن‌های فعلی شما (مثل `a1-food-present-simple-001.json`) بدون تغییر همچنان کار می‌کنند؛ Quest Pack فقط رویشان لایه‌ی روایت می‌کشد.

## ترتیب اجرا (روی یک پروژه‌ی Supabase موجود)

1. اگر روی دیتابیس فعلی داده دارید، بک‌آپ بگیرید (Supabase Dashboard → Database → Backups، یا `pg_dump`).
2. در SQL Editor، فایل `supabase/schema/02_life_world.sql` را اجرا کنید (فایل اصلی `schema.sql` را **اصلاً لمس نکنید** — این فایل additive است و کاملاً idempotent، یعنی اجرای دوباره‌اش هم مشکلی ایجاد نمی‌کند).
3. Edge Function جدید را دیپلوی کنید:
   ```
   supabase functions deploy import-quest-pack
   ```
4. فایل‌های `admin/index.html`, `admin/admin.js`, `admin/admin.css` را جایگزین نسخه‌ی فعلی‌تان کنید (همان دامنه/هاست فعلی).
5. وارد پنل ادمین شوید → منوی «Life World» → «Import Quest Pack» → فایل `questpack-us-day1-travel.json` را آپلود کنید.
   - **پیش‌نیاز:** کالکشن `a1-food-present-simple-001.json` باید از قبل Import شده باشد (چون Quest Pack به `lesson_slug: "a1-food-001"` نیاز دارد).

## چیزی که هنوز عمداً نساختم (قدم بعدی)

1. **انتشار (Publish) لایه‌ی دنیای زندگی.** الان `import-quest-pack` محتوا را فقط به‌صورت Draft می‌نویسد (`is_published=false`), دقیقاً مثل رفتار `import-collection`. برای انتشار واقعی باید یا:
   - `publish-collection` را طوری گسترش دهیم که `story_nodes`/`quests` مرتبط با یک کالکشن را هم منتشر کند، یا
   - یک تابع مستقل `publish-quest-pack` بسازیم که همان الگوی version bump + `sync_changes` را برای جدول‌های جدید تکرار کند.
   این را عمداً در همین مرحله نساختم چون به تصمیم شما درباره‌ی نحوه‌ی ترکیب نسخه‌بندی محتوای زبانی و محتوای دنیای زندگی بستگی دارد (یک شماره نسخه مشترک، یا دو شماره‌ی جدا).

2. **Real Date vs Life Date در سمت کلاینت.** جدول `user_time_state` آماده است، اما منطق «چه زمانی `life_date` جلو برود» (بر اساس ورود کاربر / زمان واقعی / ترکیبی) باید در اپ Flutter/کلاینت پیاده شود؛ این فقط یک تصمیم دیتابیسی نیست.

3. **Quest Engine پیشرفته‌تر (قفل/باز شدن Questها، پیش‌نیازها).** فعلاً `user_quest_progress.status` ساده است (`locked/available/in_progress/completed`)، ولی قانون این‌که «چه زمانی یک Quest از locked به available برود» هنوز جایی تعریف نشده — پیشنهاد من: یک ستون `unlocks_after_quest_id` روی `quests` در تکرار بعدی.

4. **شخصی‌سازی رفتاری واقعی.** جدول `user_preferences` و ستون‌های `requires_preference_key/value` روی `story_choices` آماده‌اند، اما تصمیم این‌که این ترجیحات از کجا استنتاج شوند (رفتار کاربر در بازی) هنوز باز است — طبق سند طراحی باید غیرمستقیم باشد، نه پرسش مستقیم.

## Story Graph (ادیتور بصری نودها) — جدید

داخل پنل ادمین، منوی «Life World → Story Graph (visual)» یک بومِ درگ‌اند‌دراپ است:

- **+ Add Node**: نود جدید (کد، عنوان، نوع، مکان، NPC، روز، زمانِ روز، توضیحات، Start/Published) — مستقیم در `story_nodes` ذخیره می‌شود.
- **Connect Nodes**: حالت اتصال را فعال می‌کند؛ روی نود مبدأ کلیک کنید، بعد روی نود مقصد، بعد متن انتخاب (choice_text) را وارد کنید — یک ردیف در `story_choices` ساخته می‌شود. همین یعنی «چندراهی» داستان.
- کشیدن یک نود، موقعیتش را در ستون‌های جدید `story_nodes.editor_x` / `editor_y` ذخیره می‌کند (فقط برای چیدمان بصری، تأثیری در گیم‌پلی ندارد).
- کلیک روی یک اتصال (خط بین دو نود) آن را برای ویرایش/حذف انتخاب می‌کند.
- کلیک روی هر نود، دو دکمه‌ی «View Quests Here» و «View Dialogue Here» دارد که مستقیم Quest ها/دیالوگ‌های همان نود را نشان می‌دهد.
- تیک **Published** روی هر نود/Quest به‌جای سیستم انتشار رسمی (که هنوز نساخته‌ایم) فعلاً همان چیزی است که تعیین می‌کند بازیکن آن محتوا را می‌بیند یا نه (به‌خاطر RLS). یعنی الان «Publish» یعنی همین تیک را بزنید.

⚠️ **نکته‌ی مهم درباره‌ی تداخل:** در `schema.sql` اصلی شما یک بلوک هست که همه‌ی Policyهای اسکیمای public را قبل از بازسازی پاک می‌کند (`drop policy ... loop`). اگر روزی `schema.sql` اصلی را دوباره اجرا کنید، Policyهای جدولِ لایه‌ی Life World هم پاک می‌شوند (چون آن‌ها را نمی‌شناسد) و دسترسی به آن‌ها قفل می‌شود. **راه‌حل:** هر بار که `schema.sql` اصلی را دوباره اجرا کردید، بلافاصله بعدش `02_life_world.sql` را هم دوباره اجرا کنید (کاملاً بی‌خطر و idempotent است).

## فرانت بازی (Gameplay Prototype) — جدید

پوشه‌ی `game/` یک صفحه‌ی وب کاملاً مستقل و ساده است (بدون فریم‌ورک) که مستقیم به همان Supabase وصل می‌شود و کل زنجیره را تست می‌کند:

ورود/ثبت‌نام → انتخاب اولین Destination فعال → ساخت خودکار `user_time_state` و `user_story_progress` (اگر نبود) → نمایش نود شروع (مکان + NPC + دیالوگ) → اگر Quest داشت، بازی جمله‌سازی (Word Bank + Sentence Builder، دقیقاً با موتور `lessons`/`lesson_words`/`valid_sentences` موجود شما) → امتیاز (XP دقیق یا امتیاز خلاقانه) → اگر چندراهی بود، انتخاب مسیر → روز جلو می‌رود و در `calendar_events` ثبت می‌شود → تب Calendar کل تاریخچه‌ی زندگی کاربر را نشان می‌دهد.

یک Policy کوچک هم اضافه کردم (داخل همان `02_life_world.sql`) که به بازیکن‌های عادی اجازه می‌دهد جمله‌های نادرست را به‌عنوان «پیشنهاد» برای بازبینی ادمین در `valid_sentences` ثبت کنند (قبلاً فقط ادمین اجازه‌ی insert داشت).

### برای تست کامل نیاز دارید:
1. کالکشن `a1-food-present-simple-001.json` را Import کرده باشید (Import).
2. همان کالکشن را از صفحه‌ی «Publish / Sync» منتشر کرده باشید (وگرنه `lessons.is_published=false` است و بازیکن آن را نمی‌بیند).
3. `questpack-us-day1-travel.json` را از «Import Quest Pack» ایمپورت کرده باشید.
4. در «Story Graph»، نود `day1_travel_agency` را باز کنید، **Published** را تیک بزنید و ذخیره کنید؛ همین کار را برای `day1_airport` هم انجام دهید (چون Quest اصلی آنجاست). اگر نخواستید بروید جلوتر، `day1_hotel` را هم منتشر کنید.
5. حالا `game/index.html` را باز کنید، یک حساب بسازید (Create account) یا وارد شوید، و بازی کنید.

### میزبانی
`game/` را کنار `admin/` روی همان هاست استاتیک فعلی‌تان بگذارید (مثلاً `yourdomain.com/game/`). چون از تگ‌های `<script>` ساده استفاده می‌کند (نه ماژول)، بازکردن مستقیم فایل هم معمولاً کار می‌کند، ولی برای جلوگیری از مشکلات احتمالی مرورگر با فایل‌های local، بهتر است از یک static server ساده سرو شود.
