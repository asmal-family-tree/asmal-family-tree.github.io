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

// ---------- التبويبات المعروفة ----------
const PERM_PAGES = {
  tree:     { label: "الشجرة",          actions: ["view", "edit", "delete"] },
  info:     { label: "المعلومات",        actions: ["view", "edit", "delete"] },
  news:     { label: "الأخبار",          actions: ["view", "edit", "delete"] },
  search:   { label: "البحث",            actions: ["view"] },
  relation: { label: "حاسبة القرابة",    actions: ["view"] },
  myTree:   { label: "شجرتي",            actions: ["view"] },
  records:  { label: "السجلات",          actions: ["view", "exportOne", "exportAll"] },
  ai:       { label: "المساعد الذكي",    actions: ["view"] },
  design:   { label: "تصميم الموقع",     actions: ["view"] }
};

// التبويبات المقصورة على الأدمن — خارج المصفوفة تمامًا
const ADMIN_ONLY_PAGES = ["attachments", "io", "deleteMode", "users", "background"];

// ---------- المصفوفة الافتراضية لكل مستخدم جديد ----------
// الفلسفة: يقرأ كل شيء، ولا يعدّل شيئًا. الأدمن يرقّيه لاحقًا.
const DEFAULT_PERMS = {
  tree:     { view: true, edit: false, delete: false },
  info:     { view: true, edit: false, delete: false },
  news:     { view: true, edit: false, delete: false },
  search:   { view: true },
  relation: { view: true },
  myTree:   { view: true },
  records:  { view: true, exportOne: false, exportAll: false },
  ai:       { view: true },
  design:   { view: true }
};

// ---------- صلاحيات الضيف (تُحدّد لاحقًا بعد اكتمال التبويبات) ----------
// مبدئيًا: الضيف يرى الشجرة والبحث فقط. مكانها محجوز للتوسعة.
const GUEST_PERMS = {
  tree:     { view: true, edit: false, delete: false },
  info:     { view: true, edit: false, delete: false },
  news:     { view: true, edit: false, delete: false },
  search:   { view: true },
  relation: { view: true },
  myTree:   { view: true },
  records:  { view: true, exportOne: false, exportAll: false },
  ai:       { view: false },   // المساعد الذكي: للمسجّلين فقط (تكلفة)
  design:   { view: false }    // تصميم الموقع: للمسجّلين فقط
};

// ---------- الحالة ----------
let authUser = null;   // { uid, displayName, role, status, scopePersonId, perms, isGuest }
window.authUser = null;

function isAdminUser(){ return !!(authUser && authUser.role === "admin"); }
function isGuest(){ return !!(authUser && authUser.isGuest); }
function isSignedIn(){ return !!(authUser && !authUser.isGuest); }

/**
 * الفحص المركزي للصلاحيات.
 * can("tree", "edit") -> true/false
 * الأدمن يتجاوز كل شيء. التبويبات المقصورة على الأدمن تُرفض لغيره دائمًا.
 */
function can(page, action = "view"){
  if (!authUser) return false;
  if (authUser.status === "blocked") return false;
  if (authUser.status === "pending") return false;   // بانتظار التفعيل
  if (isAdminUser()) return true;
  if (ADMIN_ONLY_PAGES.includes(page)) return false;
  const p = authUser.perms && authUser.perms[page];
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
  return {
    uid,
    displayName: doc.displayName || "مستخدم",
    role: isAdmin ? "admin" : "user",
    status: doc.status || "active",
    scopePersonId: doc.scopePersonId || null,
    scopePersonName: doc.scopePersonName || null,
    perms: isAdmin ? null : mergePerms(doc.perms),
    isGuest: false
  };
}

/** الدخول كضيف — بلا حساب */
function signInAsGuest(){
  authUser = {
    uid: null,
    displayName: "ضيف",
    role: "guest",
    status: "active",
    scopePersonId: null,
    perms: GUEST_PERMS,
    isGuest: true
  };
  window.authUser = authUser;
  return authUser;
}
window.signInAsGuest = signInAsGuest;

function clearAuthUser(){
  authUser = null;
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
