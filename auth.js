/* ============================================================
   auth.js — طبقة المصادقة والصلاحيات (مشتركة بين index.html و news.html)

   الفكرة: بدل أدوار جامدة، لكل مستخدم "مصفوفة صلاحيات" (perms)
   تحدّد ما يراه وما يعدّله في كل تبويب. الأدمن يتجاوز المصفوفة كلها.

   بنية مستند users/{uid}:
   {
     displayName, status: "active"|"pending"|"blocked",
     role: "admin" | "user",          // admin يتجاوز كل الصلاحيات
     scopePersonId,                   // عقدته في الشجرة (لتصدير "ملفي")
     perms: { tree:{view,edit,delete}, info:{...}, news:{...}, ... }
   }
   ============================================================ */

// ---------- التبويبات المعروفة (المصفوفة النهائية) ----------
// ملاحظات على المعاني الخاصة:
//   tree.view      = ظهور المشجرة
//   addSons.edit   = يضيف أبناء لعقدته فقط (باعتماد الأدمن)
//   info.view      = عند الضغط على الاسم تظهر كل البيانات
//   news.view      = يشاهد/يقرأ الأخبار · news.edit = يكتب أخبارًا (باعتماد)
//   ai.view        = يشاهد المساعد بلا كتابة · ai.edit = يكتب ويدردش
//   design.view    = يظهر تبويب اختيار التصميم واللون
//   trusted.view   = موثوق: يشاهد الأخبار غير المنشورة (المعلّقة)
//   trustedNews.edit   = ينشر بلا اعتماد + يعتمد غيره + يخفي
//   trustedAddSons.edit= يضيف أبناء بأي مكان بالمشجرة (باعتماد)
//   trustedUsers.edit  = يشاهد المستخدمين + يحظر/يعيد التفعيل فقط
const PERM_PAGES = {
  tree:           { label: "المشجرة",         actions: ["view"] },
  addSons:        { label: "إضافة أبناء",     actions: ["edit"] },
  info:           { label: "بطاقة المعلومات", actions: ["view"] },
  news:           { label: "الأخبار",          actions: ["view", "edit"] },
  search:         { label: "البحث",            actions: ["view"] },
  relation:       { label: "حاسبة القرابة",    actions: ["view"] },
  myTree:         { label: "شجرتي",            actions: ["view"] },
  ai:             { label: "المساعد الذكي",    actions: ["view", "edit"] },
  design:         { label: "تصميم الموقع",     actions: ["view"] },
  trusted:        { label: "موثوق",            actions: ["view"] },
  trustedNews:    { label: "↳ الأخبار",        actions: ["edit"] },
  trustedAddSons: { label: "↳ إضافة الأبناء",  actions: ["edit"] },
  trustedUsers:   { label: "↳ حظر مستخدمين",   actions: ["edit"] }
};

// التبويبات المقصورة على الأدمن — خارج المصفوفة تمامًا (لا تظهر بمحرر الصلاحيات ولا تُمنح لأحد):
// 📋 السجلات + تصدير فرد + تصدير الكل · 📚 المرفقات · 📁 استيراد/تصدير · 🗑️ وضع الحذف · 👥 المستخدمون · 🖼️ المظهر
const ADMIN_ONLY_PAGES = ["records", "attachments", "io", "deleteMode", "users", "background"];

// ---------- المصفوفة الافتراضية لكل مستخدم جديد ----------
// الفلسفة: يقرأ الأساسيات، ولا يعدّل شيئًا. الأدمن يرقّيه لاحقًا.
const DEFAULT_PERMS = {
  tree:           { view: true },
  addSons:        { edit: false },
  info:           { view: true },
  news:           { view: true, edit: false },
  search:         { view: true },
  relation:       { view: true },
  myTree:         { view: true },
  ai:             { view: true, edit: false },
  design:         { view: true },
  trusted:        { view: false },
  trustedNews:    { edit: false },
  trustedAddSons: { edit: false },
  trustedUsers:   { edit: false }
};

