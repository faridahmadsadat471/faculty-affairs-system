# د Backend د اوسني کار لارښود

د ۲۰۲۶/۱۱/۲۴ کار: Faculty Delete او Search، ترفیعات، قراردادونه، څېړنې، جایزې، راپورونه، شخصي PDF اسناد او امنیتي ازموینې.

تایید شوې پایلې: تازه `npm test` کې ۱۸۵ ازموینې بریالۍ او صفر ناکامې دي. لومړني Postman Collection په ګډ Run کې ۷۹ assertions تېرې کړې؛ د حساب، پاسورډ او Audit نوې برخې په Postman کې ۲۲ نورې assertions تېرې کړې. نوی Collection ټول ۱۳ requests لري. Backup/Restore د جلا MongoDB database، اصلي BSON ډولونو، indexes، PDF فایلونو او خرابو/ناسمو بیکاپونو سره ازمویل شوی. دا local ازموینې دي؛ د پوهنتون اداري تایید او د production د چاپېریال تنظیم جلا دي.

## ۱. پروژه چالانول

په PowerShell کې:

```powershell
cd E:\faculty-affairs-mern\backend
npm run dev
```

MongoDB Community Server باید چالان وي. موجود `.env` خپل پټ معلومات لري؛ GitHub ته یې مه پورته کوئ. د `.env.example` تش JWT_SECRET یوازې نمونه ده؛ د خپل موجود secret ارزښت مه ړنګوئ. د عادي API پته `http://localhost:5000/api` ده. `GET /api/health` باید `200` ورکړي.

## ۲. اتومات او Postman ازموینې

```powershell
npm test
npm run postman:build
npm run postman:server
```

وروستی command د ازموینو سرور په `http://127.0.0.1:5001` چالانوي. دا د اصلي پوهنتون له database څخه جلا، په تصادفي نوم موقتي database او موقتي uploads directory کاروي. سرور یوازې په همدې کمپیوټر اوري. ازمایښتي administrator او د هغه ښکاره fixture password یوازې همدې موقتي database ته جوړېږي؛ دا د اصلي پروژې حساب نه دی.

په Postman کې تازه `backend/postman/faculty-affairs.postman_collection.json` Import کړئ. که پخوانی Collection موجود وي، د همدې ازمایښتي Collection نوې نسخه وکاروئ. د `Faculty Affairs Backend Verification` Collection لپاره **Run** ووهئ او ټول ۱۳ requests په ترتیب چالان کړئ. هر module خپله login کوي او خپلې ازمایښتي شمېرې جوړوي؛ د JWT کاپي کولو ته اړتیا نشته. د `Tests` script دننه `pm.sendRequest` اصلي API غوښتنې کوي، او پایلې په `Test Results` او Runner کې ښکاري. یوازې د اصلي health request شین 200 د ټول module بریا نه ده؛ ټولې assertions باید شنې وي.

دا Collection په 5001 د ازموینو لپاره دی. په اصلي database یې مه چلوئ. د 5000 خپل حسابونه او معلومات عادي، لاسي requests سره ازمایلای شئ. کله چې موقتي سرور بند شي، ازمایښتي معلومات نور د کارولو لپاره مه ساتئ؛ بل ځل Collection له login څخه بیا وچلوئ. د API اتومات tests خپل database په پای کې پاکوي.

## ۳. د فولډرونو او فایلونو کار

- `src/models/`: Mongoose schema، د معلوماتو ډولونه، اړیکې، index او د نېټو شرطونه.
- `src/routes/`: URL او HTTP method له مناسب controller سره نښلوي؛ لومړی authentication او validation اجرا کوي.
- `src/controllers/`: د request اصلي کار، workflow او HTTP response.
- `src/services/`: د faculty پر اساس د لاسرسي ګډ منطق. د څانګې نوم له database اخلي، له request څخه یې نه مني.
- `src/validators/`: یوازې اجازه لرونکي fields، معتبر IDs، enum، نېټې او pagination مني.
- `src/middleware/`: authentication، roles، errors او د ډېرو هڅو مخنیوی.
- `src/utils/`: کوچني بیا کارېدونکي کارونه، لکه literal search او خوندي HTTP errors.
- `src/config/db.js`: موجود local MongoDB connection.
- `src/app.js`: ټولې routes او middleware نښلوي.
- `src/server.js`: secret چک کوي، database نښلوي، د ټولو models indexes چمتو کوي او سرور چالانوي.
- `uploads/private/`: د عادي سرور شخصي PDF فایلونه؛ public static route نه لري او Git یې له upload څخه باسي.
- `tests/`: حقیقي HTTP او local MongoDB integration tests.
- `test-support/`: یوازې د ازموینو server، accounts او PDF fixture.
- `postman/suites/`: د هر module د Postman بشپړ test script.
- `scripts/build-postman.js`: د همدې scripts څخه import کېدونکی Collection جوړوي.

