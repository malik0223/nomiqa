-- ============================================================
-- قوالب الأسطح البصرية
-- ------------------------------------------------------------
-- ثمانية قوالب جديدة تختلف في **شخصيتها البصرية** لا في بنيتها.
-- كلٌّ منها صفٌّ هنا لا مكوّن في الشيفرة (§4.4): الحقل الجديد
-- `surface` في تعريف القالب يختار مدخلاً من جدول الأنماط في
-- packages/ui/src/card/surfaces.ts.
--
-- القوالب الثلاثة الأولى (classic/minimal/bold) تبقى بلا `surface`،
-- ومعناه `flat` — أي سلوك المحرك قبل هذه المهاجرة حرفياً. لا لقطة
-- منشورة تتغيّر.
--
-- `supportsCover` صحيح في «زجاج» وحده: هو القالب الذي يجعل الغلاف
-- خلفية البطاقة كلها. بقية الأسطح لا تستعمل الغلاف، وعرضه خياراً في
-- المحرر ثم تجاهله عند النشر وعدٌ كاذب للمستخدم.
-- ============================================================

INSERT INTO "templates" ("key", "name", "name_en", "latest_version", "is_active", "created_at")
VALUES
    ('aurora',    'الشفق',  'Aurora',    1, true, now()),
    ('glass',     'زجاج',   'Glass',     1, true, now()),
    ('neon',      'نيون',   'Neon',      1, true, now()),
    ('bento',     'بنتو',   'Bento',     1, true, now()),
    ('relief',    'نحت',    'Relief',    1, true, now()),
    ('editorial', 'صحيفة',  'Editorial', 1, true, now()),
    ('foil',      'رقاقة',  'Foil',      1, true, now()),
    ('spatial',   'فضاء',   'Spatial',   1, true, now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "template_versions" ("template_key", "version", "definition", "created_at")
VALUES
    ('aurora', 1, '{"layout":"centered","sections":["identity","actions","links"],"supportsCover":false,"surface":"aurora","theme":{"primaryColor":"#7C3AED","borderRadius":"large","colorScheme":"dark"}}', now()),
    ('glass', 1, '{"layout":"centered","sections":["identity","actions","links"],"supportsCover":true,"surface":"glass","theme":{"primaryColor":"#6820AA","borderRadius":"large","colorScheme":"dark"}}', now()),
    ('neon', 1, '{"layout":"start","sections":["identity","actions","links"],"supportsCover":false,"surface":"neon","theme":{"primaryColor":"#A855F7","borderRadius":"small","colorScheme":"dark"}}', now()),
    ('bento', 1, '{"layout":"start","sections":["identity","actions","links"],"supportsCover":false,"surface":"bento","theme":{"primaryColor":"#8B5CF6","borderRadius":"large","colorScheme":"dark"}}', now()),
    ('relief', 1, '{"layout":"centered","sections":["identity","actions","links"],"supportsCover":false,"surface":"relief","theme":{"primaryColor":"#7C5CF0","borderRadius":"large","colorScheme":"light"}}', now()),
    ('editorial', 1, '{"layout":"start","sections":["identity","actions","links"],"supportsCover":false,"surface":"editorial","theme":{"primaryColor":"#6820AA","borderRadius":"small","colorScheme":"light"}}', now()),
    ('foil', 1, '{"layout":"start","sections":["identity","actions","links"],"supportsCover":false,"surface":"foil","theme":{"primaryColor":"#C9A765","borderRadius":"medium","colorScheme":"dark"}}', now()),
    ('spatial', 1, '{"layout":"centered","sections":["identity","actions","links"],"supportsCover":false,"surface":"spatial","theme":{"primaryColor":"#6366F1","borderRadius":"large","colorScheme":"dark"}}', now())
ON CONFLICT ("template_key", "version") DO NOTHING;