// ---------- صلاحيات الضيف (تُحدّد لاحقًا بعد اكتمال التبويبات) ----------
// مبدئيًا: الضيف يرى الشجرة والبحث فقط. مكانها محجوز للتوسعة.
const GUEST_PERMS = {
  tree:           { view: true },
  addSons:        { edit: false },
  info:           { view: true },
  news:           { view: true, edit: false },
  search:         { view: true },
  relation:       { view: true },
  myTree:         { view: true },
  ai:             { view: false },   // المساعد الذكي: للمسجّلين فقط (تكلفة)
  design:         { view: false },   // تصميم الموقع: للمسجّلين فقط
  trusted:        { view: false },
  trustedNews:    { edit: false },
  trustedAddSons: { edit: false },
  trustedUsers:   { edit: false }
};

// ---------- الحالة ----------
// مصدر واحد للحقيقة: window.authUser
// (سبب خلل سابق: app.js يكتب في window.authUser بينما الدوال تقرأ متغيرًا محليًا منفصلًا)
window.authUser = null;

function getAuthUser(){ return window.authUser; }
function isAdminUser(){ const u = window.authUser; return !!(u && u.role === "admin"); }
function isGuest(){ const u = window.authUser; return !!(u && u.isGuest); }
function isSignedIn(){ const u = window.authUser; return !!(u && !u.isGuest); }

/**
 * الفحص المركزي للصلاحيات.
 * can("tree", "edit") -> true/false
 * الأدمن يتجاوز كل شيء. التبويبات المقصورة على الأدمن تُرفض لغيره دائمًا.
 */
function can(page, action = "view"){
  const u = window.authUser;
  if (!u) return false;
  if (u.status === "blocked" || u.status === "pending") return false;
  if (isAdminUser()) return true;                       // الأدمن يتجاوز كل شيء
  if (ADMIN_ONLY_PAGES.includes(page)) return false;
  const p = u.perms && u.perms[page];
  return !!(p && p[action] === true);
}
window.can = can;

/** رسالة موحّدة عند رفض الصلاحية */
function denyMessage(page){
  if (isGuest()) return "هذه الميزة للمستخدمين المسجّلين فقط.";
  if (ADMIN_ONLY_PAGES.includes(page)) return "هذه الميزة متاحة للمشرف فقط.";
  return "لا تملك صلاحية استخدام هذه الميزة. تواصل مع المشرف.";
}
window.denyMessage = denyMessage;

/** دمج المصفوفة المحفوظة مع الافتراضية (لملء أي تبويب جديد أُضيف لاحقًا) */
function mergePerms(saved){
  const out = {};
  for (const page of Object.keys(PERM_PAGES)){
    out[page] = Object.assign({}, DEFAULT_PERMS[page], (saved && saved[page]) || {});
  }
  return out;
}

/** بناء كائن المستخدم من مستند Firestore */
function buildAuthUser(uid, doc){
  const isAdmin = doc.role === "admin";
  // توافق مع البيانات القديمة: مستخدم بلا perms أُنشئ قبل نظام الصلاحيات.
  // لا نمنحه المصفوفة الافتراضية كاملة، بل مشاهدة فقط، حتى يضبطه المشرف صراحةً.
  const hasPerms = !!doc.perms;
  return {
    uid,
    displayName: doc.displayName || "مستخدم",
    role: isAdmin ? "admin" : "user",
    status: doc.status || "active",
    scopePersonId: doc.scopePersonId || null,
    scopePersonName: doc.scopePersonName || null,
    perms: isAdmin ? null : (hasPerms ? mergePerms(doc.perms) : mergePerms(null)),
    legacyNoPerms: !isAdmin && !hasPerms,
    newsAutoPublish: !!doc.newsAutoPublish,   // نشر مباشر بلا اعتماد (حقل مستقل، خارج المصفوفة — نفس أسلوب scopePersonId)
    isGuest: false
  };
}