`record.controller.js` د څلورو اړوندو modules ګډ Create/List/Get/Update/Archive کار کوي. ځانګړي controllers بیا د خپل module قواعد پلي کوي. `record-fields.js` هر record ته تاریخچه او `deletedAt` ورزیاتوي. `optimisticConcurrency` د یو وخت دوو بدلونونو څخه د یوه د پټ له منځه تلو مخنیوی کوي؛ دوهم request ته `409` راځي.

## ۴. Faculty Delete او Search

```http
DELETE /api/faculty/:id
GET /api/faculty?search=Farid&department=Computer%20Science&academicRank=lecturer&employmentStatus=active&page=1&limit=20
```

Delete یوازې `system_admin` کولای شي. دا **آرشیف** دی: `deletedAt` ثبتوي، عادي list/get/update یې نه ښيي، خو د ترفیع، قرارداد او نورو سابقه نه ړنګوي. تړلی User هم نه حذف کوي. پخوانی employeeId او User link د سابقې لپاره نیول شوي پاتې کېږي. عادي routes د آرشیف د بېرته راوستلو یا permanent delete امکان نه لري.

Search د نوم، employeeId او email په متن کې لټون کوي. `.*` د عادي متن په توګه ګڼي. فلټر د صلاحیت حدود نه پراخوي. `page` لږ تر لږه ۱ او `limit` له ۱ تر ۱۰۰ دی.

## ۵. د ټولو اړوندو modules ګډ APIs

`/api/promotions`، `/api/contracts`، `/api/research` او `/api/awards` دا ګډ methods لري:

```http
POST   /api/MODULE
GET    /api/MODULE?page=1&limit=20&faculty=FACULTY_ID&search=text&status=STATUS
GET    /api/MODULE/:id
PATCH  /api/MODULE/:id
DELETE /api/MODULE/:id
```

یوازې اړین query parameters ولېږئ. `faculty` هماغه Faculty document `_id` دی، User ID نه دی. List ځواب `records` او `pagination` لري؛ single/create/update ځواب `record` لري. د Promotion search په requestedRank کې لټون کوي، نور modules په title کې. په awards کې `status` د `award` یا `achievement` لپاره دی.

Admin او staff ټول غیرآرشیف معلومات ویني؛ manager د خپلې تړلې څانګې، او faculty member یوازې د خپل تړلي profile معلومات ویني. بې profile manager ته `403` راځي. د بل faculty معلومات یا د هغه records ته عموماً `404` راځي، څو معلومات افشا نه شي. د ټولو modules Archive یوازې administrator کوي.

`createdBy`، status، reviewer، history، deletedAt او د فایل storageKey په create/update Body کې مه لېږئ؛ سرور یې ټاکي. ټولې نېټې په `YYYY-MM-DD` بڼه ولېږئ. اضافي یا نامعلوم fields `400` راګرځوي.

## ۶. ترفیعات

```http
POST /api/promotions
```

```json
{ "faculty": "FACULTY_ID", "requestedRank": "senior_lecturer" }
```

`currentRank` د Faculty له رسمي profile راځي. نوې رتبه باید لوړه وي. څلور supported ranks: `lecturer`, `senior_lecturer`, `associate_professor`, `professor`.

```http
PATCH /api/promotions/:id/status
```

دا bodies په ترتیب، هر یو جلا request کې ولېږئ:

```json
{ "status": "submitted" }
```

```json
{
  "status": "under_review",
  "eligibilityStatus": "eligible",
  "eligibilityNotes": "Documents and institutional criteria verified"
}
```

```json
{
  "status": "approved",
  "reviewNotes": "Approved after review",
  "effectiveDate": "2027-01-01"
}
```

د رد لپاره وروستی status `rejected` او دلیل په `reviewNotes` کې وي. Faculty او manager خپل حدودو کې مسوده/سپارل کوي؛ ارزونه او پرېکړه admin/staff کوي. څوک خپله faculty ترفیع نه شي ارزولی. تایید شوې ترفیع باید `eligible` وي او effectiveDate ولري. صلاحیت د انسان له خوا د پوهنتون د قواعدو مطابق ارزول کېږي؛ سیستم نامعلوم قانون نه اټکلوي.

یوازې مسوده edit کېږي. پرېکړې وروستۍ دي؛ د appeal/resubmission ځانګړی بهیر لا نه شته. Approval رسمي Faculty academicRank په اتومات نه بدلوي، ځکه effectiveDate راتلونکې هم کېدای شي. رسمي رتبه د مؤثرې پرېکړې پر اساس په موجود Faculty PATCH تازه کېږي؛ راتلونکی scheduler پکې نشته.

## ۷. قراردادونه

```json
{
  "faculty": "FACULTY_ID",
  "contractNumber": "CON-2026-001",
  "title": "Lecturer appointment",
  "startDate": "2026-01-01",
  "endDate": "2026-12-31",
  "renewalReminderDate": "2026-12-01",
  "notes": "Appointment details"
}
```

POST `/api/contracts` ته دغه body ولېږئ. یوازې admin/staff قرارداد جوړوي، بدلوي او تمدیدوي. `endDate` له startDate مخکې نه شي راتلای؛ reminder له پای وروسته نه شي راتلای.

د `PATCH /api/contracts/:id/status` لپاره لومړی `{"status":"pending"}`، بیا `{"status":"approved","reviewNotes":"Reviewed and approved"}` یا rejected ولېږئ. یوازې draft edit کېږي؛ څوک خپل faculty قرارداد نه شي تاییدولی.

د تمدید لپاره `POST /api/contracts/:id/renew` ته نوی contractNumber، title، startDate، endDate او اختیاري reminder/notes ولېږئ؛ faculty مه ورکوئ. نوی قرارداد له تایید شوي پخواني قرارداد سره په `renewedFrom` تړل کېږي. د تمدید پیل باید د پخواني قرارداد له پای وروسته وي. یو قرارداد یوازې یو مستقیم تمدید لري؛ راتلونکی تمدید د نوي تایید شوي قرارداد څخه جوړېږي.

## ۸. څېړنې او خپرونې

```json
{
  "faculty": "FACULTY_ID",
  "title": "University research study",
  "researchType": "journal_article",
  "abstract": "Study summary",
  "coAuthors": [{ "fullName": "Second Author", "affiliation": "University" }],
  "publicationVenue": "Journal name",
  "doi": "10.1234/example",
  "publicationUrl": "https://example.org/publication",
  "keywords": ["education"]
}
```

POST `/api/research` ته یې ولېږئ. اختیاري fields چې نه لرئ، مه یې لېږئ. researchType د `research_paper`, `journal_article`, `book`, `conference_paper` څخه وي. URL یوازې http/https مني. coAuthors تر ۵۰ او keywords تر ۳۰ پورې دي.

`PATCH /api/research/:id/status` په ترتیب `submitted`، `accepted`، بیا `published` کېږي. د وروستي body نمونه `{"status":"published","publicationDate":"2026-01-01"}` ده. Publication date راتلونکې نه شي کېدای. Faculty/manager سپارل کوي؛ admin/staff منل او خپرېدل ثبتوي. Reviewer خپله faculty څېړنه نه شي تاییدولی. edit یوازې draft کې کېږي.

## ۹. جایزې او لاسته راوړنې

```json
{
  "faculty": "FACULTY_ID",
  "title": "Teaching award",
  "awardType": "award",
  "awardingOrganization": "University",
  "dateReceived": "2026-01-01",
  "description": "Award details",
  "referenceNumber": "AW-001"
}
```

POST `/api/awards` ته یې ولېږئ. رسمي `award` یوازې admin/staff ثبتوي؛ awardingOrganization اړین دی. `achievement` لپاره سازمان اختیاري دی او faculty/manager یې په خپل scope کې ثبتولی شي. استاد د رسمي award د title/type/documents بدلولو اجازه نه لري. نېټه راتلونکې نه شي کېدای.

## ۱۰. راپورونه

```http
GET /api/reports/summary
GET /api/reports/summary?from=2026-01-01&to=2026-12-31
GET /api/reports/contracts/expiring?days=30&page=1&limit=20
GET /api/reports/faculty.csv
```