/** المرحلة 3 — أدوات مساعدة لصلاحيات الأخبار (تُستخدم في news.js) */
function canWriteNews(){ return can("news", "edit"); }
window.canWriteNews = canWriteNews;

// الإشراف على الأخبار (اعتماد/إخفاء أخبار الآخرين): الأدمن أو الموثوق (trustedNews.edit)
function canModerateNews(){ return isAdminUser() || can("trustedNews", "edit"); }
window.canModerateNews = canModerateNews;

// النشر المباشر بلا اعتماد: الأدمن، أو الموثوق (trustedNews.edit), أو حقل newsAutoPublish المستقل (توافق قديم)
function hasNewsAutoPublish(){
  const u = window.authUser;
  return !!(u && (isAdminUser() || can("trustedNews", "edit") || u.newsAutoPublish === true));
}
window.hasNewsAutoPublish = hasNewsAutoPublish;

// موثوق: يشاهد الأخبار غير المنشورة (المعلّقة)
function canViewPendingNews(){ return isAdminUser() || can("trusted", "view"); }
window.canViewPendingNews = canViewPendingNews;

/** الدخول كضيف — بلا حساب */
function signInAsGuest(){
  window.authUser = {
    uid: null,
    displayName: "ضيف",
    role: "guest",
    status: "active",
    scopePersonId: null,
    perms: GUEST_PERMS,
    isGuest: true
  };
  return window.authUser;
}
window.signInAsGuest = signInAsGuest;

function clearAuthUser(){
  window.authUser = null;
}
window.clearAuthUser = clearAuthUser;

/**
 * يطبّق الصلاحيات على الواجهة:
 * - يخفي التبويبات التي لا يملك مشاهدتها
 * - يعطّل أزرار التعديل/الحذف
 * الأزرار تُربط بتبويب عبر السمة data-perm="page" و data-perm-action="edit"
 */
function applyPermissionsToUI(){
  // إخفاء/إظهار التبويبات
  document.querySelectorAll("[data-perm]").forEach(el => {
    const page = el.getAttribute("data-perm");
    const action = el.getAttribute("data-perm-action") || "view";
    const allowed = can(page, action);
    const mode = el.getAttribute("data-perm-mode") || "hide";   // hide | disable | notify

    if (allowed){
      el.classList.remove("perm-hidden", "perm-disabled");
      el.removeAttribute("aria-disabled");
      return;
    }
    if (mode === "hide"){
      el.classList.add("perm-hidden");
    } else {
      // يبقى ظاهرًا لكن عند الضغط تظهر رسالة (يحفّز الضيف على التسجيل)
      el.classList.add("perm-disabled");
      el.setAttribute("aria-disabled", "true");
    }
  });
}
window.applyPermissionsToUI = applyPermissionsToUI;

/**
 * حارس عند الضغط: يمنع الفعل ويعرض رسالة إن لم تتوفر الصلاحية.
 * يُستخدم في بداية أي معالج حدث حسّاس:
 *   if (!guard("info", "edit")) return;
 */
function guard(page, action = "view"){
  if (can(page, action)) return true;
  const msg = denyMessage(page);
  if (typeof customAlert === "function") customAlert(msg);
  else alert(msg);
  return false;
}
window.guard = guard;

window.PERM_PAGES = PERM_PAGES;
window.ADMIN_ONLY_PAGES = ADMIN_ONLY_PAGES;
window.DEFAULT_PERMS = DEFAULT_PERMS;
window.GUEST_PERMS = GUEST_PERMS;
window.buildAuthUser = buildAuthUser;
window.mergePerms = mergePerms;
window.isAdminUser = isAdminUser;
window.isGuest = isGuest;
window.isSignedIn = isSignedIn;