Summary د څانګې/رتبې/استخدام شمېر، promotions statuses، contracts statuses، راتلونکو ۳۰ ورځو کې پای ته رسېدونکي قراردادونه، رسېدلي reminders، research status/type او award/achievement شمېر لري. د date filter معنا: Faculty/Promotion د createdAt، Contract د startDate، Research د publicationDate، Award د dateReceived له مخې. د نېټې لرونکي Research راپور کې بې publicationDate مسودې نه شمېرل کېږي.

Expiration یوازې تایید شوي او په ورکړل شوو ورځو کې ختمېدونکي قراردادونه ښيي. Reminder یو راپور دی؛ email، SMS او اتومات scheduler پکې نشته. CSV یوازې مجاز Faculty پنځه اصلي columns ورکوي، تر ۱۰۰۰۰ قطارونو پورې؛ د ډېر export لپاره نېټې محدودې کړئ.

## ۱۱. شخصي PDF اسناد

```http
POST /api/documents/faculty/FACULTY_ID
POST /api/documents/promotions/PROMOTION_ID
POST /api/documents/contracts/CONTRACT_ID
POST /api/documents/research/RESEARCH_ID
POST /api/documents/awards/AWARD_ID
```

Postman Body → **form-data** کې:

- `title`: Text؛ د سند نوم.
- `file`: File؛ تر ۲MB پورې PDF.

Content-Type په لاس مه ټاکئ؛ Postman دې boundary جوړ کړي. په Authorization کې یوازې Bearer Token وټاکئ. د JSON login ځواب بشپړ په token field کې مه کاپي کوئ.

ځواب `document._id` لري. د download لپاره د هماغه upload URL وروسته `/{document._id}` ورزیات کړئ او GET واستوئ. download هم token غواړي او د attachment په ډول راځي. په هر record کې تر ۲۰ فایلونو اجازه ده. د workflow اسناد یوازې draft کې پورته کېږي. د قرارداد او رسمي award اسناد یوازې admin/staff پورته کوي. خپل profile ته استاد PDF پورته کولی شي؛ د profile رسمي fields اوس هم یوازې admin/staff بدلوي.

فایل په تصادفي UUID نوم ذخیره کېږي؛ د کاروونکي filename د disk لاره نه جوړوي. header/end marker، MIME او extension چک کېږي. دا د PDF بشپړ parser یا د ویروس سکین نه دی؛ د production د خپرولو مخکې د پوهنتون د antivirus او backup تګلاره وټاکئ. فایلونه public static نه دي، inline نه خلاصیږي، او secrets په ځوابونو کې نه راځي. آرشیف فایل نه ړنګوي؛ د رسمي سوابقو د ساتلو تګلاره جلا ده.

## ۱۲. امنیت او عام errors

- JWT: نوې ناسته د وخت له امله نه ختمېږي؛ د login ځواب `expiresIn: null` لري. signature/issuer/audience، د حساب اوسنی حالت او tokenVersion لا هم چک کېږي. Logout سمدستي token لغوه کوي؛ د دې ناستې د لغوه کولو hash په database کې بې له پای نېټې ساتل کېږي، څو بیا فعال نه شي. د پاسورډ، role یا isActive بدلون هم پخوانۍ ناستې بندوي.
- د Frontend اتومات وتلو timer لرې شوی؛ د فورم ډکولو پر مهال یوازې د وخت تېرېدل فورم نه بندوي. پخوانی ۱۵ دقیقې token خپله پخوانۍ موده لري؛ له دې بدلون وروسته یو ځل Logout او بیا Login وکړئ. دا بدلون draft نه ساتي؛ Refresh، د پاڼې پرېښودل یا د tab بندول ناثبت شوي معلومات ضایع کولی شي. په شریک کمپیوټر کې له کار وروسته Logout وکړئ.
- هر request د database اوسنی role/isActive اخلي؛ د Body role باور نه کېږي.
- Login/register: په یوه IP تر ۱۰۰ غوښتنو/۱۵ دقیقو؛ upload تر ۳۰/۱۵ دقیقو. له حد وروسته `429` او `Retry-After` راځي. دا limiter د یوه local Node process لپاره دی؛ د څو process/server لپاره shared store غواړي.
- CORS: یوازې configured frontend origin؛ Postman چې Origin نه لېږي کار کوي. CORS د authentication بدیل نه دی.
- JSON تر ۱MB او PDF تر ۲MB محدود دي؛ لوی request ته `413` راځي.
- `400`: ناسم Body/query/date/ID؛ `401`: token نشته/ناسم/expired/revoked؛ `403`: صلاحیت نشته؛ `404`: record نشته یا د کاروونکي scope کې نه دی؛ `409`: تکراري identifier، ناسم workflow یا concurrent change؛ `500`: داخلي ستونزه، پرته له رازونو.

د Header invalid character تېروتنې لپاره token field پاک کړئ او یوازې د accessToken دننه متن په یوه کرښه کې ورکړئ. quotes، `accessToken:`، `Bearer` لفظ او اضافي نوې کرښې مه ورزیاتوئ؛ Postman د Bearer ډول سره دا prefix پخپله جوړوي. د نوي Collection scripts دا کار اتومات کوي.

## د کار حدود

د نن کار Backend APIs او ازموینې دي. Frontend لا نه دی پیل شوی. د ترفیع قانوني eligibility، د بیاکتنې/appeal بهیر، د documents retention، د backup مهالویش او د production د نشر تګلاره د پوهنتون ځوابونو ته پاتې دي. مرکزي Audit Log، د حسابونو او پاسورډ مدیریت او کوډ شوی Backup/Restore اوس هم جوړ شوي؛ تشریح یې لاندې ده.

## ۱۳. د کاروونکو مدیریت

یوازې system_admin دا APIs کاروي:

```http
POST /api/users
GET /api/users/:id
PATCH /api/users/:id
POST /api/users/:id/password-reset
```

د نوي حساب نمونه:

```json
{
  "fullName": "New Staff",
  "email": "staff@example.org",
  "password": "ChooseYourOwnStrongPassword!",
  "role": "directorate_staff",
  "isActive": true
}
```

PATCH یوازې fullName، email، role او د JSON boolean په ډول isActive مني. د رول یا email بدلون، بندول او بېرته فعالول پخواني JWTs بندوي؛ کاروونکی بیا login کوي. وروستی فعال Admin نه شي بندېدای یا عادي رول ته ښکته کېدای. د هممهاله admin بدلونونو ساتنه د همدې یوه Node process په دننه کې ده؛ د څو process/server لپاره distributed lock یا د MongoDB transaction ډیزاین پکار دی. اوسنی local server یو process دی.

د حساب او Faculty د تړلو لپاره په موجود `POST /api/faculty` یا `PATCH /api/faculty/:id` کې `user` ته د حساب id ورکړئ. یو حساب یوازې یو Faculty profile سره تړل کېږي. حسابونه له database څخه نه حذفېږي؛ د بندولو لپاره `{"isActive":false}` وکاروئ.

## ۱۴. پاسورډ بدلول او بېرته ټاکل

Login شوی کاروونکی `POST /api/auth/change-password` ته دا body ورکوي:

```json
{
  "currentPassword": "YourCurrentPassword",
  "newPassword": "YourNewStrongPassword!"
}
```

نوی پاسورډ لږ تر لږه ۱۲ توري او تر ۷۲ UTF-8 bytes پورې وي. پاسورډ trim نه کېږي. د بریالي بدلون وروسته ټولې ناستې بندېږي؛ له نوي پاسورډ سره بیا login وکړئ.

د هېر شوي پاسورډ لپاره Admin، د حساب خاوند تر هویت تایید وروسته، `POST /api/users/:id/password-reset` ته تش body `{}` لېږي. ځواب یوازې یو ځل `resetToken` او expiresAt ښيي. دا د ۱۵ دقیقو کوډ دی؛ database یوازې SHA-256 hash ساتي. کوډ په منظور شوي خصوصي چینل خاوند ته ورکړئ؛ په عام chat، log، GitHub یا Word پوښتنلیک کې یې مه لیکئ. email/SMS لېږل نه دي جوړ شوي؛ چینل به پوهنتون ټاکي.

د حساب خاوند `POST /api/auth/reset-password` ته body `{"token":"THE_RECOVERY_TOKEN","newPassword":"YourNewStrongPassword!"}` لېږي. دا endpoint د پخواني JWT غوښتنه نه کوي. کوډ یوازې یو ځل کار کوي؛ نوی کوډ پخوانی لغوه کوي. له reset وروسته ټول زاړه JWTs بندېږي. د پخوانیو نسخو له version پرته token یوازې د نه‌بدل شوي حساب د version صفر لپاره د خپل لنډ عمر تر پای معتبر دی.

## ۱۵. مرکزي Audit Log

```http
GET /api/audit-logs?page=1&limit=20
GET /api/audit-logs?resource=users&resourceId=USER_ID&outcome=succeeded
GET /api/audit-logs?actor=USER_ID&from=2026-01-01&to=2026-12-31
```

یوازې Admin یې ویني. د ثبت، login/logout، پاسورډ، User، Faculty، ترفیع، قرارداد، څېړنې، جایزې او upload بدلونونه actor، resource، requestId، نېټه، HTTP status او outcome لري. د role/isActive، څانګې، رتبې او workflow ځینې پخواني او نوي ارزښتونه هم ثبتېږي. پاسورډونه، passwordHash، JWT، recovery token، سندونه او د request بشپړ body نه ثبتېږي. Logs د API له لارې نه بدلېږي او نه حذفېږي.

`started` له بدلون مخکې ثبتېږي؛ بریالی ځواب مخکې له `succeeded` ثبتېدو نه لېږل کېږي. که Audit storage له پیل څخه بند وي، عملیات په `503` درېږي. که اصلي بدلون وشي خو وروستی audit تایید ناکام شي، ځواب `503` وایي عملیات ښايي ترسره شوي وي؛ له بیا لېږلو مخکې معلومات Reload کړئ. نیمګړې `started` پېښې د مسؤول له خوا د معلوماتو سره پرتله او وڅېړئ. دا د standalone MongoDB لپاره write-ahead ثبت دی، څو-document transaction یا له database administrator څخه tamper-proof ذخیره نه ده. د ساتنې موده او ځانګړي امنیتي اصول به پوهنتون وټاکي.

## ۱۶. کوډ شوی Backup او خوندي Restore

دا CLI کار دی؛ عام HTTP backup endpoint نه لري. ټول API processes، Postman test server او نور database writers بند کړئ. دا د standalone MongoDB یو offline منطقي بیکاپ دی، oplog یا point-in-time recovery نه لري. CLI په configured PORT او 5001 کې د چالان سرور په شتون کې کار ردوي، خو د نورو MongoDB clients بندول د چلونکي مسؤولیت دی.

لومړی یو ځل key جوړ کړئ:

```powershell
npm run backup:init-key
```

دا `backend/.backup-key` جوړوي. ارزښت یې مه چاپوئ. د شخصي لاسرسي په فولډر کې یې وساتئ او جلا خوندي کاپي یې ولرئ. Windows کې د فولډر د لاسرسي اجازه اداره وټاکي؛ د key ساتل یوازې د فایل نوم په پټولو نه بشپړېږي. key او backups د Git له خوا ignore کېږي. بدیل key file د BACKUP_KEY_FILE له لارې ټاکل کېدای شي؛ key باید ۳۲ bytes وي. که key ورک شي، کوډ شوی backup نه شي پرانیستل کېدای.

```powershell
npm run backup -- --offline
```

په `backend/backups/` کې نوی `.fabak` جوړوي. database documents د BSON دقیق ډولونو سره، collection options، indexes او private PDF فایلونه په gzip او AES-256-GCM کې ساتي. `.env`، JWT_SECRET، backup key، uploads څخه بهر فایلونه او د MongoDB server-level accounts/configuration پکې نه شاملېږي. دا توکي د ادارې په جلا خوندي تګلاره وساتئ.

Restore تل نوي database او نوي uploads folder ته کېږي:

```powershell
npm run restore -- "E:\faculty-affairs-mern\backend\backups\YOUR_BACKUP.fabak" faculty_affairs_restore_trial "E:\faculty-affairs-mern\backend\restored-uploads\trial" --offline
```

د نوي database نوم باید `faculty_affairs_restore_` سره پیل شي؛ database باید خالي وي او uploads folder باید لا نه وي موجود. د اوسني database پر سر restore نه کېږي. فایل مخکې له هرې database لیکنې بشپړ authentication چک تېروي. Restore د اسنادو checksum او شمېرې هم چک کوي. په بېرته راوستل شوو حسابونو کې زاړه JWTs او recovery کوډونه بندېږي.

تر Restore وروسته شمېرې، indexes، login او اسناد په جلا چاپېریال کې تایید کړئ. یوازې د مسؤول تر پرېکړې وروسته خپل MONGO_URI او UPLOAD_DIR نوي ځای ته تنظیم کړئ. ابزار `.env` په اتومات نه بدلوي او اصلي database نه ړنګوي. د کار سرعت، د منلو وړ معلوماتو ضایع او د بیکاپ مهالویش د پوهنتون له ځوابونو وروسته ټاکل کېږي. د عام server service، MongoDB permissions او production نشر تنظیم لا د ټاکل شوي چاپېریال مطابق کېږي.
