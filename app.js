
// ============ أمان: تعقيم أي نص يدخله المستخدم قبل إدراجه بالصفحة (منع XSS) ============
function escapeHtml(str){
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ============ Firebase: التهيئة والدخول ============
const firebaseConfig = {
  apiKey: "AIzaSyAefFnJFm6Utrl_2JuTDu648rZXBJ7bJgg",
  authDomain: "asmalfamilytree.firebaseapp.com",
  projectId: "asmalfamilytree",
  storageBucket: "asmalfamilytree.firebasestorage.app",
  messagingSenderId: "233022414794",
  appId: "1:233022414794:web:0351d346d72b817b1cb933",
  measurementId: "G-5W6N75Q1PS"
};
firebase.initializeApp(firebaseConfig);
const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;      // { uid, role, scopePersonId, displayName }
window.currentUser = null;   // متاح عالميًا لباقي الكود

function usernameToEmail(username){
  const clean = username.trim().toLowerCase()
    .replace(/[\u064B-\u0652]/g, "")   // إزالة التشكيل لو وجد
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9.\u0600-\u06FF]/g, "");
  return clean + "@asmal-family-tree.app";
}

function showAuthError(msg){
  document.getElementById("authError").textContent = msg;
}
function setAuthLoading(on){
  document.getElementById("authLoading").style.display = on ? "block" : "none";
  document.getElementById("authLoginBtn").disabled = on;
}

async function ensureUserDoc(uid, defaults){
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists){
    await ref.set(defaults);
    return defaults;
  }
  return snap.data();
}

function canonicalStringify(obj){
  const sortKeys = (val) => {
    if (Array.isArray(val)) return val.map(sortKeys);
    if (val && typeof val === "object"){
      const out = {};
      Object.keys(val).sort().forEach(k => { out[k] = sortKeys(val[k]); });
      return out;
    }
    return val;
  };
  return JSON.stringify(sortKeys(obj));
}

function customAlert(message){
  const backdrop = document.getElementById("customAlertBackdrop");
  const box = document.getElementById("customAlertBox");
  const msgEl = document.getElementById("customAlertMsg");
  const okBtn = document.getElementById("customAlertOk");
  msgEl.textContent = message;
  backdrop.classList.add("show");
  box.classList.add("show");
  function close(){
    backdrop.classList.remove("show");
    box.classList.remove("show");
    okBtn.removeEventListener("click", close);
    backdrop.removeEventListener("click", close);
  }
  okBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
}

function withTimeout(promise, ms, label){
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject({ code: "timeout", message: label }), ms))
  ]);
}

document.getElementById("authLoginBtn").onclick = async function(){
  const username = document.getElementById("authUsername").value.trim();
  const password = document.getElementById("authPassword").value;
  showAuthError("");
  if (!username || !password){ showAuthError("أدخل اسم المستخدم وكلمة المرور"); return; }
  setAuthLoading(true);
  const email = usernameToEmail(username);
  try{
    const cred = await withTimeout(auth.signInWithEmailAndPassword(email, password), 12000,
      "تعذّر الاتصال بالخادم. جرّب فتح الملف من متصفح Chrome مباشرة (مو معاينة ملفات التنزيلات)، وتأكد من اتصال الإنترنت.");
  }catch(err){
    if (err.code === "timeout"){ setAuthLoading(false); showAuthError(err.message); return; }
    setAuthLoading(false);
    if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential" || err.code === "auth/invalid-login-credentials"){
      showAuthError("كلمة المرور غير صحيحة");
    } else if (err.code === "auth/user-not-found"){
      showAuthError("هذا المستخدم غير موجود. تواصل مع محمد رشاد لإضافتك");
    } else {
      showAuthError("خطأ: " + (err.message || err.code));
    }
  }
};

document.getElementById("authPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("authLoginBtn").click();
});

async function afterSignIn(fbUser){
  if (window.__adminBootstrapping) return;

  let userDoc;
  try{
    userDoc = await ensureUserDoc(fbUser.uid, {
      role: "user",
      status: "pending",              // الحساب الجديد معلّق حتى يفعّله المشرف
      displayName: (fbUser.email || "").split("@")[0],
      scopePersonId: null,
      perms: DEFAULT_PERMS,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }catch(e){
    // لو فشلت قراءة الملف (شبكة/قواعد) كانت الدالة تنهار صامتة،
    // فيبقى المستخدم على شاشة نصف محمّلة بلا هيدر ولا رسالة.
    setAuthLoading(false);
    showAuthError("تعذّر تحميل ملف الحساب: " + (e.message || e.code));
    await auth.signOut();
    return;
  }

  // بناء المستخدم عبر طبقة الصلاحيات المشتركة (auth.js)
  window.authUser = buildAuthUser(fbUser.uid, userDoc);
  currentUser = window.authUser;      // توافق مع الكود القائم
  window.currentUser = currentUser;

  setAuthLoading(false);

  // حساب بانتظار التفعيل أو محظور — لا يدخل الموقع
  if (window.authUser.status !== "active"){
    const msg = window.authUser.status === "blocked"
      ? "حسابك موقوف. تواصل مع المشرف."
      : "حسابك بانتظار التفعيل من المشرف.";
    showAuthError(msg);
    await auth.signOut();
    return;
  }

  document.body.classList.add("authed");   // الآن فقط تُرسم عناصر التحكم
  document.getElementById("authOverlay").classList.add("hidden");
  document.getElementById("currentUserName").textContent = "👤 " + window.authUser.displayName;
  document.getElementById("currentUserBadge").classList.add("show");
  loadAndApplySiteTheme();
  applyRolePermissions();
}

// ---------- الدخول كضيف ----------
async function enterAsGuest(){
  signInAsGuest();
  currentUser = window.authUser;
  window.currentUser = currentUser;
  document.body.classList.add("authed");
  document.getElementById("authOverlay").classList.add("hidden");
  document.getElementById("currentUserName").textContent = "👤 ضيف";
  document.getElementById("currentUserBadge").classList.add("show");
  loadAndApplySiteTheme();
  applyRolePermissions();
}
window.enterAsGuest = enterAsGuest;

// الاستايل له مستويان:
//   • المشرف يحفظ في meta/siteSettings  => يصير الافتراضي للجميع
//   • المستخدم يحفظ في localStorage      => يغيّره لنفسه فقط، ويتجاوز به العام
// عند التحميل: نقرأ العام، ثم إن وُجد اختيار شخصي فهو الذي يُطبَّق.
async function loadAndApplySiteTheme(){
  let theme = "", layoutStyle = "";
  try{
    const snap = await db.collection("meta").doc("siteSettings").get();
    if (snap.exists){
      theme = snap.data().theme || "";
      layoutStyle = snap.data().layoutStyle || "";
    }
  }catch(e){ console.error("تعذر تحميل استايل الموقع", e); }

  if (!isAdminUser()){
    const myTheme  = localStorage.getItem("myTheme");
    const myLayout = localStorage.getItem("myLayout");
    if (myTheme  !== null) theme = myTheme;
    if (myLayout !== null) layoutStyle = myLayout;
  }

  applyTheme(theme);
  applyLayoutStyle(layoutStyle);
}

// ملاحظة توضيحية أسفل لوحة التصميم
function renderDesignScopeNote(){
  const el = document.getElementById("designScopeNote");
  if (!el) return;
  el.textContent = isAdminUser()
    ? "بصفتك المشرف، اختيارك هنا يصير الاستايل الافتراضي للجميع."
    : "اختيارك هنا يخصّك وحدك — لا يغيّر شكل الموقع على غيرك.";
}

function applyTheme(theme){
  if (theme) document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");
  document.querySelectorAll(".theme-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.theme === theme);
  });
}

function applyLayoutStyle(layoutStyle){
  if (layoutStyle) document.documentElement.setAttribute("data-style", layoutStyle);
  else document.documentElement.removeAttribute("data-style");
  document.querySelectorAll(".layout-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.style === layoutStyle);
  });
  placeDeleteBadgeCellForAsmal(layoutStyle);
  applyAsmalAdminOnlyVisibility();
}

// ===== ASMAL DELETE-CELL START (معزول — احذف هذه الدالة والسطر الذي يستدعيها بأمان لإلغاء الميزة) =====
// تصميم "أسمل" فقط: ينقل زر علامات الحذف فعليًا ليصبح ابنًا رابعًا داخل صندوق التكبير (.zoom-fab)
// بدل تموضع مستقل بحسابات يدوية — هذا يضمن التحاق حدوده تلقائيًا مع باقي الخانات الثلاث.
function placeDeleteBadgeCellForAsmal(layoutStyle){
  const del = document.getElementById("deleteBadgeToggle");
  const zoomFab = document.querySelector(".zoom-fab");
  const bottomBar = document.getElementById("bottomBar");
  if (!del || !zoomFab || !bottomBar) return;
  if (layoutStyle === "4"){
    if (del.parentElement !== zoomFab) zoomFab.appendChild(del);
  } else {
    if (del.parentElement !== bottomBar) bottomBar.appendChild(del);
  }
}
// ===== ASMAL DELETE-CELL END =====

// ===== ASMAL ADMIN-ONLY START (معزول — احذف هذه الدالة واستدعاءاتها بأمان لإلغاء القيد) =====
// تصميم "أسمل" فقط: المرفقات + تصدير/استيراد + تفعيل الحذف لا تظهر إلا للأدمن.
// نستخدم style.setProperty(..., 'important') حتى تتغلّب على display:flex!important
// الخاصة بتصميم أسمل بالأنماط، بلا حاجة لتعديل تلك القواعد.
function applyAsmalAdminOnlyVisibility(){
  const style4Active = document.documentElement.getAttribute("data-style") === "4";
  const admin = (typeof isAdminUser === "function") && isAdminUser();
  ["ioToggle", "attachmentsToggle", "deleteBadgeToggle"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (style4Active && !admin){
      el.style.setProperty("display", "none", "important");
    } else {
      el.style.removeProperty("display");
    }
  });
}
window.applyAsmalAdminOnlyVisibility = applyAsmalAdminOnlyVisibility;
// ===== ASMAL ADMIN-ONLY END =====

document.querySelectorAll(".layout-btn").forEach(btn => {
  btn.onclick = async () => {
    if (!guard("design")) return;
    const layoutStyle = btn.dataset.style;
    const statusEl = document.getElementById("layoutStatus");

    if (!isAdminUser()){
      localStorage.setItem("myLayout", layoutStyle);
      applyLayoutStyle(layoutStyle);
      statusEl.textContent = "✅ طُبِّق التصميم عليك";
      setTimeout(() => { statusEl.textContent = ""; }, 2000);
      return;
    }

    statusEl.textContent = "جارِ الحفظ…";
    try{
      await db.collection("meta").doc("siteSettings").set({ layoutStyle }, { merge: true });
      applyLayoutStyle(layoutStyle);
      statusEl.textContent = "✅ تم تطبيق التصميم للجميع";
      setTimeout(() => { statusEl.textContent = ""; }, 2500);
    }catch(e){
      statusEl.textContent = "تعذر الحفظ: " + (e.message || e.code);
    }
  };
});

document.querySelectorAll(".theme-btn").forEach(btn => {
  btn.onclick = async () => {
    if (!guard("design")) return;
    const theme = btn.dataset.theme;
    const statusEl = document.getElementById("themeStatus");

    if (!isAdminUser()){
      localStorage.setItem("myTheme", theme);
      applyTheme(theme);
      statusEl.textContent = "✅ طُبِّق الاستايل عليك";
      setTimeout(() => { statusEl.textContent = ""; }, 2000);
      return;
    }

    statusEl.textContent = "جارِ الحفظ…";
    try{
      await db.collection("meta").doc("siteSettings").set({ theme }, { merge: true });
      applyTheme(theme);
      statusEl.textContent = "✅ تم تطبيق الاستايل للجميع";
      setTimeout(() => { statusEl.textContent = ""; }, 2500);
    }catch(e){
      statusEl.textContent = "تعذر الحفظ: " + (e.message || e.code);
    }
  };
});

document.getElementById("logoutBtn").onclick = () => {
  auth.signOut();
  document.getElementById("currentUserBadge").classList.remove("show");
};

auth.onAuthStateChanged((fbUser) => {
  if (fbUser){
    afterSignIn(fbUser);
  } else {
    currentUser = null;
    window.currentUser = null;
    window.authUser = null;
    document.body.classList.remove("authed");   // إخفاء كل عناصر التحكم فورًا
    document.getElementById("authOverlay").classList.remove("hidden");
  }
});

function isDbBacked(){ return currentUser && !!treeData.id; }
// شرطان لا بد منهما معًا:
//   ١) يملك صلاحية tree.edit  (كانت مفقودة: من له نطاق كان يضيف ولو بلا صلاحية)
//   ٢) الموضع داخل نطاقه      (عقدته نفسها أو أحد فروعها)
// المشرف يتجاوز قيد النطاق، لا قيد الصلاحية (فهو يملكها أصلًا).
function canAddUnder(parentDataNode){
  if (!can("tree", "edit")) return false;
  if (isAdminUser()) return true;
  const scope = window.authUser && window.authUser.scopePersonId;
  if (!scope) return false;
  const ids = parentDataNode.ancestorIds || [];
  return parentDataNode.id === scope || ids.includes(scope);
}

async function firestoreAddPerson(parentDataNode, name, type, extraFields){
  const parentId = parentDataNode.id || null;
  const parentAncestorIds = parentDataNode.ancestorIds || [];
  const ref = db.collection("persons").doc();
  const ancestorIds = parentAncestorIds.concat([ref.id]);
  const pending = !isAdminUser();   // إضافة غير المشرف تبقى معلّقة حتى الاعتماد
  await ref.set(Object.assign({
    name, type, parentId: parentId,
    ancestorIds, isJoinPoint: false, pendingApproval: pending,
    addedBy: currentUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, extraFields || {}));
  return { id: ref.id, ancestorIds, pending };
}

async function firestoreDeletePerson(dataNode){
  const ids = [];
  function collect(n){ if (n.id) ids.push(n.id); (n.children || []).forEach(collect); }
  collect(dataNode);
  const BATCH_SIZE = 400;
  for (let i = 0; i < ids.length; i += BATCH_SIZE){
    const batch = db.batch();
    ids.slice(i, i + BATCH_SIZE).forEach(id => batch.delete(db.collection("persons").doc(id)));
    await batch.commit();
  }
}

// ═══════════════════════════════════════════════════════════════
// تطبيق الصلاحيات على الواجهة — مبني على مصفوفة perms (لا أدوار جامدة)
// كل زر تبويب يحمل صلاحيته، والأدمن يتجاوز كل شيء.
// ═══════════════════════════════════════════════════════════════

// خريطة: زر الواجهة -> (التبويب، وضع الإخفاء)
// mode "hide"   => يختفي تمامًا لمن لا يملك الصلاحية
// mode "notify" => يبقى ظاهرًا، وعند الضغط تظهر رسالة (يحفّز الضيف على التسجيل)
const TAB_PERMS = [
  { id: "searchToggle",      page: "search",   mode: "hide" },
  { id: "relToggle",         page: "relation", mode: "hide" },
  { id: "myTreeToggle",      page: "myTree",   mode: "hide" },
  { id: "recordsToggle",     page: "records",  mode: "notify" },
  { id: "designToggle",      page: "design",   mode: "notify" },
  { id: "bgToggle",          page: "background", mode: "hide" },
  { id: "attachmentsToggle", page: "attachments", mode: "hide" },
  { id: "ioToggle",          page: "io",       mode: "hide" },
  { id: "deleteBadgeToggle", page: "deleteMode", mode: "hide" },
  { id: "usersToggle",       page: "users",    mode: "hide" }
];

function applyRolePermissions(){
  if (!window.authUser) return;
  const admin = isAdminUser();
  document.body.classList.toggle("role-limited", !admin);
  document.body.classList.toggle("role-guest", isGuest());
  // إخفاء أزرار ➕ الإضافة على العقد لمن لا يملك صلاحية تعديل الشجرة
  document.body.classList.toggle("no-tree-edit", !can("tree", "edit"));

  for (const t of TAB_PERMS){
    const allowed = can(t.page, "view");
    // الزر الأصلي (شريط الجوال)
    const el = document.getElementById(t.id);
    if (el){
      if (allowed){
        el.style.display = "";
        el.classList.remove("perm-disabled");
      } else if (t.mode === "notify"){
        el.style.display = "";
        el.classList.add("perm-disabled");
      } else {
        el.style.display = "none";
      }
    }
    // التبويب المقابل في هيدر سطح المكتب
    const dtTab = document.querySelector(`.dt-tab[data-target="${t.id}"]`);
    if (dtTab){
      if (allowed){
        dtTab.style.display = "";
        dtTab.classList.remove("perm-disabled");
      } else if (t.mode === "notify"){
        dtTab.style.display = "";
        dtTab.classList.add("perm-disabled");
      } else {
        dtTab.style.display = "none";
      }
    }
  }


  // لا صلاحية مشاهدة الشجرة إطلاقًا
  if (!can("tree", "view")){
    document.getElementById("tree-wrap").classList.add("tree-hidden");
    document.getElementById("noViewMsg").classList.add("show");
    return;
  }
  document.getElementById("tree-wrap").classList.remove("tree-hidden");
  document.getElementById("noViewMsg").classList.remove("show");

  checkMigrationStatusAndLoad();
}

// ============ تحميل الشجرة من Firestore ============
// (النقل الأولي تمّ ونُقلت 616 عقدة؛ زرّ النقل حُذف بعد انتهاء مهمته)
async function checkMigrationStatusAndLoad(){
  try{
    await loadTreeFromFirestore();
  }catch(e){
    console.error("تعذّر تحميل الشجرة من قاعدة البيانات:", e);
  }
}


async function loadTreeFromFirestore(){
  const snap = await db.collection("persons").get();
  if (snap.empty) return;
  const isAdminView = isAdminUser();   // مصدر واحد للحقيقة (auth.js)
  const byId = new Map();
  snap.forEach(doc => {
    const d = doc.data();
    if (!isAdminView && d.pendingApproval) return; // إخفاء الإضافات المعلّقة عن غير المشرف
    if (!isAdminView && d.type === "female" && d.wifeId) return; // عقد "الأم" تظهر لمحمد رشاد (Admin) فقط دائمًا
    byId.set(doc.id, { id: doc.id, name: d.name, type: d.type, isJoinPoint: d.isJoinPoint, parentId: d.parentId, ancestorIds: d.ancestorIds || [], pendingApproval: !!d.pendingApproval, wifeId: d.wifeId || null, sourcePersonId: d.sourcePersonId || null, sourceName: d.sourceName || null, motherApproved: !!d.motherApproved, children: [] });
  });
  let rootNode = null;
  byId.forEach((node, id) => {
    if (node.parentId && byId.has(node.parentId)){
      byId.get(node.parentId).children.push(node);
    } else if (!node.parentId){
      rootNode = node;
    }
  });
  if (!rootNode) return;

  // ملاحظة: سابقًا كانت الشجرة تُقصّ هنا عند نقطة المستخدم (scopePersonId).
  // أُزيل ذلك لأنه خلط بين ثلاثة أدوار منفصلة:
  //   • tree.view        => الشجرة كاملة من الجذر (قراءة)
  //   • تبويب "شجرتي"    => فرع المستخدم (عرض مستقل)
  //   • scopePersonId    => نقطة بدء التعديل فقط (كتابة)
  // فربط مستخدم بعقدته كان ينكمش عرضه فجأة، وهو ليس المقصود.

  function clean(n){
    const out = { name: n.name, type: n.type, id: n.id, ancestorIds: n.ancestorIds };
    if (n.isJoinPoint) out.isJoinPoint = true;
    if (n.pendingApproval) out.pendingApproval = true;
    if (n.wifeId) out.wifeId = n.wifeId;
    if (n.sourcePersonId) out.sourcePersonId = n.sourcePersonId;
    if (n.sourceName) out.sourceName = n.sourceName;
    if (n.motherApproved) out.motherApproved = true;
    if (n.children.length) out.children = n.children.map(clean);
    return out;
  }
  const cleaned = clean(rootNode);
  treeData.name = cleaned.name;
  treeData.type = cleaned.type;
  treeData.id = cleaned.id;
  treeData.ancestorIds = cleaned.ancestorIds;
  treeData.children = cleaned.children || [];
  refreshView();
}

// ============ إدارة المستخدمين (مرحلة ٤) ============
let selectedScopePerson = null; // { id, name, ancestorIds }


// ═══════════════════════════════════════════════════════════════
// بحث مشترك عن شخص بالشجرة، لربط المستخدم بعقدته (scopePersonId).
// يُستخدم في موضعين: نموذج "إضافات خاصة"، ومحرر الصلاحيات.
// ═══════════════════════════════════════════════════════════════
function attachPersonSearch(inputEl, dropdownEl, onPick){
  inputEl.addEventListener("input", () => {
    const q = inputEl.value.trim();
    dropdownEl.innerHTML = "";
    if (!q){ dropdownEl.classList.remove("show"); return; }

    const parts = q.split(/\s+/).filter(Boolean);
    let matches;
    if (parts.length > 1){
      // اسم مركّب: نطابق السلسلة كلها بالترتيب (نجيب محمد أحمد…)
      matches = root.descendants().filter(d => {
        if (d.data.type === "female") return false;
        const chain = chainNames(d);
        if (chain.length < parts.length) return false;
        for (let i = 0; i < parts.length; i++) if (!chain[i].includes(parts[i])) return false;
        return true;
      });
    } else {
      matches = root.descendants().filter(d => d.data.type !== "female" && d.data.name.includes(q));
    }
    matches = matches.slice(0, 30);
    if (!matches.length){ dropdownEl.classList.remove("show"); return; }

    matches.forEach(m => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";
      item.innerHTML = `${escapeHtml(m.data.name)}<span class="chain-sub">${chainNames(m).map(escapeHtml).join(" بن ")}</span>`;
      item.onclick = () => {
        onPick({
          id: m.data.id,
          name: m.data.name,
          ancestorIds: m.data.ancestorIds || [],
          chain3: chainNames(m).slice(0, 3).join(" ")
        });
        inputEl.value = chainNames(m).slice(0, 3).join(" ");
        dropdownEl.classList.remove("show");
      };
      dropdownEl.appendChild(item);
    });
    portalShowDropdown(inputEl, dropdownEl);
  });
}

const newUserScopeInput = document.getElementById("newUserScopeInput");
const newUserScopeDropdown = document.getElementById("newUserScopeDropdown");
// نموذج "إضافات خاصة" يستخدم نفس بحث الأشخاص المشترك
attachPersonSearch(newUserScopeInput, newUserScopeDropdown, (picked) => {
  selectedScopePerson = { id: picked.id, name: picked.name, ancestorIds: picked.ancestorIds };
});
newUserScopeInput.addEventListener("input", () => { selectedScopePerson = null; });

document.getElementById("newUserAddBtn").onclick = async function(){
  const username = document.getElementById("newUserName").value.trim();
  const password = document.getElementById("newUserPassword").value;
  const statusEl = document.getElementById("newUserStatus");
  if (!username || !password){ statusEl.textContent = "أدخل اسم المستخدم وكلمة المرور"; return; }
  if (password.length < 6){ statusEl.textContent = "كلمة المرور يجب أن تكون ٦ أحرف على الأقل"; return; }
  if (!selectedScopePerson){ statusEl.textContent = "اختر النقطة (اسم الشخص) من القائمة المنسدلة"; return; }
  statusEl.textContent = "جارِ الإنشاء…";
  const email = usernameToEmail(username);
  try{
    const cred = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
    // "إضافات خاصة": ينشئها المشرف مباشرة => فعّالة فورًا، بلا انتظار تفعيل.
    await db.collection("users").doc(cred.user.uid).set({
      role: "user",
      status: "active",
      displayName: username,
      scopePersonId: selectedScopePerson.id,
      scopePersonName: selectedScopePerson.name,
      perms: DEFAULT_PERMS,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await secondaryApp.auth().signOut();
    statusEl.textContent = `✅ تم إنشاء المستخدم "${username}" بنطاق "${selectedScopePerson.name}"`;
    document.getElementById("newUserName").value = "";
    document.getElementById("newUserPassword").value = "";
    newUserScopeInput.value = "";
    selectedScopePerson = null;
    refreshUsersAndPendingLists();
  }catch(e){
    statusEl.textContent = "خطأ: " + (e.message || e.code);
  }
};

function isPersonDataFilled(data){
  return !!(data.job || data.nickname || data.bio || data.photo || data.mother ||
    (data.wives && data.wives.length) || data.husband);
}

async function refreshRecordsList(){
  const listEl = document.getElementById("recordsList");
  listEl.innerHTML = "جارِ البحث بكل الملفات…";
  const filled = [];
  for (const n of root.descendants()){
    const data = await loadPersonData(personId(n));
    if (isPersonDataFilled(data)) filled.push({ node: n, data });
  }
  if (!filled.length){
    listEl.innerHTML = `<span style="color:#999; font-size:13px">لا يوجد أي ملف فيه بيانات مسجّلة بعد بقاعدة البيانات</span>`;
    return;
  }
  listEl.innerHTML = "";
  filled.forEach(({ node, data }) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; padding:8px; background:#F7F2E7; border-radius:8px;";
    row.innerHTML = `<span style="cursor:pointer; color:#241a10;">${chainNames(node).slice(0,3).map(escapeHtml).join(" ")}</span>
      <span><button class="f-btn-sm records-open-btn" style="margin-left:6px;">فتح</button><button class="f-btn-sm records-pdf-btn">⬇️ PDF</button></span>`;
    row.querySelector(".records-open-btn").onclick = () => { recordsPanel.classList.remove("show"); showInfo(node); };
    row.querySelector(".records-pdf-btn").onclick = () => exportPersonPdf(node, data);
    listEl.appendChild(row);
  });
}

async function buildPersonBlockDataUrl(personNode, preloadedData, blockWidth){
  const data = preloadedData || await loadPersonData(personId(personNode));
  const fiveName = chainNames(personNode).slice(0, 5).join(" ");

  const sonsInTree = personNode.children ? personNode.children.filter(c => c.data.type !== "female").length : 0;
  let unclesLine = "";
  if (data.mother && data.mother.fatherId){
    const mgf = root.descendants().find(n => personId(n) === data.mother.fatherId);
    if (mgf){
      const uncles = (mgf.children || []).filter(c => c.data.type !== "female").map(c => c.data.name);
      if (uncles.length) unclesLine = uncles.join("، ");
    }
  }
  const sameMother = await findSameMotherSiblings(personNode);
  const halfSiblingsLine = sameMother.siblings.map(s => s.name).join("، ");

  const sonNames = personNode.children ? personNode.children.filter(c => c.data.type !== "female").map(c => c.data.name) : [];
  const insideWifeFathers = (data.wives || []).filter(w => w.type === "inside" && (w.fatherChain || w.fatherName)).map(w => w.fatherChain || w.fatherName);
  const wifeSpecificNotaries = [];
  (data.wives || []).forEach(w => {
    if (w.type === "outside" && w.notaries && w.notaries.length){
      wifeSpecificNotaries.push(...w.notaries.map(n => n.chain3 || n.name));
    }
  });

  const lines = [];
  if (data.birthYear){
    // العمر يُحسب حتى سنة الوفاة إن كان متوفى، وإلا حتى السنة الحالية
    const isDead = data.deathStatus === "dead" && data.deathYear;
    const endYear = isDead ? parseInt(data.deathYear) : CURRENT_HIJRI_YEAR;
    const age = endYear - parseInt(data.birthYear);
    lines.push({ label: "تاريخ الميلاد", value: data.birthYear + " هـ" });
    if (age > 0 && age < 130) lines.push({ label: "العمر", value: age + " سنة تقريبًا" + (isDead ? " — عند الوفاة" : "") });
  }
  lines.push({ label: "الحالة", value: data.deathStatus === "dead" ? "متوفى" : "حي يرزق" });
  if (data.job) lines.push({ label: "الوظيفة", value: data.job });
  if (data.nickname) lines.push({ label: "اللقب/الشهرة", value: data.nickname });
  lines.push({ label: "عدد الأبناء بالمشجرة", value: String(sonsInTree) });
  if (sonNames.length) lines.push({ label: "أسماء الأبناء", value: sonNames.join("، ") });
  if (insideWifeFathers.length) lines.push({ label: "والد الزوجة (من القبيلة)", value: insideWifeFathers.join("، ") });
  if (unclesLine) lines.push({ label: "الأخوال", value: unclesLine });
  if (halfSiblingsLine) lines.push({ label: "الإخوة من الأم", value: halfSiblingsLine });
  if (wifeSpecificNotaries.length) lines.push({ label: "عدلاء الزوجة/الزوجات", value: wifeSpecificNotaries.join("، ") });
  if (data.bio) lines.push({ label: "نبذة", value: data.bio });

  function wrapText(text, maxChars){
    const words = String(text).split(/\s+/);
    const out = [];
    let cur = "";
    words.forEach(w => {
      if ((cur + " " + w).trim().length > maxChars && cur){
        out.push(cur.trim());
        cur = w;
      } else {
        cur = (cur ? cur + " " : "") + w;
      }
    });
    if (cur) out.push(cur.trim());
    return out.length ? out : [""];
  }

  const W = blockWidth || 515, margin = 18, rowH = 34, subLineH = 20;
  const MAX_CHARS_PER_LINE = 56;
  const wrappedLines = lines.map(l => ({ label: l.label, valueLines: wrapText(l.value, MAX_CHARS_PER_LINE) }));
  const totalSubLines = wrappedLines.reduce((sum, l) => sum + l.valueLines.length, 0);
  const H = 56 + (wrappedLines.length * (20 + 8)) + (totalSubLines * subLineH) + 14;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("xmlns", svgNS);
  svg.setAttribute("width", W); svg.setAttribute("height", H);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const styleEl = document.createElementNS(svgNS, "style");
  styleEl.textContent = "text{font-family:'Tajawal',sans-serif;}";
  svg.appendChild(styleEl);

  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("width", W); bg.setAttribute("height", H); bg.setAttribute("rx", 10); bg.setAttribute("fill", "#FFFDF6");
  bg.setAttribute("stroke", "#B8860B"); bg.setAttribute("stroke-width", 1.4);
  svg.appendChild(bg);

  const title = document.createElementNS(svgNS, "text");
  title.setAttribute("x", W/2); title.setAttribute("y", 30);
  title.setAttribute("text-anchor", "middle"); title.setAttribute("font-size", "17"); title.setAttribute("font-weight", "700");
  title.setAttribute("fill", "#0B3D2E");
  title.textContent = fiveName;
  svg.appendChild(title);

  const sep = document.createElementNS(svgNS, "line");
  sep.setAttribute("x1", margin); sep.setAttribute("x2", W - margin); sep.setAttribute("y1", 42); sep.setAttribute("y2", 42);
  sep.setAttribute("stroke", "#E6D9B8");
  svg.appendChild(sep);

  let y = 62;
  wrappedLines.forEach(l => {
    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", W - margin); t.setAttribute("y", y);
    t.setAttribute("text-anchor", "end"); t.setAttribute("font-size", "12.5"); t.setAttribute("font-weight", "700"); t.setAttribute("fill", "#8B4A1E");
    t.textContent = l.label + ":";
    svg.appendChild(t);
    y += 20;
    l.valueLines.forEach((vline) => {
      const v = document.createElementNS(svgNS, "text");
      v.setAttribute("x", W - margin); v.setAttribute("y", y);
      v.setAttribute("text-anchor", "end"); v.setAttribute("font-size", "12.5"); v.setAttribute("fill", "#333");
      v.textContent = vline;
      svg.appendChild(v);
      y += subLineH;
    });
    y += 8;
  });

  const svgText = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const imgData = await new Promise((resolve) => {
    const img = new Image();
    img.onload = function(){
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = W * scale; canvas.height = H * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = url;
  });
  return { imgData, fiveName, W, H };
}

async function exportPersonPdf(personNode, preloadedData){
  const PAGE_W = 595, PAGE_H = 842, margin = 40;
  const { imgData, fiveName, W, H } = await buildPersonBlockDataUrl(personNode, preloadedData, PAGE_W - margin*2);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  pdf.addImage(imgData, "PNG", margin, margin, W, H);
  pdf.save(`${fiveName}.pdf`);
}

async function exportAllRecordsPdf(){
  const btn = document.getElementById("exportAllRecordsBtn");
  const original = btn.textContent;
  btn.disabled = true;
  const filled = [];
  for (const n of root.descendants()){
    const data = await loadPersonData(personId(n));
    if (isPersonDataFilled(data)) filled.push({ node: n, data });
  }
  if (!filled.length){
    customAlert("لا يوجد أي ملف فيه بيانات مسجّلة بعد.");
    btn.disabled = false; btn.textContent = original;
    return;
  }
  const PAGE_W = 595, PAGE_H = 842, margin = 30, gap = 12;
  const blockWidth = PAGE_W - margin * 2;
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  let y = margin;
  let firstBlock = true;
  for (let i = 0; i < filled.length; i++){
    btn.textContent = `جارِ التجهيز… (${i+1}/${filled.length})`;
    const { imgData, W, H } = await buildPersonBlockDataUrl(filled[i].node, filled[i].data, blockWidth);
    if (y + H > PAGE_H - margin){
      pdf.addPage();
      y = margin;
    } else if (!firstBlock){
      y += gap;
    }
    pdf.addImage(imgData, "PNG", margin, y, W, H);
    y += H;
    firstBlock = false;
  }
  pdf.save("كل_الملفات_المسجّلة.pdf");
  btn.disabled = false; btn.textContent = original;
}
document.getElementById("exportAllRecordsBtn").onclick = exportAllRecordsPdf;


// ═══════════════════════════════════════════════════════════════
// محرر مصفوفة الصلاحيات
// كل تبويب × (مشاهدة/تعديل/حذف). التبويبات المقصورة على المشرف
// غير معروضة هنا لأنها خارج المصفوفة أصلًا.
// ═══════════════════════════════════════════════════════════════

// اسم عقدة المستخدم بصيغة ثلاثية مفهومة (بدل "محمد" المفردة الغامضة)
function scopeChainLabel(u){
  if (!u.scopePersonId) return "غير محدد";
  const node = root && root.descendants().find(d => d.data.id === u.scopePersonId);
  if (node) return chainNames(node).slice(0, 3).join(" بن ");
  return u.scopePersonName || u.scopePersonId;
}

let editingPermsUid = null;
let editingPerms = null;
let editingScope = null;   // { id, name, ancestorIds } — العقدة المرتبطة بالمستخدم

const ACTION_LABELS = {
  view: "مشاهدة", edit: "تعديل", delete: "حذف",
  exportOne: "تصدير فرد", exportAll: "تصدير الكل"
};

function openPermsEditor(uid, userData){
  editingPermsUid = uid;
  editingPerms = mergePerms(userData.perms);
  editingScope = userData.scopePersonId
    ? { id: userData.scopePersonId, name: userData.scopePersonName || "", ancestorIds: null }
    : null;

  document.getElementById("permsUserName").textContent = userData.displayName || "—";

  // النطاق الحالي
  const scopeInput = document.getElementById("permsScopeInput");
  const scopeCurrent = document.getElementById("permsScopeCurrent");
  scopeInput.value = "";
  scopeCurrent.textContent = editingScope
    ? `النطاق الحالي: ${editingScope.name || editingScope.id}`
    : "لا يوجد نطاق مرتبط — لن تعمل له \"شجرتي\" ولا \"ملفي\" بالسجلات.";
  const grid = document.getElementById("permsGrid");
  grid.innerHTML = "";

  // رأس الجدول
  const head = document.createElement("div");
  head.className = "perms-header-row";
  head.innerHTML = `<span>التبويب</span><span class="perms-cell">👁️</span><span class="perms-cell">✏️</span><span class="perms-cell">🗑️</span>`;
  grid.appendChild(head);

  for (const [page, cfg] of Object.entries(PERM_PAGES)){
    const row = document.createElement("div");
    row.className = "perms-row";

    const label = document.createElement("span");
    label.className = "perms-row-label";
    label.textContent = cfg.label;
    row.appendChild(label);

    // ثلاثة أعمدة ثابتة: مشاهدة / تعديل / حذف — نضع خانة أو شرطة
    for (const action of ["view", "edit", "delete"]){
      const cell = document.createElement("span");
      cell.className = "perms-cell";
      if (cfg.actions.includes(action)){
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!(editingPerms[page] && editingPerms[page][action]);
        cb.onchange = () => {
          editingPerms[page] = editingPerms[page] || {};
          editingPerms[page][action] = cb.checked;
          // منع التناقض: بلا "مشاهدة" لا معنى للتعديل أو الحذف
          if (action === "view" && !cb.checked){
            ["edit", "delete", "exportOne", "exportAll"].forEach(a => {
              if (editingPerms[page][a]) editingPerms[page][a] = false;
            });
            openPermsEditorRefresh();
          }
        };
        cell.appendChild(cb);
      } else {
        cell.textContent = "—";
        cell.style.color = "#ccc";
      }
      row.appendChild(cell);
    }
    grid.appendChild(row);

    // صلاحيات إضافية خاصة بالسجلات (تصدير فرد / تصدير الكل)
    const extras = cfg.actions.filter(a => !["view", "edit", "delete"].includes(a));
    for (const action of extras){
      const erow = document.createElement("div");
      erow.className = "perms-row";
      erow.style.paddingRight = "18px";
      const elabel = document.createElement("span");
      elabel.className = "perms-row-label";
      elabel.style.color = "#6a5c42";
      elabel.style.fontSize = "14.5px";
      elabel.style.fontWeight = "700";
      elabel.textContent = "↳ " + (ACTION_LABELS[action] || action);
      erow.appendChild(elabel);

      const cell = document.createElement("span");
      cell.className = "perms-cell";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!(editingPerms[page] && editingPerms[page][action]);
      cb.onchange = () => {
        editingPerms[page] = editingPerms[page] || {};
        editingPerms[page][action] = cb.checked;
      };
      cell.appendChild(cb);
      erow.appendChild(cell);
      erow.appendChild(document.createElement("span"));
      erow.appendChild(document.createElement("span"));
      grid.appendChild(erow);
    }
  }

  document.getElementById("permsStatus").textContent = "";
  document.getElementById("permsEditor").style.display = "block";
  document.getElementById("permsEditor").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// إعادة رسم المحرر بعد تغيير يؤثر على خانات أخرى
function openPermsEditorRefresh(){
  const name = document.getElementById("permsUserName").textContent;
  openPermsEditor(editingPermsUid, { displayName: name, perms: editingPerms });
}

document.getElementById("permsCloseBtn").onclick = () => {
  document.getElementById("permsEditor").style.display = "none";
  editingPermsUid = null;
  editingPerms = null;
  editingScope = null;
};

// بحث النطاق داخل محرر الصلاحيات
attachPersonSearch(
  document.getElementById("permsScopeInput"),
  document.getElementById("permsScopeDropdown"),
  (picked) => {
    editingScope = { id: picked.id, name: picked.name, ancestorIds: picked.ancestorIds, chain3: picked.chain3 };
    document.getElementById("permsScopeCurrent").textContent =
      `سيُربط بـ: ${picked.chain3}  (${picked.id})`;
  }
);

document.getElementById("permsSaveBtn").onclick = async () => {
  if (!editingPermsUid) return;
  const statusEl = document.getElementById("permsStatus");
  statusEl.textContent = "جارِ الحفظ…";
  try{
    const payload = { perms: editingPerms };
    if (editingScope && editingScope.id){
      payload.scopePersonId = editingScope.id;
      payload.scopePersonName = editingScope.name || "";
      if (editingScope.chain3) payload.scopePersonChain = editingScope.chain3;
    }
    await db.collection("users").doc(editingPermsUid).update(payload);
    statusEl.textContent = "✅ حُفظت الصلاحيات" + (editingScope ? " والنطاق" : "");
    setTimeout(() => {
      document.getElementById("permsEditor").style.display = "none";
      editingPermsUid = null;
      editingPerms = null;
    }, 1200);
  }catch(e){
    statusEl.textContent = "تعذّر الحفظ: " + (e.message || e.code);
  }
};

async function refreshUsersAndPendingLists(){
  // دفاع بالعمق: حتى لو فُتحت اللوحة بطريقة ما، لا تُحمّل بيانات المستخدمين لغير المشرف
  if (!isAdminUser()) return;
  const usersListEl = document.getElementById("usersList");
  const pendingListEl = document.getElementById("pendingList");
  usersListEl.innerHTML = "جارِ التحميل…";
  pendingListEl.innerHTML = "جارِ التحميل…";

  // خريطة uid -> اسم المستخدم (تُستخدم لعرض "أضافه فلان" بقائمة الاعتماد)
  const uidToName = new Map();
  uidToName.set(currentUser.uid, currentUser.displayName);

  try{
    // نعرض كل المستخدمين عدا المشرف نفسه
    const usersSnap = await db.collection("users").get();
    usersSnap.forEach(doc => uidToName.set(doc.id, doc.data().displayName));

    const others = [];
    usersSnap.forEach(doc => { if (doc.id !== currentUser.uid) others.push(doc); });

    if (!others.length){
      usersListEl.innerHTML = `<span style="color:#999;font-size:13px">لا يوجد مستخدمون آخرون بعد</span>`;
    } else {
      usersListEl.innerHTML = "";
      others.forEach(doc => {
        const u = doc.data();
        const uid = doc.id;
        const status = u.status || "active";
        const isAdm = u.role === "admin";

        const badge = isAdm
          ? `<span class="status-badge status-admin">مشرف</span>`
          : status === "pending"
            ? `<span class="status-badge status-pending">بانتظار التفعيل</span>`
            : status === "blocked"
              ? `<span class="status-badge status-blocked">محظور</span>`
              : `<span class="status-badge status-active">فعّال</span>`;

        const card = document.createElement("div");
        card.className = "user-card";
        card.innerHTML = `
          <div class="user-card-top">
            <div>
              <div class="user-card-name">${escapeHtml(u.displayName || "—")}</div>
              <div class="user-card-sub">🔗 ${u.scopePersonId ? escapeHtml(scopeChainLabel(u)) : "<span style=\'color:#B3261E\'>لا نطاق — لن تعمل شجرتي ولا ملفه</span>"}</div>
            </div>
            ${badge}
          </div>
          <div class="user-card-actions"></div>`;

        const actions = card.querySelector(".user-card-actions");

        if (!isAdm){
          // تفعيل / حظر
          if (status === "pending"){
            const b = document.createElement("button");
            b.textContent = "✅ تفعيل";
            b.style.cssText = "background:#E3F5EA; color:#1E7A4C; border-color:#1E7A4C;";
            b.onclick = async () => {
              await db.collection("users").doc(uid).update({ status: "active" });
              refreshUsersAndPendingLists();
            };
            actions.appendChild(b);
          } else if (status === "active"){
            const b = document.createElement("button");
            b.textContent = "🚫 حظر";
            b.onclick = async () => {
              await db.collection("users").doc(uid).update({ status: "blocked" });
              refreshUsersAndPendingLists();
            };
            actions.appendChild(b);
          } else {
            const b = document.createElement("button");
            b.textContent = "↩️ رفع الحظر";
            b.onclick = async () => {
              await db.collection("users").doc(uid).update({ status: "active" });
              refreshUsersAndPendingLists();
            };
            actions.appendChild(b);
          }

          // الصلاحيات
          const pb = document.createElement("button");
          pb.textContent = "🔑 الصلاحيات";
          pb.style.cssText = "background:#FFF3D6; color:#A67C00; border-color:#C9A227;";
          pb.onclick = () => openPermsEditor(uid, u);
          actions.appendChild(pb);
        }

        // حذف
        const db_ = document.createElement("button");
        db_.textContent = "🗑️ حذف";
        db_.style.cssText = "background:#FDE7E7; color:#B3261E; border-color:#B3261E;";
        db_.onclick = async () => {
          if (!confirm(`حذف المستخدم "${u.displayName}"؟\nهذا يمنعه من الدخول، ولا يحذف إضافاته السابقة.`)) return;
          await db.collection("users").doc(uid).delete();
          refreshUsersAndPendingLists();
        };
        actions.appendChild(db_);

        usersListEl.appendChild(card);
      });
    }
  }catch(e){
    usersListEl.innerHTML = "تعذّر التحميل: " + (e.message || e.code);
  }

  try{
    const pendingSnap = await db.collection("persons").where("pendingApproval", "==", true).get();
    if (pendingSnap.empty){
      pendingListEl.innerHTML = `<span style="color:#999;font-size:13px">لا يوجد إضافات بانتظار الاعتماد</span>`;
    } else {
      pendingListEl.innerHTML = "";
      for (const doc of pendingSnap.docs){
        const p = doc.data();
        let parentName = "؟";
        if (p.parentId){
          try{
            const parentSnap = await db.collection("persons").doc(p.parentId).get();
            if (parentSnap.exists) parentName = parentSnap.data().name;
          }catch(e){}
        }
        const adderName = uidToName.get(p.addedBy) || "غير معروف";
        const row = document.createElement("div");
        row.style.cssText = "display:flex; flex-direction:column; gap:6px; margin-bottom:8px; padding:8px; background:#FFF8E1; border-radius:8px; cursor:pointer;";
        row.innerHTML = `
          <div style="color:#241a10;"><b>${escapeHtml(p.name)}</b> — ابن لـ <b>${escapeHtml(parentName)}</b></div>
          <div style="font-size:12px; color:#777;">أضافه: ${escapeHtml(adderName)} — اضغط لعرض موقعه بالخريطة 📍</div>
          <div><button class="f-btn-sm approve-btn" style="margin-left:6px;">✅ اعتماد</button><button class="f-btn-sm reject-btn" style="background:#8B1E1E;">✕ رفض</button></div>
        `;
        row.onclick = () => jumpToPerson(doc.id);
        row.querySelector(".approve-btn").onclick = async (event) => {
          event.stopPropagation();
          await db.collection("persons").doc(doc.id).update({ pendingApproval: false });
          refreshUsersAndPendingLists();
          await loadTreeFromFirestore();
        };
        row.querySelector(".reject-btn").onclick = async (event) => {
          event.stopPropagation();
          if (!confirm(`رفض وحذف "${p.name}"؟`)) return;
          await db.collection("persons").doc(doc.id).delete();
          refreshUsersAndPendingLists();
        };
        pendingListEl.appendChild(row);
      }
    }
  }catch(e){
    pendingListEl.innerHTML = "تعذّر التحميل: " + (e.message || e.code);
  }
}

const treeData = {
  "name": "محمد أسمل الحكمي",
  "type": "root",
  "children": [
    {
      "name": "هادي",
      "type": "trunk",
      "children": [
        {
          "name": "عزالدين",
          "type": "trunk",
          "children": [
            {
              "name": "إبراهيم",
              "type": "leaf"
            },
            {
              "name": "مهدي",
              "type": "leaf"
            },
            {
              "name": "هادي",
              "type": "trunk",
              "children": [
                {
                  "name": "علي",
                  "type": "trunk",
                  "children": [
                    {
                      "name": "عزالدين",
                      "type": "trunk",
                      "children": [
                        {
                          "name": "إبراهيم",
                          "type": "leaf"
                        },
                        {
                          "name": "أحمد",
                          "type": "leaf"
                        },
                        {
                          "name": "حمد",
                          "type": "trunk",
                          "children": [
                            {
                              "name": "أحمد",
                              "type": "leaf"
                            }
                          ]
                        },
                        {
                          "name": "هادي",
                          "type": "trunk",
                          "children": [
                            {
                              "name": "عبده",
                              "type": "leaf"
                            },
                            {
                              "name": "علي طيب",
                              "type": "trunk",
                              "children": [
                                {
                                  "name": "عبده طيب",
                                  "type": "trunk",
                                  "children": [
                                    {
                                      "name": "أحمد طيب",
                                      "type": "leaf"
                                    }
                                  ]
                                }
                              ]
                            },
                            {
                              "name": "حمد",
                              "type": "leaf"
                            },
                            {
                              "name": "عزالدين",
                              "type": "trunk",
                              "children": [
                                {
                                  "name": "بكري",
                                  "type": "leaf"
                                }
                              ]
                            },
                            {
                              "name": "أحمد",
                              "type": "leaf"
                            },
                            {
                              "name": "إبراهيم",
                              "type": "trunk",
                              "children": [
                                {
                                  "name": "علي",
                                  "type": "joinpoint",
                                  "isJoinPoint": true,
                                  "children": [
                                    {
                                        "name": "مهدي",
                                        "type": "trunk-red",
                                        "children": [
                                          {
                                            "name": "علي",
                                            "type": "trunk-red",
                                            "children": [
                                              {
                                                "name": "أحمد",
                                                "type": "trunk-red"
                                              },
                                              {
                                                "name": "محمد",
                                                "type": "trunk-red",
                                                "children": [
                                                  {
                                                    "name": "عبده",
                                                    "type": "trunk-red",
                                                    "children": [
                                                      {
                                                        "name": "علي",
                                                        "type": "trunk-red",
                                                        "children": [
                                                          {
                                                            "name": "زيد",
                                                            "type": "trunk-red"
                                                          },
                                                          {
                                                            "name": "عبدالوهاب",
                                                            "type": "trunk-red"
                                                          },
                                                          {
                                                            "name": "عبدالله",
                                                            "type": "trunk-red"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "جبران",
                                                        "type": "trunk-red",
                                                        "children": [
                                                          {
                                                            "name": "عبد المجيد",
                                                            "type": "trunk-red"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "مهدي",
                                                        "type": "trunk-red",
                                                        "children": [
                                                          {
                                                            "name": "نادر",
                                                            "type": "trunk-red"
                                                          },
                                                          {
                                                            "name": "علي",
                                                            "type": "trunk-red"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "مساعد",
                                                        "type": "trunk-red",
                                                        "children": [
                                                          {
                                                            "name": "خالد",
                                                            "type": "trunk-red"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "عزالدين",
                                                    "type": "trunk-red",
                                                    "children": [
                                                      {
                                                        "name": "أحمد",
                                                        "type": "trunk-red"
                                                      },
                                                      {
                                                        "name": "سمير",
                                                        "type": "trunk-red"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "أحمد",
                                                    "type": "trunk-red",
                                                    "children": [
                                                      {
                                                        "name": "محمد",
                                                        "type": "trunk-red",
                                                        "children": [
                                                          {
                                                            "name": "ياسر",
                                                            "type": "trunk-red"
                                                          },
                                                          {
                                                            "name": "عزالدين",
                                                            "type": "trunk-red"
                                                          },
                                                          {
                                                            "name": "أحمد",
                                                            "type": "trunk-red"
                                                          },
                                                          {
                                                            "name": "عبدالرحمن",
                                                            "type": "trunk-red"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عزالدين",
                                                        "type": "trunk-red",
                                                        "children": [
                                                          {
                                                            "name": "سامي",
                                                            "type": "trunk-red"
                                                          },
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-red"
                                                          },
                                                          {
                                                            "name": "أحمد",
                                                            "type": "trunk-red",
                                                            "children": [
                                                              {
                                                                "name": "فارس",
                                                                "type": "trunk-red"
                                                              }
                                                            ]
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عبدالله",
                                                        "type": "trunk-red",
                                                        "children": [
                                                          {
                                                            "name": "بسام",
                                                            "type": "trunk-red"
                                                          },
                                                          {
                                                            "name": "سعود",
                                                            "type": "trunk-red"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  }
                                                ]
                                              }
                                            ]
                                          },
                                          {
                                            "name": "عزالدين",
                                            "type": "trunk-red",
                                            "children": [
                                              {
                                                "name": "أحمد",
                                                "type": "trunk-red"
                                              }
                                            ]
                                          }
                                        ]
                                      },
                                    {
                                        "name": "صديق",
                                        "type": "trunk-blue",
                                        "children": [
                                          {
                                            "name": "باشة",
                                            "type": "trunk-blue",
                                            "children": [
                                              {
                                                "name": "علي",
                                                "type": "trunk-blue",
                                                "children": [
                                                  {
                                                    "name": "أحمد",
                                                    "type": "trunk-blue"
                                                  },
                                                  {
                                                    "name": "صديق",
                                                    "type": "trunk-blue"
                                                  },
                                                  {
                                                    "name": "سلمان",
                                                    "type": "trunk-blue"
                                                  },
                                                  {
                                                    "name": "محمد",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "المقداد",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "ياسر",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "طارق",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "إبراهيم",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "تركي",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "علي",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "عبدالرحمن",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "مصعب",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  }
                                                ]
                                              },
                                              {
                                                "name": "عثمان",
                                                "type": "trunk-blue"
                                              }
                                            ]
                                          },
                                          {
                                            "name": "إبراهيم",
                                            "type": "trunk-blue",
                                            "children": [
                                              {
                                                "name": "عبده",
                                                "type": "trunk-blue",
                                                "children": [
                                                  {
                                                    "name": "محمد",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "عبدالملك",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "أسامة",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "علي",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "إسماعيل",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "أحمد",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "عبدالرحمن",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "نواف",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "صديق",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "عبد الرحمن",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "عبدالعزيز",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "لؤي",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "علي",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "ريان",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "نايف",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "نواف",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "عبدالله",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "عبدالرحمن",
                                                        "type": "trunk-blue",
                                                        "children": [
                                                          {
                                                            "name": "علي",
                                                            "type": "trunk-blue"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  }
                                                ]
                                              },
                                              {
                                                "name": "علي",
                                                "type": "trunk-blue",
                                                "children": [
                                                  {
                                                    "name": "محمد",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "حسن",
                                                        "type": "trunk-blue",
                                                        "children": [
                                                          {
                                                            "name": "منذر",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "عاصم",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "آسر",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "خالد",
                                                            "type": "trunk-blue"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عمرو",
                                                        "type": "trunk-blue",
                                                        "children": [
                                                          {
                                                            "name": "عبدالله",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "معاذ",
                                                            "type": "trunk-blue"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "علي",
                                                        "type": "trunk-blue",
                                                        "children": [
                                                          {
                                                            "name": "تميم",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "وسيم",
                                                            "type": "trunk-blue"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "سعد",
                                                        "type": "trunk-blue",
                                                        "children": [
                                                          {
                                                            "name": "نايف",
                                                            "type": "trunk-blue"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "نواف",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "لطفي",
                                                        "type": "trunk-blue",
                                                        "children": [
                                                          {
                                                            "name": "بتال",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "هتان",
                                                            "type": "trunk-blue"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "أحمد",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "علي",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "لطفي",
                                                        "type": "trunk-blue",
                                                        "children": [
                                                          {
                                                            "name": "شاكر",
                                                            "type": "trunk-blue"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عابد",
                                                        "type": "trunk-blue",
                                                        "children": [
                                                          {
                                                            "name": "معتز",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "نجيب",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "حمزة",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "صفوان",
                                                            "type": "trunk-blue"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  }
                                                ]
                                              },
                                              {
                                                "name": "حمد",
                                                "type": "trunk-blue",
                                                "children": [
                                                  {
                                                    "name": "فيصل",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "خالد",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "سعود",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "محمد",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "رائد",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "بكر",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "عبدالله",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "بكر",
                                                    "type": "trunk-blue"
                                                  }
                                                ]
                                              },
                                              {
                                                "name": "مقعش",
                                                "type": "trunk-blue"
                                              }
                                            ]
                                          },
                                          {
                                            "name": "علي",
                                            "type": "trunk-blue",
                                            "children": [
                                              {
                                                "name": "عثمان",
                                                "type": "trunk-blue",
                                                "children": [
                                                  {
                                                    "name": "علي",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "عثمان",
                                                        "type": "trunk-blue",
                                                        "children": [
                                                          {
                                                            "name": "عبدالعزيز",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "عبدالرحمن",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "أحمد",
                                                            "type": "trunk-blue"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عبدالله",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "إبراهيم",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "عبدالرحمن",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "مهند",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "محمد",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "عمر",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "صديق",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "أبو بكر",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "محمود",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "أحمد",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "طلال",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "حاتم",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "محمد",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "محمد",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "سعود",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  }
                                                ]
                                              },
                                              {
                                                "name": "إبراهيم",
                                                "type": "trunk-blue",
                                                "children": [
                                                  {
                                                    "name": "حسن",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "مصعب",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "خالد",
                                                        "type": "trunk-blue",
                                                        "children": [
                                                          {
                                                            "name": "حسن",
                                                            "type": "trunk-blue"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عبدالرحمن",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "علي",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "معاذ",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "زياد",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "إبراهيم",
                                                        "type": "trunk-blue",
                                                        "children": [
                                                          {
                                                            "name": "سعود",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "وليد",
                                                            "type": "trunk-blue"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "صديق",
                                                        "type": "trunk-blue",
                                                        "children": [
                                                          {
                                                            "name": "وسام",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "وسيم",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "فارس",
                                                            "type": "trunk-blue"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  }
                                                ]
                                              },
                                              {
                                                "name": "علي",
                                                "type": "trunk-blue",
                                                "children": [
                                                  {
                                                    "name": "تركي",
                                                    "type": "trunk-blue"
                                                  },
                                                  {
                                                    "name": "ماجد",
                                                    "type": "trunk-blue"
                                                  },
                                                  {
                                                    "name": "فهد",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "تركي",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "نواف",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "سلطان",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "ماجد",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "عبدالعزيز",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "خالد",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "علي",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "خالد",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "عبدالله",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "فيصل",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  }
                                                ]
                                              },
                                              {
                                                "name": "صديق",
                                                "type": "trunk-blue",
                                                "children": [
                                                  {
                                                    "name": "علي",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "أنس",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "سلمان",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "وليد",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "خالد",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "بسام",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "محمد",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "وليد",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "طلال",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "ممدوح",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "تركي",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "فواز",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "ماجد",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "بدر",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "فيصل",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "نواف",
                                                        "type": "trunk-blue"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "خالد",
                                                    "type": "trunk-blue",
                                                    "children": [
                                                      {
                                                        "name": "ناصر",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "فهد",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "نايف",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "راشد",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "نواف",
                                                        "type": "trunk-blue"
                                                      },
                                                      {
                                                        "name": "عبدالعزيز",
                                                        "type": "trunk-blue",
                                                        "children": [
                                                          {
                                                            "name": "سلطان",
                                                            "type": "trunk-blue"
                                                          },
                                                          {
                                                            "name": "خالد",
                                                            "type": "trunk-blue"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  }
                                                ]
                                              }
                                            ]
                                          }
                                        ]
                                      },
                                    {
                                        "name": "محمد",
                                        "type": "trunk-gold",
                                        "children": [
                                          {
                                            "name": "علي",
                                            "type": "trunk-gold",
                                            "children": [
                                              {
                                                "name": "محمد",
                                                "type": "trunk-gold",
                                                "children": [
                                                  {
                                                    "name": "علي",
                                                    "type": "trunk-gold"
                                                  },
                                                  {
                                                    "name": "أحمد علاالله",
                                                    "type": "trunk-gold"
                                                  }
                                                ]
                                              },
                                              {
                                                "name": "صديق",
                                                "type": "trunk-gold",
                                                "children": [
                                                  {
                                                    "name": "محمد",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "مهدي",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "أديب",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "أصيل",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "ريان",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "إبراهيم",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "صديق",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "أيوب",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "صديق",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "إلياس",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عثمان",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "عبدالرزاق",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "المثنى",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "البراء",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "أويس",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "حسن",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "عبدالكريم",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عبدالله",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "مؤيد",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "علي",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "محمد",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "إبراهيم",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عبدالإله",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "نواف",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "مهدي",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "عبدالعزيز",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "أنس",
                                                                "type": "trunk-gold"
                                                              },
                                                              {
                                                                "name": "عمر",
                                                                "type": "trunk-gold"
                                                              },
                                                              {
                                                                "name": "أيمن",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "عثمان",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "بسام",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "مشاري",
                                                                "type": "trunk-gold"
                                                              },
                                                              {
                                                                "name": "عبدالله",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "عبدالرحمن",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "مياد",
                                                                "type": "trunk-gold"
                                                              },
                                                              {
                                                                "name": "هشام",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "صديق",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "حذيفة",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "مهدي",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "محمد",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "صديق",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "محمد",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "إبراهيم",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عبدالله",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "إبراهيم",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "إسماعيل",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "إسحاق",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "يعقوب",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "يوسف",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "ماهر",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "يونس",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عبدالله",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "الحسن",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "أمير",
                                                                "type": "trunk-gold"
                                                              },
                                                              {
                                                                "name": "مهدي",
                                                                "type": "trunk-gold"
                                                              },
                                                              {
                                                                "name": "إبراهيم",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "الحسين",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عبدالرحمن",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "صديق",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "مهدي",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "صديق",
                                                                "type": "trunk-gold"
                                                              },
                                                              {
                                                                "name": "ياسين",
                                                                "type": "trunk-gold"
                                                              },
                                                              {
                                                                "name": "سلطان",
                                                                "type": "trunk-gold"
                                                              },
                                                              {
                                                                "name": "محمد",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "إبراهيم",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "حسن",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عبد الكريم",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  }
                                                ]
                                              },
                                              {
                                                "name": "مهدي",
                                                "type": "trunk-gold",
                                                "children": [
                                                  {
                                                    "name": "محمد",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "مهدي",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عثمان",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "عدي",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "هيثم",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "مجاهد",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "صديق",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "مازن",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "المعتز",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "مثنى",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "طارق",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "نايف",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "فارس",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "مشعل",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "فراس",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "نادر",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "رائف",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "يعقوب",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "رؤوف",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  }
                                                ]
                                              },
                                              {
                                                "name": "عثمان",
                                                "type": "trunk-gold",
                                                "children": [
                                                  {
                                                    "name": "محمد",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "عبدالوهاب",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "عثمان",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "سطام",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "متعب",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "مشعل",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "مشاري",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "إبراهيم",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "محمد",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "إبراهيم",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "حافظ",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "إبراهيم",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "صديق",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "محمد",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "وسام",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "وسيم",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "راكان",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "ثامر",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "حكيم",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "عبدالرزاق",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "إبراهيم",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "عثمان",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "مثنى",
                                                        "type": "trunk-gold"
                                                      }
                                                    ]
                                                  }
                                                ]
                                              }
                                            ]
                                          },
                                          {
                                            "name": "مهدي",
                                            "type": "trunk-gold",
                                            "children": [
                                              {
                                                "name": "عبدالله",
                                                "type": "trunk-gold",
                                                "children": [
                                                  {
                                                    "name": "عبدالرحمن",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "عبدالله",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "فراس",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "محمد",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "فراس",
                                                        "type": "trunk-gold"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "أحمد",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "عبدالرحمن",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "عبدالعزيز",
                                                        "type": "trunk-gold"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "عبدالعزيز",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "سعود",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "عاصم",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "عبدالله",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "عبدالعزيز",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "أبي",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "عبدالرزاق",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "عمر",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "عبدالله",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "عبدالرزاق",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "أيمن",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "عبدالرحمن",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "سلطان",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "تركي",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "محمد",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "مؤيد",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "أنس",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "عبدالله",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "حكم",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عبدالوهاب",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "مالك",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "طارق",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عبدالوهاب",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "لؤي",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "قصي",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "حكم",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "فيصل",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عبدالله",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "بتال",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "مهند",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "هتان",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "عبدالوهاب",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "وليد",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "محمد",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "عبدالله",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "أوس",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عبدالعزيز",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "قسورة",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "غسان",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "إبراهيم",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "وهيب",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "محمد",
                                                        "type": "trunk-gold"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "علي",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "عبدالله",
                                                        "type": "trunk-gold"
                                                      }
                                                    ]
                                                  }
                                                ]
                                              },
                                              {
                                                "name": "صديق",
                                                "type": "trunk-gold"
                                              },
                                              {
                                                "name": "محمد",
                                                "type": "trunk-gold"
                                              },
                                              {
                                                "name": "الحسن",
                                                "type": "trunk-gold",
                                                "children": [
                                                  {
                                                    "name": "علي",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "عبدالإله",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "الحسن",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "فهد",
                                                        "type": "trunk-gold"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "إبراهيم",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "عبدالله",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "نادر",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "يوسف",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "الحسن",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "إبراهيم",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "إياد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "هاشم",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  }
                                                ]
                                              },
                                              {
                                                "name": "عزالدين",
                                                "type": "trunk-gold",
                                                "children": [
                                                  {
                                                    "name": "محمد",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "مهدي",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "عبدالله",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "فهد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عبدالعزيز",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "أحمد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "حامد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عمر",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عاصم",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "يزن",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "أصيل",
                                                                "type": "trunk-gold"
                                                              },
                                                              {
                                                                "name": "عبدالعزيز",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "مكي",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "علي",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "يحيى",
                                                        "type": "trunk-gold"
                                                      }
                                                    ]
                                                  }
                                                ]
                                              },
                                              {
                                                "name": "علي",
                                                "type": "trunk-gold",
                                                "children": [
                                                  {
                                                    "name": "عبدالوهلب",
                                                    "type": "trunk-gold"
                                                  },
                                                  {
                                                    "name": "عمر",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "قاسم",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "علي",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "عماد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "علاء",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عمر",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عبدالوهاب",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "حسن",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عدي",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عمرو",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "حسن",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "عبدالمجيد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عمر",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "حسن",
                                                                "type": "trunk-gold"
                                                              },
                                                              {
                                                                "name": "تركي",
                                                                "type": "trunk-gold"
                                                              },
                                                              {
                                                                "name": "فارس",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "عبدالله",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "حسن",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "عبدالرحمن",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عبدالعزيز",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عبدالوهاب",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "علي",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عمر",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "راكان",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "حازم",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "أحمد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "حمزة",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "عبدالوهاب",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "محمد",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "عبدالوهاب",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "ريان",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عمر",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "محمد",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "هيثم",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عبدالرحمن",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "محمد",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "قاسم",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "أسامة",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "عمر",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "أمير",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "إبراهيم",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عبدالله",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "علي",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "أسامة",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "ناصر",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "إبراهيم",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "أحمد",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "علي",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "حسن",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "محمد",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "سامي",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "أحمد",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "عبدالرحمن",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "يوسف",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "أياد",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "هشام",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "عبدالعزيز",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عبدالله",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "أنمار",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "خالد",
                                                        "type": "trunk-gold"
                                                      }
                                                    ]
                                                  }
                                                ]
                                              },
                                              {
                                                "name": "إبراهيم",
                                                "type": "trunk-gold"
                                              },
                                              {
                                                "name": "أحمد",
                                                "type": "trunk-gold",
                                                "children": [
                                                  {
                                                    "name": "محمد",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "صديق",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "أحمد",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "مهدي",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "مصعب",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "أيمن",
                                                                "type": "trunk-gold"
                                                              },
                                                              {
                                                                "name": "إيهاب",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عبدالرحمن",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عبدالله",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "خالد",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "عبداللطيف",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "نجيب",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "لبيب",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "أريب",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "وليد",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "نجيب",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "علي",
                                                            "type": "trunk-gold",
                                                            "children": [
                                                              {
                                                                "name": "رشاد",
                                                                "type": "trunk-gold"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "صهيب",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "أحمد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "صديق",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "مهدي",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "موسى",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عبداللطيف",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "أسامة",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "عبدالله",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "تركي",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "موسى",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "عبدالله",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "مجاهد",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "معتصم",
                                                        "type": "trunk-gold"
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "مهدي",
                                                    "type": "trunk-gold"
                                                  },
                                                  {
                                                    "name": "عبدالرحمن",
                                                    "type": "trunk-gold"
                                                  },
                                                  {
                                                    "name": "عبدالله",
                                                    "type": "trunk-gold"
                                                  },
                                                  {
                                                    "name": "حسن",
                                                    "type": "trunk-gold"
                                                  }
                                                ]
                                              },
                                              {
                                                "name": "عبدالرحمن",
                                                "type": "trunk-gold",
                                                "children": [
                                                  {
                                                    "name": "قاسم",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "خالد",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "قاسم",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "بندر",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عمر",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "حسن",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "أصيل",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "أديب",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "قاسم",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عبدالرحمن",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "أحمد",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "محمد",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "عادل",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "قاسم",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  },
                                                  {
                                                    "name": "محمد",
                                                    "type": "trunk-gold",
                                                    "children": [
                                                      {
                                                        "name": "فريد",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "قاسم",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "منصور",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "عمران",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "الحسن",
                                                        "type": "trunk-gold"
                                                      },
                                                      {
                                                        "name": "فيصل",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عبدالرحمن",
                                                        "type": "trunk-gold",
                                                        "children": [
                                                          {
                                                            "name": "عبدالعزيز",
                                                            "type": "trunk-gold"
                                                          },
                                                          {
                                                            "name": "فريد",
                                                            "type": "trunk-gold"
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  }
                                                ]
                                              }
                                            ]
                                          }
                                        ]
                                      },
                                    {
                                        "name": "عثمان",
                                        "type": "trunk-green",
                                        "children": [
                                          {
                                            "name": "عزالدين",
                                            "type": "trunk-green",
                                            "children": [
                                              {
                                                "name": "عبدالله",
                                                "type": "trunk-green",
                                                "children": [
                                                  {
                                                    "name": "علي",
                                                    "type": "trunk-green",
                                                    "children": [
                                                      {
                                                        "name": "محمد",
                                                        "type": "trunk-green",
                                                        "children": [
                                                          {
                                                            "name": "عصام",
                                                            "type": "trunk-green",
                                                            "children": [
                                                              {
                                                                "name": "محمد",
                                                                "type": "trunk-green"
                                                              },
                                                              {
                                                                "name": "مازن",
                                                                "type": "trunk-green"
                                                              },
                                                              {
                                                                "name": "يزن",
                                                                "type": "trunk-green"
                                                              },
                                                              {
                                                                "name": "وائل",
                                                                "type": "trunk-green"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "أبراهيم",
                                                            "type": "trunk-green",
                                                            "children": [
                                                              {
                                                                "name": "وائل",
                                                                "type": "trunk-green"
                                                              },
                                                              {
                                                                "name": "محمد",
                                                                "type": "trunk-green"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "حاتم",
                                                            "type": "trunk-green",
                                                            "children": [
                                                              {
                                                                "name": "محمد",
                                                                "type": "trunk-green"
                                                              },
                                                              {
                                                                "name": "ريسان",
                                                                "type": "trunk-green"
                                                              },
                                                              {
                                                                "name": "آسر",
                                                                "type": "trunk-green"
                                                              },
                                                              {
                                                                "name": "براء",
                                                                "type": "trunk-green"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "وائل",
                                                            "type": "trunk-green",
                                                            "children": [
                                                              {
                                                                "name": "رامي",
                                                                "type": "trunk-green"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "فاروق",
                                                            "type": "trunk-green",
                                                            "children": [
                                                              {
                                                                "name": "عصام",
                                                                "type": "trunk-green"
                                                              },
                                                              {
                                                                "name": "علي",
                                                                "type": "trunk-green"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "عبدالله",
                                                            "type": "trunk-green"
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "عبدالله",
                                                        "type": "trunk-green",
                                                        "children": [
                                                          {
                                                            "name": "محمد",
                                                            "type": "trunk-green",
                                                            "children": [
                                                              {
                                                                "name": "عبدالله",
                                                                "type": "trunk-green"
                                                              },
                                                              {
                                                                "name": "فهد",
                                                                "type": "trunk-green"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "علي",
                                                            "type": "trunk-green",
                                                            "children": [
                                                              {
                                                                "name": "عبدالله",
                                                                "type": "trunk-green"
                                                              },
                                                              {
                                                                "name": "محمد",
                                                                "type": "trunk-green"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "عثمان",
                                                            "type": "trunk-green",
                                                            "children": [
                                                              {
                                                                "name": "محمد",
                                                                "type": "trunk-green"
                                                              },
                                                              {
                                                                "name": "مهند",
                                                                "type": "trunk-green"
                                                              }
                                                            ]
                                                          }
                                                        ]
                                                      },
                                                      {
                                                        "name": "علي",
                                                        "type": "trunk-green",
                                                        "children": [
                                                          {
                                                            "name": "عبدالرحمن",
                                                            "type": "trunk-green",
                                                            "children": [
                                                              {
                                                                "name": "يزن",
                                                                "type": "trunk-green"
                                                              }
                                                            ]
                                                          },
                                                          {
                                                            "name": "عبدالله",
                                                            "type": "trunk-green",
                                                            "children": [
                                                              {
                                                                "name": "عصام",
                                                                "type": "trunk-green"
                                                              }
                                                            ]
                                                          }
                                                        ]
                                                      }
                                                    ]
                                                  }
                                                ]
                                              }
                                            ]
                                          }
                                        ]
                                      }
                                  ]
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

try{
  const savedTree = localStorage.getItem("tree-data-edits");
  if (savedTree){
    const parsed = JSON.parse(savedTree);
    treeData.children = parsed.children;
  }
}catch(e){}

let root = d3.hierarchy(treeData);
const dx = 100, dy = 175;
d3.tree().nodeSize([dx, dy])(root);

let x0 = Infinity, x1 = -Infinity;
root.each(d => { if (d.x > x1) x1 = d.x; if (d.x < x0) x0 = d.x; });
let width = x1 - x0 + 180;
let height = (root.height + 1) * dy + 160;

const svg = d3.select("#tree-svg");
const containerW = svg.node().clientWidth || 1000;
const containerH = svg.node().clientHeight || 700;
svg.attr("viewBox", [0, 0, containerW, containerH]);
const g = svg.append("g");
const zoom = d3.zoom().scaleExtent([0.35, 4]).filter((e) => !manualMode || e.type === "wheel").on("zoom", (e) => g.attr("transform", e.transform));
svg.call(zoom);
const initScale = 0.68;

let layoutOverrides = new Map(); // personId -> {x,y} مواقع مخصّصة يدويًا (وضع التحريك اليدوي فقط)

function sx(d){ return d.x - x0 + 90; }
function sy(d){
  const ov = layoutOverrides.get(personId(d));
  if (ov) return ov.y;
  return height - 70 - d.depth * dy;
} // الجد الأول بالأسفل

function centerOnRoot(){
  const w = svg.node().clientWidth, h = svg.node().clientHeight;
  return d3.zoomIdentity
    .translate(w/2 - sx(root)*initScale, h*0.72 - sy(root)*initScale)
    .scale(initScale);
}

function jumpToPerson(personId){
  document.getElementById("usersPanel").classList.remove("show");
  document.getElementById("tree-wrap").classList.remove("tree-hidden");
  // تثبيت "شجرتي": الانتقال لشخص لا يُلغيها
  if (!personalTreeActive) exitFocusMode();
  const d = root.descendants().find(n => n.data.id === personId);
  if (!d){ customAlert("تعذّر إيجاد الشخص بالشجرة الحالية."); return; }
  const w = svg.node().clientWidth, h = svg.node().clientHeight;
  const targetScale = 1;
  const t = d3.zoomIdentity.translate(w/2 - sx(d)*targetScale, h/2 - sy(d)*targetScale).scale(targetScale);
  svg.transition().duration(600).call(zoom.transform, t);
  node.select(".ring").classed("show", n => n === d);
  setTimeout(() => { node.select(".ring").classed("show", false); }, 3000);
}

async function approvePendingPerson(d){
  if (!confirm(`اعتماد "${d.data.name}"؟`)) return;
  try{
    await db.collection("persons").doc(d.data.id).update({ pendingApproval: false });
    await loadTreeFromFirestore();
    refreshUsersAndPendingLists();
  }catch(e){ customAlert("تعذّر الاعتماد: " + (e.message || e.code)); }
}

async function rejectPendingPerson(d){
  if (!confirm(`رفض وحذف "${d.data.name}"؟`)) return;
  try{
    await db.collection("persons").doc(d.data.id).delete();
    await loadTreeFromFirestore();
    refreshUsersAndPendingLists();
  }catch(e){ customAlert("تعذّر الرفض: " + (e.message || e.code)); }
}

const R = { root:26, trunk:21, leaf:17, joinpoint:30, "trunk-red":21, "trunk-green":21, "trunk-blue":21, "trunk-gold":21, "female":15 };
let busYByParent, node;

let manualMode = false;
function saveLayoutOverrides(){
  try{ localStorage.setItem("layout-overrides-v2", JSON.stringify([...layoutOverrides.entries()])); }
  catch(e){ console.error("تعذر حفظ الترتيب اليدوي", e); }
}

const dragBehavior = d3.drag()
  .filter(() => manualMode)
  .on("start", function(event){ event.sourceEvent.stopPropagation(); d3.select(this).raise(); })
  .on("drag", function(event, d){
    const key = personId(d);
    const cur = layoutOverrides.get(key) || { x: sx(d), y: sy(d) };
    const next = { x: cur.x + event.dx, y: cur.y + event.dy };
    layoutOverrides.set(key, next);
    d3.select(this).attr("transform", `translate(${next.x},${next.y})`);
  })
  .on("end", function(){
    saveLayoutOverrides();
    refreshView(); // يستعيد "شجرتي" إن كانت مفعّلة
  });

function buildAndRender(){
  root = d3.hierarchy(treeData);
  d3.tree().nodeSize([dx, dy])(root);
  x0 = Infinity; x1 = -Infinity;
  root.each(d => { if (d.x > x1) x1 = d.x; if (d.x < x0) x0 = d.x; });
  width = x1 - x0 + 180;
  height = (root.height + 1) * dy + 160;

  g.selectAll("*").remove();

  // روابط بخطوط قائمة الزوايا (مثل مخططات النسب التقليدية) — كل رابط عنصر مستقل مربوط ببياناته
  busYByParent = new Map();
  root.links().forEach(l => {
    if (!busYByParent.has(l.source)) {
      busYByParent.set(l.source, (sy(l.source) + sy(l.target)) / 2);
    }
  });

  g.selectAll("path.link")
    .data(root.links())
    .join("path")
    .attr("class", l => "link" + (l.target.data.type === "female" ? " to-female" : ""))
    .attr("d", l => {
      const px_ = sx(l.source), py = sy(l.source);
      const cx = sx(l.target), cy = sy(l.target);
      const busY = busYByParent.get(l.source);
      return `M${px_},${py} L${px_},${busY} L${cx},${busY} L${cx},${cy}`;
    });

  node = g.selectAll("g.node")
    .data(root.descendants())
    .join("g")
    .attr("class", d => "node " + d.data.type)
    .attr("transform", d => `translate(${sx(d)},${sy(d)})`)
    .on("click", (event, d) => showInfo(d))
    .on("dblclick", (event, d) => {
      if (!manualMode) return;
      event.stopPropagation();
      layoutOverrides.delete(personId(d));
      saveLayoutOverrides();
      refreshView(); // يستعيد "شجرتي" إن كانت مفعّلة
    })
    .call(dragBehavior);

  node.append("circle").attr("class","hit").attr("r", 26);

  node.append("circle")
    .attr("class", d => "avatar-" + d.data.type)
    .attr("r", d => R[d.data.type]);

  node.append("circle")
    .attr("class","ring")
    .attr("r", d => R[d.data.type] + 6);

  // أيقونة شخص بسيطة داخل كل دائرة
  node.each(function(d){
    const r = R[d.data.type];
    const s = d3.select(this);
    s.append("circle").attr("class","glyph").attr("cy", -r*0.28).attr("r", r*0.26);
    s.append("path").attr("class","glyph")
      .attr("d", `M ${-r*0.42},${r*0.5} Q ${-r*0.42},${r*0.02} 0,${r*0.02} Q ${r*0.42},${r*0.02} ${r*0.42},${r*0.5} Z`);
  });

  // ثلاث خطوط حمراء فوق كل شخص "بانتظار الاعتماد" (تظهر لمحمد رشاد فقط)
  node.filter(d => d.data.pendingApproval).each(function(d){
    const r = R[d.data.type];
    const s = d3.select(this);
    const g2 = s.append("g").attr("class","pending-mark");
    [-r*0.55, 0, r*0.55].forEach(offsetY => {
      g2.append("line")
        .attr("x1", -r*0.85).attr("x2", r*0.85)
        .attr("y1", offsetY).attr("y2", offsetY)
        .attr("stroke", "#D6262A").attr("stroke-width", 2.4).attr("stroke-linecap", "round");
    });
  });

  // اعتماد ✅ / رفض ✕ مباشرة من الخريطة لكل شخص بانتظار الاعتماد
  node.filter(d => d.data.pendingApproval).each(function(d){
    const r = R[d.data.type];
    const s = d3.select(this);
    const approveBadge = s.append("g").attr("class","approve-badge")
      .attr("transform", `translate(${r*0.68},${-r*0.68})`)
      .on("click", (event) => { event.stopPropagation(); approvePendingPerson(d); });
    approveBadge.append("circle").attr("r", 10);
    approveBadge.append("text").attr("y", 0.5).text("✓");

    const rejectBadge = s.append("g").attr("class","reject-badge")
      .attr("transform", `translate(${-r*0.68},${-r*0.68})`)
      .on("click", (event) => { event.stopPropagation(); rejectPendingPerson(d); });
    rejectBadge.append("circle").attr("r", 10);
    rejectBadge.append("text").attr("y", 0.5).text("✕");
  });

  // علامة + لفتح نافذة المعلومات
  node.filter(d => !d.data.pendingApproval).each(function(d){
    const r = R[d.data.type];
    const s = d3.select(this);
    const badge = s.append("g").attr("class","plus-badge")
      .attr("transform", `translate(${r*0.68},${-r*0.68})`)
      .on("click", (event) => { event.stopPropagation(); openInfoModal(d); });
    badge.append("circle").attr("r", 10);
    badge.append("text").attr("y", 0.5).text("+");
  });

  // علامة - للحذف (مع تأكيد)
  node.filter(d => !d.data.pendingApproval).each(function(d){
    const r = R[d.data.type];
    const s = d3.select(this);
    const badge = s.append("g").attr("class","minus-badge")
      .attr("transform", `translate(${-r*0.68},${-r*0.68})`)
      .on("click", (event) => { event.stopPropagation(); confirmDeletePerson(d); });
    badge.append("circle").attr("r", 10);
    badge.append("text").attr("y", 0.5).text("−");
  });

  // نجمة بدل +/- لصاحب "شجرتي" أثناء التركيز عليه
  node.each(function(d){
    const r = R[d.data.type];
    const s = d3.select(this);
    const badge = s.append("g").attr("class","star-badge")
      .attr("transform", `translate(${r*0.68},${-r*0.68})`);
    badge.append("circle").attr("r", 10);
    badge.append("text").attr("y", 0.5).text("★");
  });

  // بطاقة الاسم أسفل كل أيقونة
  node.each(function(d){
    const r = R[d.data.type];
    const s = d3.select(this);
    const w = Math.max(56, d.data.name.length * 11 + 16);
    const h = 26;
    const yOff = r + 8;
    s.append("rect").attr("class","tag")
      .attr("x", -w/2).attr("y", yOff).attr("width", w).attr("height", h).attr("rx", 6);
    s.append("text").attr("class","tag-text")
      .attr("y", yOff + h/2).text(d.data.name);
    const branchTextColor = { "trunk-red":"#8B1E1E", "trunk-green":"#1E7A4C", "trunk-blue":"#1E7A9C", "trunk-gold":"#B8860B" };
    if (branchTextColor[d.data.type]) s.select(".tag-text").attr("fill", branchTextColor[d.data.type]);
  });
}

buildAndRender();
svg.call(zoom.transform, centerOnRoot());

function chainNames(d){
  const out = [];
  let a = d;
  while(a){ out.push(a.data.name); a = a.parent; }
  return out;
}

function modalTitleChain(d){
  const out = [];
  let a = d;
  while(a){
    out.push(a.data.name);
    if (a.data.isJoinPoint){
      if (a.parent) out.push(a.parent.data.name);
      break;
    }
    a = a.parent;
  }
  return out;
}

/* ============ حل مشكلة اختفاء/انقطاع قوائم الاقتراحات داخل النوافذ القابلة للتمرير ============
   ننقل أي قائمة اقتراحات (autocomplete-dropdown) إلى body مباشرة ونموضعها بالإحداثيات الفعلية
   على الشاشة (position:fixed)، بدل ما تبقى محصورة داخل صندوق اللوحة الأم وتنقطع بحوافها. */
function positionDropdownPortal(inputEl, dropdownEl){
  const r = inputEl.getBoundingClientRect();
  const isDesktop = window.matchMedia("(min-width:1024px) and (hover:hover) and (pointer:fine)").matches;
  // بسطح المكتب: القائمة تنسدل دائمًا للأسفل بدءًا من المربع النشط، وتتسع حتى 15 اقتراحًا قبل ظهور شريط التمرير
  const up = isDesktop ? false : dropdownEl.classList.contains("dropdown-up");
  const margin = 8;
  dropdownEl.style.position = "fixed";
  dropdownEl.style.left = r.left + "px";
  dropdownEl.style.right = "auto";
  dropdownEl.style.width = r.width + "px";
  if (up){
    const spaceAbove = Math.max(60, r.top - margin);
    dropdownEl.style.top = "auto";
    dropdownEl.style.bottom = (window.innerHeight - r.top + 6) + "px";
    dropdownEl.style.maxHeight = Math.min(220, spaceAbove) + "px";
  } else {
    const spaceBelow = Math.max(60, window.innerHeight - r.bottom - margin);
    dropdownEl.style.top = (r.bottom + 4) + "px";
    dropdownEl.style.bottom = "auto";
    // سطح المكتب: سقف يتسع لنحو 15 عنصرًا (~62px للعنصر) مقيّدًا بالمساحة الفعلية المتاحة أسفل المربع
    const cap = isDesktop ? 15 * 62 : 220;
    dropdownEl.style.maxHeight = Math.min(cap, spaceBelow) + "px";
  }
}
function portalShowDropdown(inputEl, dropdownEl){
  document.querySelectorAll(".autocomplete-dropdown.show").forEach(dd => {
    if (dd !== dropdownEl) dd.classList.remove("show");
  });
  if (dropdownEl.parentElement !== document.body) document.body.appendChild(dropdownEl);
  // حماية جذرية: نوقف انتشار ضغطات القائمة قبل أن تصل لمستمع "الضغط بمساحة فاضية".
  // بدون هذا، يُحذف عنصر الاقتراح من الصفحة فور اختياره، فيفشل فحص closest() في المستمع العام
  // ويُعامل الاختيار كضغطة بمساحة فاضية => تُغلق اللوحة وتُمسح بياناتها (يمنع إكمال حاسبة العلاقة).
  if (!dropdownEl._clickGuardAttached){
    dropdownEl.addEventListener("mousedown", e => e.stopPropagation());
    dropdownEl.addEventListener("click", e => e.stopPropagation());
    dropdownEl.addEventListener("touchstart", e => e.stopPropagation(), { passive: true });
    dropdownEl._clickGuardAttached = true;
  }
  dropdownEl._portalInput = inputEl;
  dropdownEl.style.zIndex = "200";
  positionDropdownPortal(inputEl, dropdownEl);
  dropdownEl.classList.add("show");
}
function repositionAllOpenDropdowns(){
  document.querySelectorAll(".autocomplete-dropdown.show").forEach(dd => {
    if (dd._portalInput) positionDropdownPortal(dd._portalInput, dd);
  });
}
window.addEventListener("scroll", repositionAllOpenDropdowns, true);
window.addEventListener("resize", repositionAllOpenDropdowns);

const searchInput = document.getElementById("search");
const searchDropdown = document.getElementById("searchDropdown");
let currentMatches = [];

// اسم العرض بالاقتراحات: يُدرج اللقب بين قوسين بعد الاسم الأول للتمييز
// مثال: "محمد (رشاد)" لمن اسمه محمد ولقبه رشاد
function displayNameWithNickname(d, nickIdx){
  const name = d.data.name;
  if (!nickIdx) return escapeHtml(name);
  const nick = nickIdx.get(firestorePersonInfoId(personId(d)));
  return nick ? `${escapeHtml(name)} <span class="nick-badge">(${escapeHtml(nick)})</span>` : escapeHtml(name);
}

let nicknameIndex = null; // Map: personId(sanitized) -> nickname
// ═══ اللقب كعنصر تمييز ═══
// في الاقتراحات: "محمد (رشاد) أحمد مهدي" — اللقب بين قوسين بعد الاسم الأول
// في بطاقة المعلومات: اللقب في نهاية السلسلة "— الملقب رشاد"
function nicknameOf(nodeOrId){
  if (!nicknameIndex) return "";
  const id = typeof nodeOrId === "string" ? nodeOrId : personId(nodeOrId);
  return nicknameIndex.get(id) || "";
}
function nameWithNickname(n){
  const nick = nicknameOf(n);
  return nick ? `${n.data.name} (${nick})` : n.data.name;
}
// سلسلة الاقتراح: الاسم الأول يحمل اللقب، والباقي كما هو
function chainWithNickname(n){
  const chain = chainNames(n);
  const nick = nicknameOf(n);
  if (!nick || !chain.length) return chain;
  const out = chain.slice();
  out[0] = `${out[0]} (${nick})`;
  return out;
}

async function ensureNicknameIndexLoaded(){
  if (nicknameIndex) return nicknameIndex;
  nicknameIndex = new Map();
  try{
    const snap = await db.collection("personInfo").get();
    snap.forEach(doc => {
      const data = doc.data();
      if (data.nickname) nicknameIndex.set(doc.id, data.nickname);
    });
  }catch(e){ console.error("تعذر تحميل فهرس الألقاب", e); nicknameIndex = new Map(); }
  return nicknameIndex;
}

async function runSearch(){
  const q = searchInput.value.trim();
  if (!q){
    // تثبيت "شجرتي": لا تُلغى بالبحث — نستعيدها بدل الخروج للشجرة الكاملة
    if (personalTreeActive) showPersonalTree(personalTreeActive);
    else exitFocusMode();
    node.select(".ring").classed("show", false);
    currentMatches = [];
    searchDropdown.classList.remove("show"); searchDropdown.innerHTML = "";
    return;
  }
  const parts = q.split(/\s+/).filter(Boolean);
  let matches;
  if (parts.length > 1){
    // بحث بسلسلة نسب: "مهدي محمد أحمد" = مهدي بن محمد بن أحمد
    matches = root.descendants().filter(d => {
      if (d.data.type === "female") return false;
      const chain = chainNames(d);
      if (chain.length < parts.length) return false;
      for (let i = 0; i < parts.length; i++){
        if (!chain[i].includes(parts[i])) return false;
      }
      return true;
    });
    // بحث بالاسم الأول + اللقب/الشهرة (مثال: "محمد برشيش")
    const nickIdx = await ensureNicknameIndexLoaded();
    const nickMatches = root.descendants().filter(d => {
      if (d.data.type === "female" || matches.includes(d)) return false;
      if (!d.data.name.includes(parts[0])) return false;
      const nick = nickIdx.get(firestorePersonInfoId(personId(d)));
      return nick && parts.slice(1).some(p => nick.includes(p));
    });
    matches = matches.concat(nickMatches);
  } else {
    matches = root.descendants().filter(d => d.data.type !== "female" && d.data.name.includes(q));
  }
  currentMatches = matches;

  searchDropdown.innerHTML = "";
  if (matches.length){
    const nickIdxForDisplay = await ensureNicknameIndexLoaded();
    matches.slice(0, 15).forEach(m => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";
      item.innerHTML = `${displayNameWithNickname(m, nickIdxForDisplay)}<span class="chain-sub">${chainNames(m).map(escapeHtml).join(" بن ")}</span>`;
      item.onclick = () => {
        searchDropdown.classList.remove("show"); searchDropdown.innerHTML = "";
        // بسطح المكتب تبقى اللوحة مفتوحة بعد الاختيار (تُغلق فقط بالضغط بمساحة فاضية أو بفتح تبويب آخر)
        if (!window.matchMedia("(min-width:1024px) and (hover:hover) and (pointer:fine)").matches){
          searchPanel.classList.remove("show");
        }
        showInfo(m);
      };
      searchDropdown.appendChild(item);
    });
    portalShowDropdown(searchInput, searchDropdown);
  } else {
    searchDropdown.classList.remove("show");
    // تثبيت "شجرتي": لا تُلغى بالبحث
    if (personalTreeActive) showPersonalTree(personalTreeActive);
    else exitFocusMode();
    node.select(".ring").classed("show", false);
    return;
  }

  const matchSet = new Set();
  const linkTargetSet = new Set();
  matches.forEach(m => {
    let a = m;
    while (a){
      matchSet.add(a);
      if (a.parent) linkTargetSet.add(a);
      a = a.parent;
    }
  });
  enterFocusMode(matchSet, linkTargetSet);
  node.select(".ring").classed("show", d => matches.includes(d));
}

searchInput.addEventListener("input", runSearch);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && currentMatches.length){
    showInfo(currentMatches[0]);
    searchInput.blur();
    searchDropdown.classList.remove("show");
  }
});

const sheet = document.getElementById("sheet");
const backdrop = document.getElementById("backdrop");
backdrop.onclick = () => { sheet.classList.remove("show"); backdrop.classList.remove("show"); };
const CURRENT_HIJRI_YEAR = 1447; // تقريبي لعام ٢٠٢٦م، يُستخدم لحساب العمر فقط

function nameChip(name, node){
  const chain = node ? modalTitleChain(node).join(" ") : "";
  return chain ? `<span class="name-chip" data-chain="${escapeHtml(chain)}">${escapeHtml(name)}</span>` : escapeHtml(name);
}

async function findSameMotherSiblings(personNode){
  const myInfo = await findMotherInfo(personNode);
  if (!myInfo || !myInfo.wifeId) return { siblings: [], grandfatherNode: null };
  const siblings = [];
  for (const n of root.descendants()){
    // "إخوة من الأم" تُذكر فقط عند اختلاف الأب. الإخوة من نفس الأب أشقاء، وذكرهم هنا حشو مضلل.
    if (n === personNode.parent) continue;
    const nData = await loadPersonData(personId(n));
    for (const w of (nData.wives || [])){
      if (w.wifeId === myInfo.wifeId){
        (w.children || []).forEach(childName => {
          if (childName !== personNode.data.name){
            const childNode = (n.children || []).find(c => c.data.name === childName) || null;
            siblings.push({ name: childName, node: childNode });
          }
        });
      }
    }
  }
  return { siblings, grandfatherNode: myInfo.grandfatherNode };
}

function showInfo(d){
  if (typeof bottomPanels !== "undefined") bottomPanels.forEach(p => p.classList.remove("show"));
  document.getElementById("ip-name").textContent = d.data.name;
  let chain = []; let a = d;
  while(a){ chain.push(a.data.name); a = a.parent; }
  // صيغة خاصة للزوجة: اسمها مركّب ("زوجة فلان فلان")، فلا يصح لصقه بنسب والدها بـ"بن".
  // الصيغة الصحيحة: "زوجة صديق مهدي ابنة محمد صديق علي"
  let pathHtml;
  if (d.data.type === "female" && /^(زوجة|طليقة)\s/.test(d.data.name || "")){
    const fatherChain = chain.slice(1); // نسب والدها (بدون اسمها المركّب)
    pathHtml = escapeHtml(d.data.name) + " ابنة " + fatherChain.map(escapeHtml).join(" ");
  } else {
    pathHtml = chain.map(escapeHtml).join(" بن ");
  }
  document.getElementById("ip-path").innerHTML = "سلسلة النسب: " + pathHtml + `<span id="ip-nickname" style="color:#8B5E1F; font-weight:700; display:none;"></span>` + `<span id="ip-rahimahu" style="color:#1E7A4C; font-weight:700; display:none;"> — رحمه الله</span>`;
  sheet.classList.add("show"); backdrop.classList.add("show");

  const card = document.getElementById("ip-card");
  card.innerHTML = `<div class="ip-empty">جارٍ التحميل…</div>`;

  const sonsInTree = d.children ? d.children.filter(c => c.data.type !== "female").length : 0;
  const daughters = d.children ? d.children.filter(c => c.data.type === "female") : [];

  Promise.all([
    loadPersonData(personId(d)),
    Promise.all(daughters.map(dt => loadPersonData(personId(dt)))),
    findSameMotherSiblings(d)
  ]).then(async ([data, daughtersData, sameMother]) => {
    document.getElementById("ip-rahimahu").style.display = data.deathStatus === "dead" ? "inline" : "none";
    // اللقب/الشهرة يظهر في نهاية سلسلة النسب كعنصر تمييز
    const nickEl = document.getElementById("ip-nickname");
    if (nickEl){
      if (data.nickname){
        nickEl.textContent = " — الملقب " + data.nickname;
        nickEl.style.display = "inline";
      } else {
        nickEl.style.display = "none";
      }
    }

    let unclesHtml = "";
    if (data.mother && data.mother.fatherId){
      const mgf = root.descendants().find(n => personId(n) === data.mother.fatherId);
      if (mgf){
        const uncles = (mgf.children || []).filter(c => c.data.type !== "female");
        if (uncles.length) unclesHtml = `<div class="ip-row"><span class="ip-label">الأخوال</span><span class="ip-value">${uncles.map(c => nameChip(c.data.name, c)).join("، ")}</span></div>`;
      }
    }

    let samMotherHtml = "";
    if (sameMother.siblings.length){
      samMotherHtml = `<div class="ip-row"><span class="ip-label">الإخوة من الأم</span><span class="ip-value">${sameMother.siblings.map(s => nameChip(s.name, s.node)).join("، ")}</span></div>`;
      if (sameMother.grandfatherNode){
        samMotherHtml += `<div class="ip-row"><span class="ip-label">والد الأم (الجد)</span><span class="ip-value">${nameChip(sameMother.grandfatherNode.data.name, sameMother.grandfatherNode)}</span></div>`;
      }
    }

    // الأصهار: زوج ابنة / والد زوجة / أخ زوجة / نسيب (العديل — من داخل القبيلة ومن خارجها)
    const sadahaList = [];
    daughtersData.forEach(dd => {
      if (dd.husband && !dd.husbandDivorced){
        // نعرض الاسم الثلاثي المحفوظ عند الاختيار من القائمة، وإلا نرجع للاسم المفرد
        sadahaList.push({ label: "زوج ابنة", name: dd.husbandChain || dd.husband, node: null });
      }
    });

    const insideWives = (data.wives || []).filter(w => w.type === "inside" && w.fatherId);
    for (const w of insideWives){
      const wifeFatherNode = root.descendants().find(n => personId(n) === w.fatherId);
      if (!wifeFatherNode) continue;
      if (w.fatherName) sadahaList.push({ label: "والد الزوجة", name: w.fatherChain || w.fatherName, node: wifeFatherNode });
      (wifeFatherNode.children || []).filter(c => c.data.type !== "female").forEach(b => {
        sadahaList.push({ label: "أخ زوجة", name: chainNames(b).slice(0, 3).join(" بن "), node: b });
      });
      const sisters = (wifeFatherNode.children || []).filter(c => c.data.type === "female");
      for (const sis of sisters){
        const sisData = await loadPersonData(personId(sis));
        if (sisData.husband && !sisData.husbandDivorced && sisData.husband !== d.data.name){
          sadahaList.push({ label: "نسيب (العديل)", name: sisData.husbandChain || sisData.husband, node: null });
        }
      }
    }

    // النوع الخامس: العديل من زوجة خارج القبيلة — يُشتق من العدلاء المعتمدين (w.inlaws).
    // هؤلاء صهرٌ حقيقي كنظرائهم من داخل القبيلة، وكانوا يُنشأون بقاعدة البيانات دون أن يُعرضوا هنا.
    const outsideWives = (data.wives || []).filter(w => w.type === "outside");
    for (const w of outsideWives){
      for (const inlaw of (w.inlaws || [])){
        if (!inlaw.confirmed || inlaw.divorced) continue;
        const inlawNode = root.descendants().find(n => personId(n) === inlaw.notaryId) || null;
        const nm = inlaw.notaryChain || inlaw.notaryName;
        if (!nm || sadahaList.some(s => s.name === nm)) continue;
        sadahaList.push({ label: "نسيب (العديل)", name: nm, node: inlawNode });
      }
    }

    // النوع السادس: العديل المعكوس — رجل من القبيلة أضافك أنت كعديل له،
    // فأُنشئ بملفك سجل زوجة مرتبط (linkedOutsideWifeId + sisterOfPersonId)
    for (const w of (data.wives || [])){
      if (!w.linkedOutsideWifeId || !w.sisterOfPersonId || w.divorced) continue;
      const srcNode = root.descendants().find(n => personId(n) === w.sisterOfPersonId) || null;
      const nm = srcNode ? chainNames(srcNode).slice(0, 3).join(" بن ") : w.sisterOfPersonName;
      if (!nm || sadahaList.some(s => s.name === nm)) continue;
      sadahaList.push({ label: "نسيب (العديل)", name: nm, node: srcNode });
    }

    const sadahaHtml = sadahaList.length
      ? `<div class="ip-row"><span class="ip-label">الأصهار</span></div>` +
        `<div class="ip-sadaha">${sadahaList.map(s => `<div class="ip-sadaha-item"><b>${s.label}:</b> ${nameChip(s.name, s.node)}</div>`).join("")}</div>`
      : "";

    const hasAny = data.birthYear || data.job || data.nickname || data.bio || data.photo || data.deathStatus === "dead" || sonsInTree || unclesHtml || sadahaHtml || samMotherHtml || data.husband || (data.sons && data.sons.length);
    if (!hasAny){ card.innerHTML = `<div class="ip-empty">لا توجد معلومات إضافية مضافة لهذا الشخص بعد.</div>`; return; }
    let html = "";
    if (data.photo) html += `<img class="ip-photo" src="${data.photo}">`;
    if (data.birthYear){
      // العمر يُحسب حتى سنة الوفاة إن كان متوفى، وإلا حتى السنة الحالية
      const isDead = data.deathStatus === "dead" && data.deathYear;
      const endYear = isDead ? parseInt(data.deathYear) : CURRENT_HIJRI_YEAR;
      const age = endYear - parseInt(data.birthYear);
      html += `<div class="ip-row"><span class="ip-label">تاريخ الميلاد</span><span class="ip-value">${data.birthYear} هـ</span></div>`;
      if (age > 0 && age < 130) html += `<div class="ip-row"><span class="ip-label">العمر</span><span class="ip-value">${age} سنة تقريبًا${isDead ? " — عند الوفاة" : ""}</span></div>`;
    }
    html += `<div class="ip-row"><span class="ip-label">الحالة</span><span class="ip-value">${data.deathStatus === "dead" ? ("متوفى" + (data.deathYear ? " — " + data.deathYear + " هـ" : "")) : "حي يرزق"}</span></div>`;
    if (data.job) html += `<div class="ip-row"><span class="ip-label">الوظيفة</span><span class="ip-value">${escapeHtml(data.job)}</span></div>`;
    if (data.nickname) html += `<div class="ip-row"><span class="ip-label">اللقب/الشهرة</span><span class="ip-value">${escapeHtml(data.nickname)}</span></div>`;
    html += `<div class="ip-row"><span class="ip-label">عدد الأبناء بالمشجرة</span><span class="ip-value">${sonsInTree}</span></div>`;
    html += unclesHtml;
    html += samMotherHtml;
    html += sadahaHtml;

    // بطاقة الزوجة: زوجها وأبناؤها — مولّدة تلقائيًا من ملف الزوج (لا تُدخل يدويًا)
    if (d.data.type === "female"){
      if (data.husbandChain || data.husband){
        const hLabel = data.husbandDivorced ? "طليقها" : "زوجها";
        html += `<div class="ip-row"><span class="ip-label">${hLabel}</span><span class="ip-value">${escapeHtml(data.husbandChain || data.husband)}</span></div>`;
      }
      if (data.sons && data.sons.length){
        html += `<div class="ip-row"><span class="ip-label">أبناؤها</span></div>`;
        html += `<div class="ip-sadaha">${data.sons.map(s => `<div class="ip-sadaha-item">${escapeHtml(s)}</div>`).join("")}</div>`;
      }
    }
    if (data.bio) html += `<div class="ip-bio">${escapeHtml(data.bio).replace(/\n/g, "<br>")}</div>`;
    card.innerHTML = html;
  });
}

const nameTooltip = document.getElementById("nameTooltip");
document.getElementById("ip-card").addEventListener("click", (e) => {
  const chip = e.target.closest(".name-chip");
  if (!chip){ nameTooltip.classList.remove("show"); return; }
  e.stopPropagation();
  nameTooltip.textContent = chip.dataset.chain;
  const r = chip.getBoundingClientRect();
  nameTooltip.style.left = Math.max(8, Math.min(window.innerWidth - 270, r.left)) + "px";
  nameTooltip.style.top = (r.top - 46) + "px";
  nameTooltip.classList.add("show");
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".name-chip")) nameTooltip.classList.remove("show");
});

document.getElementById("zoomIn").onclick = () => svg.transition().call(zoom.scaleBy, 1.3);
document.getElementById("zoomOut").onclick = () => svg.transition().call(zoom.scaleBy, 0.75);
document.getElementById("zoomReset").onclick = () => svg.transition().call(zoom.transform, centerOnRoot());

// سطح المكتب: عند كل تحديث للصفحة تعود الشجرة تلقائيًا لموقعها الافتراضي (الجذر بوسط أسفل الصفحة)
// مهم: ننتظر جاهزية الشجرة فعليًا (root + أبعاد الرسم) بدل توقيت ثابت أعمى،
// وإلا حُسب التوسيط على شجرة غير محمّلة فقُذفت خارج الشاشة (تظهر ثوانٍ ثم تختفي).
if (window.matchMedia("(min-width:1024px) and (hover:hover) and (pointer:fine)").matches){
  let centerTries = 0;
  const tryCenterOnRoot = () => {
    centerTries++;
    if (centerTries > 40) return; // مهلة قصوى ~8 ثوانٍ ثم نتوقف بأمان
    try {
      const node = svg && svg.node && svg.node();
      const ready = node && typeof root !== "undefined" && root &&
                    node.clientWidth > 0 && node.clientHeight > 0 &&
                    isFinite(sx(root)) && isFinite(sy(root));
      if (!ready){ setTimeout(tryCenterOnRoot, 200); return; }
      svg.call(zoom.transform, centerOnRoot());
    } catch(e){
      setTimeout(tryCenterOnRoot, 200);
    }
  };
  setTimeout(tryCenterOnRoot, 400);
}

// ---------- تبويبات الشريط السفلي: فتح واحد يغلق البقية ----------
const bottomPanels = ["searchPanel", "relPanel", "myTreePanel", "ioPanel", "designPanel", "bgPanel", "usersPanel", "recordsPanel", "aiChatPanel", "attachmentsPanel"].map(id => document.getElementById(id));
// تمسح مدخلات لوحة عند إغلاقها. تُستثنى الدردشة حتى لا تُفقد المحادثة الجارية.
function clearPanelInputs(panel){
  if (!panel || panel.id === "aiChatPanel") return;
  panel.querySelectorAll('input[type="text"], input[type="number"], input[type="password"], input[type="search"], textarea')
    .forEach(el => { el.value = ""; });
  const relResult = panel.querySelector("#relResult");
  if (relResult) relResult.innerHTML = "";
}

function openOnlyPanel(panel){
  const willOpen = !panel.classList.contains("show");
  const searchPanelEl = document.getElementById("searchPanel");
  const searchWasOpen = searchPanelEl.classList.contains("show");
  // مسح بيانات أي لوحة تُغلق الآن (حتى لا تبقى مدخلات قديمة عند إعادة فتحها)
  bottomPanels.forEach(p => {
    if (p && p.classList.contains("show") && p !== panel) clearPanelInputs(p);
  });
  bottomPanels.forEach(p => p.classList.remove("show"));
  if (willOpen) panel.classList.add("show");
  else clearPanelInputs(panel); // اللوحة نفسها أُغلقت بالضغط على زرها
  // أي قائمة اقتراحات مفتوحة تُغلق فورًا مع إغلاق/تبديل اللوحات حتى لا تبقى معلّقة بالصفحة
  document.querySelectorAll(".autocomplete-dropdown.show").forEach(dd => {
    dd.classList.remove("show");
    dd.innerHTML = "";
  });
  const searchNowOpen = searchPanelEl.classList.contains("show");
  if (searchWasOpen && !searchNowOpen){
    const si = document.getElementById("search");
    if (si) si.value = "";
    if (typeof searchDropdown !== "undefined"){ searchDropdown.classList.remove("show"); searchDropdown.innerHTML = ""; }
    currentMatches = [];
  }
  return willOpen;
}

// ---------- حاسبة العلاقة ----------
const relToggle = document.getElementById("relToggle");
const relPanel = document.getElementById("relPanel");
relToggle.onclick = () => { if (!guard("relation")) return; openOnlyPanel(relPanel); };

const searchToggle = document.getElementById("searchToggle");
const searchPanel = document.getElementById("searchPanel");
searchToggle.onclick = () => {
  if (!guard("search")) return;
  if (openOnlyPanel(searchPanel)) document.getElementById("search").focus();
};

const ioToggle = document.getElementById("ioToggle");
const ioPanel = document.getElementById("ioPanel");
ioToggle.onclick = () => { if (!guard("io")) return; openOnlyPanel(ioPanel); };

const bgToggle = document.getElementById("bgToggle");
const bgPanel = document.getElementById("bgPanel");
bgToggle.onclick = () => { if (!guard("background")) return; openOnlyPanel(bgPanel); };
designToggle.onclick = () => { if (!guard("design")) return; openOnlyPanel(designPanel); renderDesignScopeNote(); };

const usersToggle = document.getElementById("usersToggle");
const usersPanel = document.getElementById("usersPanel");
usersToggle.onclick = () => { if (!guard("users")) return; openOnlyPanel(usersPanel); refreshUsersAndPendingLists(); };

const recordsToggle = document.getElementById("recordsToggle");
const recordsPanel = document.getElementById("recordsPanel");
recordsToggle.onclick = () => { if (!guard("records")) return; openOnlyPanel(recordsPanel); refreshRecordsList(); };

const deleteBadgeToggle = document.getElementById("deleteBadgeToggle");
deleteBadgeToggle.onclick = () => {
  if (!guard("deleteMode")) return;
  const on = document.body.classList.toggle("show-delete-badges");
  deleteBadgeToggle.classList.toggle("active", on);
};

// ---------- مساعد الذكاء الاصطناعي (الدردشة) ----------
const AI_CHAT_WORKER_URL = "https://asmal-ai-chat.mn-rshad1406.workers.dev";

const aiChatToggle = document.getElementById("aiChatToggle");
const aiChatPanel = document.getElementById("aiChatPanel");
const aiChatMessages = document.getElementById("aiChatMessages");
const aiChatInput = document.getElementById("aiChatInput");
const aiChatSend = document.getElementById("aiChatSend");
const aiChatStatus = document.getElementById("aiChatStatus");

aiChatToggle.onclick = () => {
  if (!guard("ai")) return;
  openOnlyPanel(aiChatPanel);
  if (!aiChatMessages.childElementCount){
    appendAiChatMessage("bot", "أهلًا! اسألني عن أي شخص، علاقة قرابة، أو معلومة مضافة في شجرة بني أسمل الحكمي.");
  }
};

function appendAiChatMessage(who, text, extraClass){
  const div = document.createElement("div");
  div.className = "ai-msg " + (who === "user" ? "ai-msg-user" : "ai-msg-bot") + (extraClass ? " " + extraClass : "");
  div.textContent = text;
  aiChatMessages.appendChild(div);
  aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
  return div;
}

// يحوّل شجرة الأشخاص الحالية (treeData) إلى نص مختصر: الاسم، الأب المباشر، والفخذ
function buildAiTreeLines(){
  const lines = [];
  function walk(node, parentName, fakhdName){
    if (!node || !node.name) return;
    const isUnderJoinPoint = !!(node.__parentIsJoinPoint);
    const myFakhd = isUnderJoinPoint ? node.name : (fakhdName || "");
    lines.push(`${node.name} | المعرف: ${node.id || "-"} | الأب: ${parentName || "-"} | الفخذ: ${myFakhd || "-"}`);
    (node.children || []).forEach(child => {
      child.__parentIsJoinPoint = !!node.isJoinPoint;
      walk(child, node.name, myFakhd);
    });
  }
  walk(treeData, null, "");
  return lines;
}

// يحمّل كل بيانات personInfo مرة واحدة ويبنيها كنص مختصر لكل شخص لديه معلومات فعلية
let aiPersonInfoCache = null;
let aiChatHistory = []; // [{role:'user'|'assistant', content:'...'}] لربط الأسئلة التالية بسياق المحادثة السابقة
function buildAiIdNameMap(){
  const map = new Map();
  function walk(node){
    if (!node || !node.name) return;
    if (node.id) map.set(node.id, node.name);
    (node.children || []).forEach(walk);
  }
  walk(treeData);
  return map;
}

function aiMotherDisplayName(m){
  if (!m) return "";
  if (m.wifeName && !m.wifeName.startsWith("أم ")) return m.wifeName;
  return "ابنة " + (m.fatherChain || m.fatherName || "؟");
}

async function buildAiPersonInfoLines(){
  if (!aiPersonInfoCache){
    aiPersonInfoCache = new Map();
    try{
      const snap = await db.collection("personInfo").get();
      snap.forEach(doc => aiPersonInfoCache.set(doc.id, doc.data()));
    }catch(e){ console.error("تعذر تحميل معلومات الأشخاص للدردشة", e); }
  }
  const idNameMap = buildAiIdNameMap();
  const motherGroups = new Map(); // wifeId -> { label, ids:[] }
  const lines = [];
  aiPersonInfoCache.forEach((d, id) => {
    const parts = [];
    if (d.nickname) parts.push(`اللقب: ${d.nickname}`);
    if (d.job) parts.push(`الوظيفة: ${d.job}`);
    if (d.birthYear) parts.push(`الميلاد: ${d.birthYear}هـ`);
    if (d.deathYear) parts.push(`الوفاة: ${d.deathYear}هـ`);
    if (d.bio) parts.push(`نبذة: ${String(d.bio).slice(0, 300)}`);
    if (d.husband) parts.push(`الزوج (الصهر): ${d.husband}${d.husbandDivorced ? " (مطلّقة منه)" : ""}`);
    if (d.mother && d.mother.wifeId){
      const label = aiMotherDisplayName(d.mother);
      parts.push(`الأم: ${label}${d.mother.approved === false ? " (بانتظار الاعتماد)" : ""}`);
      if (!motherGroups.has(d.mother.wifeId)) motherGroups.set(d.mother.wifeId, { label, ids: [] });
      motherGroups.get(d.mother.wifeId).ids.push(id);
    }
    if (d.wives && d.wives.length){
      d.wives.forEach(w => {
        const wifeLabel = w.wifeName || w.fatherChain || w.fatherName || "زوجة غير مسمّاة";
        parts.push(`زوجة: ${wifeLabel}`);
        (w.inlaws || []).forEach(inlaw => {
          const notaryLabel = inlaw.notaryChain || inlaw.notaryName || "؟";
          const sons = (inlaw.sonNames || []).join("، ") || "لا يوجد أبناء محددون";
          const pendingNote = inlaw.confirmed ? "" : " (بيانات غير مؤكدة بعد، أخبر المستخدم بذلك إن سأل)";
          parts.push(`عديل هذا الشخص (زوج شقيقة زوجته "${wifeLabel}") هو "${notaryLabel}"، وأبناء خالة لأبناء هذا الشخص من هذه الزوجة هم: ${sons}${pendingNote}`);
        });
      });
    }
    if (parts.length) lines.push(`المعرف ${id} (${idNameMap.get(id) || "؟"}): ${parts.join("، ")}`);
  });

  const siblingLines = [];
  motherGroups.forEach((group) => {
    if (group.ids.length >= 2){
      const names = group.ids.map(id => `${idNameMap.get(id) || "؟"} (المعرف ${id})`);
      siblingLines.push(`الإخوة الأشقاء من الأم "${group.label}": ${names.join("، ")}`);
    }
  });
  if (siblingLines.length){
    lines.push("مجموعات الإخوة الأشقاء (نفس الأب ونفس الأم):");
    lines.push(...siblingLines);
  }

  return lines;
}

function buildAiStatsContext(){
  // جمع بيانات كل شخص أثناء المشي بالشجرة: الاسم، عمق السلسلة، عدد الأبناء المباشرين
  const persons = []; // {id, name, depth, childrenCount, chain}
  function walk(node, depth, chainNames){
    if (!node || !node.name) return;
    const chain = chainNames.concat([node.name]);
    if (node.id) persons.push({ id: node.id, name: node.name, depth, childrenCount: (node.children || []).length, chain });
    (node.children || []).forEach(child => walk(child, depth + 1, chain));
  }
  walk(treeData, 0, []);
  if (!persons.length) return "";

  const byId = new Map(persons.map(p => [p.id, p]));
  const lines = [];

  // 1) الاسم الأكثر والأقل تكرارًا (بالاسم الأول فقط)
  const nameFreq = new Map();
  persons.forEach(p => nameFreq.set(p.name, (nameFreq.get(p.name) || 0) + 1));
  let maxNameCount = 0, minNameCount = Infinity;
  nameFreq.forEach(c => { if (c > maxNameCount) maxNameCount = c; if (c < minNameCount) minNameCount = c; });
  const topNames = [...nameFreq.entries()].filter(([, c]) => c === maxNameCount).map(([n]) => n).slice(0, 5);
  const rareNamesCount = [...nameFreq.entries()].filter(([, c]) => c === minNameCount).length;
  lines.push(`أكثر اسم أول تكرارًا في الشجرة: "${topNames.join('، ')}" ويتكرر ${maxNameCount} مرة.`);
  lines.push(`أقل تكرار للاسم هو ${minNameCount} مرة، وهناك ${rareNamesCount} اسمًا مختلفًا بهذا التكرار القليل (يعني أسماء كثيرة نادرة، وليس اسمًا واحدًا محددًا).`);

  // 2) أطول سلسلة نسب (الأعمق عن الجد الأعلى)
  let deepest = persons[0];
  persons.forEach(p => { if (p.depth > deepest.depth) deepest = p; });
  lines.push(`أطول سلسلة نسب في الشجرة تنتهي بالشخص "${deepest.name}"، وسلسلته الكاملة صعودًا: ${deepest.chain.slice().reverse().join(" بن ")}.`);
  lines.push(`أقصر سلسلة (أقرب الأشخاص من الجد الأعلى مباشرة) هم أبناء الجد الأول للعائلة مباشرة، وهذا أمر بديهي في أي شجرة عائلة ولا يمثل معلومة مميزة عن شخص بعينه.`);

  // 3) الأكثر أبناء (أبناء مباشرون مسجّلون بالشجرة)
  let mostChildren = persons[0];
  persons.forEach(p => { if (p.childrenCount > mostChildren.childrenCount) mostChildren = p; });
  lines.push(`الشخص صاحب أكبر عدد من الأبناء المباشرين المسجّلين بالشجرة هو "${mostChildren.name}" بعدد ${mostChildren.childrenCount} ${mostChildren.childrenCount === 1 ? "ابن" : "أبناء"}.`);
  const zeroChildrenCount = persons.filter(p => p.childrenCount === 0).length;
  lines.push(`أما الأقل عددًا من الأبناء فهو صفر، وينطبق هذا على ${zeroChildrenCount} شخصًا (ليسوا شخصًا واحدًا بعينه، فهذا وضع طبيعي لكل شخص ما زال بلا أبناء مسجّلين أو هو من الجيل الأخير).`);

  if (aiPersonInfoCache && aiPersonInfoCache.size){
    // 5) الأكثر والأقل أخوال (إخوة الأب من جهة أم الشخص، عبر ربط الأم بأبيها)
    let mostAkhwal = null, mostAkhwalCount = -1;
    let leastAkhwal = null, leastAkhwalCount = Infinity;
    let akhwalKnownCount = 0;
    aiPersonInfoCache.forEach((d, id) => {
      if (d.mother && d.mother.fatherId && byId.has(d.mother.fatherId)){
        const count = byId.get(d.mother.fatherId).childrenCount; // أبناء جد الأم = أخوال الشخص
        akhwalKnownCount++;
        if (count > mostAkhwalCount){ mostAkhwalCount = count; mostAkhwal = id; }
        if (count < leastAkhwalCount){ leastAkhwalCount = count; leastAkhwal = id; }
      }
    });
    if (mostAkhwal){
      lines.push(`الشخص صاحب أكبر عدد من الأخوال (إخوة الأم) هو "${byId.get(mostAkhwal)?.name || '؟'}" بعدد ${mostAkhwalCount} خالًا تقريبًا.`);
      lines.push(`والشخص صاحب أقل عدد من الأخوال هو "${byId.get(leastAkhwal)?.name || '؟'}" بعدد ${leastAkhwalCount}.`);
      lines.push(`ملاحظة: عدد الأخوال محسوب فقط لـ ${akhwalKnownCount} شخصًا لديهم بيانات أم مسجّلة ومرتبطة بأبيها، وقد لا يشمل كل أفراد الشجرة.`);
    }

    // 6) الأكبر والأصغر عمرًا (حسب سنة الميلاد المسجّلة)
    let oldest = null, oldestAge = -1, youngest = null, youngestAge = Infinity;
    aiPersonInfoCache.forEach((d, id) => {
      if (d.birthYear){
        const endYear = (d.deathYear ? parseInt(d.deathYear) : CURRENT_HIJRI_YEAR);
        const age = endYear - parseInt(d.birthYear);
        if (!isNaN(age)){
          if (age > oldestAge){ oldestAge = age; oldest = id; }
          if (age < youngestAge){ youngestAge = age; youngest = id; }
        }
      }
    });
    if (oldest){
      lines.push(`الشخص الأكبر عمرًا (حسب سنة الميلاد المسجّلة) هو "${byId.get(oldest)?.name || '؟'}" بعمر تقريبي ${oldestAge} سنة هجرية (${aiPersonInfoCache.get(oldest).deathYear ? 'متوفى، والعمر عند الوفاة' : 'إن كان حيًا فالعمر حتى الآن'}).`);
      lines.push(`والشخص الأصغر عمرًا هو "${byId.get(youngest)?.name || '؟'}" بعمر تقريبي ${youngestAge} سنة، وذلك من بين الأشخاص الذين لديهم سنة ميلاد مسجّلة فقط (وليس كل أفراد الشجرة).`);
    }
  }

  return "\n\nإحصائيات محسوبة مسبقًا من بيانات الشجرة (استخدمها مباشرة للإجابة، ولا تحاول إعادة حسابها بنفسك):\n" + lines.join("\n");
}

function aiNormalizeArabic(s){
  return String(s || "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ة/g, "ه")
    .trim();
}

function buildAiPersonsFlat(){
  const list = [];
  function walk(node, parentChain){
    if (!node || !node.name) return;
    const chain = [node.name].concat(parentChain);
    if (node.id) list.push({ id: node.id, name: node.name, chain });
    (node.children || []).forEach(child => walk(child, chain));
  }
  walk(treeData, []);
  return list;
}

// يحدد أفضل المرشحين المحتملين بناءً على مطابقة سلسلة النسب، دون الجزم بشخص واحد بثقة مطلقة
// (لتفادي الخلط عند تكرار نفس الأسماء عبر أجيال مختلفة بالسلسلة التاريخية القديمة)
function resolveAiPersonByChain(question){
  const normQ = aiNormalizeArabic(question);
  const persons = buildAiPersonsFlat();
  const scored = [];
  persons.forEach(p => {
    let searchFrom = 0, depth = 0;
    for (let i = 0; i < p.chain.length; i++){
      const normName = aiNormalizeArabic(p.chain[i]);
      if (!normName) break;
      const idx = normQ.indexOf(normName, searchFrom);
      if (idx === -1) break;
      depth++;
      searchFrom = idx + normName.length;
    }
    if (depth >= 2) scored.push({ depth, person: p });
  });
  if (!scored.length) return null;
  scored.sort((a, b) => b.depth - a.depth);
  return scored.slice(0, 6); // أفضل 6 مرشحين كحد أقصى، بترتيب قوة التطابق
}

function buildAiResolvedPersonContext(question){
  const matches = resolveAiPersonByChain(question);
  if (!matches) return "";
  const lines = matches.map(m => `- ${m.person.name} (المعرف: ${m.person.id})، تطابقت ${m.depth} من مستويات سلسلة نسبه مع السؤال، وسلسلته الكاملة صعودًا: ${m.person.chain.join(" بن ")}`);
  return `\n\nمرشحون محتملون للشخص المقصود بالسؤال بناءً على مطابقة سلسلة الاسم (الاسم ثم الأب ثم الجد...)، مرتبين من الأقوى تطابقًا للأضعف:\n${lines.join("\n")}\nملاحظة مهمة: تكرار نفس الأسماء (مثل محمد، أحمد، مهدي) يتكرر كل بضعة أجيال بهذه العائلة، فتطابق أعمق لا يعني بالضرورة أنه الشخص الصحيح — قد يكون سلفًا قديمًا جدًا بالسلسلة التاريخية وليس الشخص المقصود من سياق السؤال. اختر الأنسب بناءً على السياق العام للمحادثة (مثلاً تفضيل الأفراد من الأجيال الحديثة إن كان السؤال عن أقارب أحياء)، وإذا تعذر عليك الحسم بثقة، اسأل المستخدم عن أي شخص بالتحديد يقصد بذكر تفاصيل تميز بين المرشحين.`;
}

async function sendAiChatQuestion(){
  const question = aiChatInput.value.trim();
  if (!question) return;
  appendAiChatMessage("user", question);
  aiChatInput.value = "";
  aiChatSend.disabled = true;
  aiChatInput.disabled = true;
  const loadingEl = appendAiChatMessage("bot", "جارِ التفكير…", "ai-msg-loading");
  aiChatStatus.textContent = "";

  try{
    const treeLines = buildAiTreeLines();
    const infoLines = await buildAiPersonInfoLines();
    const statsContext = buildAiStatsContext();
    const knowledgeContext = await buildAiKnowledgeContext(question);
    const resolvedContext = buildAiResolvedPersonContext(question);
    const treeContext =
      "بيانات الأشخاص (الاسم | المعرف | الأب | الفخذ):\n" + treeLines.join("\n") +
      "\n\nمعلومات إضافية مضافة لبعض الأشخاص:\n" + (infoLines.length ? infoLines.join("\n") : "لا توجد معلومات إضافية مضافة حاليًا.") +
      statsContext +
      knowledgeContext +
      resolvedContext;

    const res = await fetch(AI_CHAT_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, treeContext, history: aiChatHistory.slice(-12) })
    });
    const data = await res.json();
    loadingEl.remove();
    if (!res.ok || data.error){
      appendAiChatMessage("bot", "حصل خطأ أثناء التواصل مع المساعد. حاول مرة أخرى.", "ai-msg-error");
      console.error("AI chat error:", data);
    } else {
      const answer = data.answer || "لم يصل جواب.";
      appendAiChatMessage("bot", answer);
      aiChatHistory.push({ role: "user", content: question });
      aiChatHistory.push({ role: "assistant", content: answer });
      if (aiChatHistory.length > 20) aiChatHistory = aiChatHistory.slice(-20);
    }
  }catch(e){
    loadingEl.remove();
    appendAiChatMessage("bot", "تعذر الاتصال بالمساعد. تأكد من اتصال الإنترنت.", "ai-msg-error");
    console.error(e);
  }finally{
    aiChatSend.disabled = false;
    aiChatInput.disabled = false;
    aiChatInput.focus();
  }
}

aiChatSend.onclick = sendAiChatQuestion;
aiChatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter"){ e.preventDefault(); sendAiChatQuestion(); }
});

// ---------- المرفقات (كتب ومصادر إضافية للمساعد الذكي) ----------
const attachmentsToggle = document.getElementById("attachmentsToggle");
const attachmentsPanel = document.getElementById("attachmentsPanel");
const attachFileInput = document.getElementById("attachFileInput");
const attachStatus = document.getElementById("attachStatus");
const attachmentsList = document.getElementById("attachmentsList");

attachmentsToggle.onclick = () => { if (!guard("attachments")) return; openOnlyPanel(attachmentsPanel); refreshAttachmentsList(); };

function chunkTextForKnowledge(text, size){
  size = size || 900;
  const clean = text.replace(/\s+/g, " ").trim();
  const chunks = [];
  let i = 0;
  while (i < clean.length){
    let end = Math.min(i + size, clean.length);
    if (end < clean.length){
      const lastSpace = clean.lastIndexOf(" ", end);
      if (lastSpace > i) end = lastSpace;
    }
    const piece = clean.slice(i, end).trim();
    if (piece) chunks.push(piece);
    i = end;
  }
  return chunks;
}

async function extractTextFromPdfFile(file, onProgress){
  if (!window.pdfjsLib) throw new Error("تعذر تحميل مكتبة قراءة PDF");
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const numPages = pdf.numPages;
  let fullText = "";
  for (let i = 1; i <= numPages; i++){
    onProgress && onProgress(`قراءة صفحة ${i} من ${numPages}…`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(it => it.str).join(" ");
    fullText += pageText + "\n";
  }
  // إذا النص المستخرج قليل جدًا مقارنة بعدد الصفحات، غالبًا الملف صور ممسوحة ضوئيًا (سكانر) ونحتاج OCR
  if (fullText.trim().length < numPages * 20){
    if (!window.Tesseract){ throw new Error("الملف يبدو ممسوحًا ضوئيًا ومكتبة قراءة الصور غير متاحة."); }
    fullText = "";
    for (let i = 1; i <= numPages; i++){
      onProgress && onProgress(`تفريغ نص الصورة (OCR) — صفحة ${i} من ${numPages}…`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const { data } = await Tesseract.recognize(canvas, "ara+eng");
      fullText += (data.text || "") + "\n";
    }
  }
  return fullText;
}

async function extractTextFromDocxFile(file){
  if (!window.mammoth) throw new Error("تعذر تحميل مكتبة قراءة ملفات Word");
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value || "";
}

async function uploadAttachmentFile(file){
  attachStatus.textContent = "جارِ قراءة الملف…";
  try{
    const lowerName = file.name.toLowerCase();
    let text = "";
    if (lowerName.endsWith(".pdf")){
      text = await extractTextFromPdfFile(file, (msg) => attachStatus.textContent = msg);
    } else if (lowerName.endsWith(".docx")){
      text = await extractTextFromDocxFile(file);
    } else {
      attachStatus.textContent = "❌ نوع ملف غير مدعوم. الأنواع المدعومة: PDF أو Word (.docx)";
      return;
    }
    if (!text || !text.trim()){
      attachStatus.textContent = "❌ لم يُستخرج أي نص من الملف.";
      return;
    }
    const chunks = chunkTextForKnowledge(text);
    const sourceId = "src_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    attachStatus.textContent = `جارِ الحفظ (${chunks.length} جزء)…`;
    const BATCH_SIZE = 400;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE){
      const batch = db.batch();
      chunks.slice(i, i + BATCH_SIZE).forEach((chunkText, idx) => {
        const ref = db.collection("knowledgeChunks").doc();
        batch.set(ref, {
          sourceId,
          sourceName: file.name,
          chunkIndex: i + idx,
          text: chunkText,
          addedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }
    attachStatus.textContent = `✅ تم رفع "${file.name}" بنجاح (${chunks.length} جزء).`;
    refreshAttachmentsList();
  }catch(e){
    console.error(e);
    attachStatus.textContent = "❌ تعذر معالجة الملف: " + (e.message || e);
  }
}

attachFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) uploadAttachmentFile(file);
  e.target.value = "";
});

async function refreshAttachmentsList(){
  attachmentsList.innerHTML = "جارِ التحميل…";
  try{
    const snap = await db.collection("knowledgeChunks").get();
    const bySource = new Map();
    snap.forEach(doc => {
      const d = doc.data();
      if (!bySource.has(d.sourceId)) bySource.set(d.sourceId, { sourceName: d.sourceName, count: 0 });
      bySource.get(d.sourceId).count++;
    });
    if (!bySource.size){
      attachmentsList.innerHTML = "<div style='font-size:13px; color:#888; text-align:center; padding:10px 0;'>لا توجد مرفقات حاليًا.</div>";
      return;
    }
    attachmentsList.innerHTML = "";
    bySource.forEach((info, sourceId) => {
      const row = document.createElement("div");
      row.className = "chip";
      row.style.width = "100%";
      row.style.boxSizing = "border-box";
      row.style.justifyContent = "space-between";
      row.innerHTML = `<span>📄 ${info.sourceName} <span style="opacity:.6; font-size:11px;">(${info.count} جزء)</span></span>`;
      const delBtn = document.createElement("span");
      delBtn.textContent = "✕";
      delBtn.className = "chip-x";
      delBtn.onclick = () => deleteAttachmentSource(sourceId, info.sourceName);
      row.appendChild(delBtn);
      attachmentsList.appendChild(row);
    });
  }catch(e){
    attachmentsList.innerHTML = "تعذر تحميل قائمة المرفقات.";
    console.error(e);
  }
}

async function deleteAttachmentSource(sourceId, sourceName){
  if (!window.confirm(`حذف المرفق "${sourceName}" بالكامل؟`)) return;
  try{
    const snap = await db.collection("knowledgeChunks").where("sourceId", "==", sourceId).get();
    const BATCH_SIZE = 400;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += BATCH_SIZE){
      const batch = db.batch();
      docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    refreshAttachmentsList();
  }catch(e){
    customAlert("تعذر حذف المرفق: " + (e.message || e));
  }
}

// اختيار أنسب أجزاء المرفقات لسؤال معيّن (بحث بالكلمات المفتاحية، بدون الحاجة لتقنيات معقدة)
async function buildAiKnowledgeContext(question){
  try{
    const snap = await db.collection("knowledgeChunks").get();
    if (snap.empty) return "";
    const qWords = question.replace(/[إأآا]/g, "ا").split(/\s+/).filter(w => w.length >= 2);
    const scored = [];
    snap.forEach(doc => {
      const d = doc.data();
      const normText = (d.text || "").replace(/[إأآا]/g, "ا");
      let score = 0;
      qWords.forEach(w => { if (normText.includes(w)) score++; });
      if (score > 0) scored.push({ score, sourceName: d.sourceName, text: d.text });
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 8);
    if (!top.length) return "";
    return "\n\nمقتطفات من المرفقات (كتب ومصادر) ذات صلة بالسؤال:\n" +
      top.map(c => `[من: ${c.sourceName}]\n${c.text}`).join("\n---\n");
  }catch(e){
    console.error("تعذر تحميل المرفقات للدردشة", e);
    return "";
  }
}




// ---------- شجرتي الخاصة ----------
const myTreeToggle = document.getElementById("myTreeToggle");
const myTreePanel = document.getElementById("myTreePanel");
myTreeToggle.onclick = () => { if (!guard("myTree")) return; openOnlyPanel(myTreePanel); };

const myTreeInput = document.getElementById("myTreeInput");
const myTreeDropdown = document.getElementById("myTreeDropdown");
let personalTreeActive = null; // مرجع .data للشخص المركّز عليه حاليًا، أو null

myTreeInput.addEventListener("input", () => {
  const q = myTreeInput.value.trim();
  if (!q){ myTreeDropdown.classList.remove("show"); myTreeDropdown.innerHTML = ""; return; }
  const parts = q.split(/\s+/).filter(Boolean);
  let matches;
  if (parts.length > 1){
    matches = root.descendants().filter(d => {
      if (d.data.type === "female") return false;
      const chain = chainNames(d);
      if (chain.length < parts.length) return false;
      for (let i = 0; i < parts.length; i++) if (!chain[i].includes(parts[i])) return false;
      return true;
    });
  } else {
    matches = root.descendants().filter(d => d.data.type !== "female" && d.data.name.includes(q));
  }
  matches = matches.filter(isDescendantOfJoinPoint);
  matches = matches.slice(0, 10);
  myTreeDropdown.innerHTML = "";
  if (!matches.length){ myTreeDropdown.classList.remove("show"); return; }
  matches.forEach(m => {
    const item = document.createElement("div");
    item.className = "autocomplete-item";
    item.innerHTML = `${escapeHtml(nameWithNickname(m))}<span class="chain-sub">${chainWithNickname(m).map(escapeHtml).join(" بن ")}</span>`;
    item.onclick = () => {
      // إغلاق نظيف: نُخفي القائمة ونفرّغها ثم نغلق اللوحة عبر المسار الموحّد،
      // وإلا بقيت حالة القائمة معلّقة فلا تظهر الاقتراحات عند العودة للتبويب.
      myTreeDropdown.classList.remove("show");
      myTreeDropdown.innerHTML = "";
      myTreeInput.value = "";
      myTreeInput.blur();
      myTreePanel.classList.remove("show");
      // تحديد شخص جديد في "شجرتي" يستبدل التحديد السابق (أحد الشرطين الوحيدين للإلغاء)
      showPersonalTree(m.data);
    };
    myTreeDropdown.appendChild(item);
  });
  portalShowDropdown(myTreeInput, myTreeDropdown);
});

function showPersonalTree(dataRef){
  personalTreeActive = dataRef;
  const person = root.descendants().find(n => n.data === dataRef);
  if (!person) return;
  document.getElementById("tree-wrap").classList.remove("tree-hidden");
  document.getElementById("artBackground").style.display = "none";
  const ancestors = ancestorsUp(person); // [person, parent, ..., الجد الأول]
  const nodeSet = new Set();
  const linkTargetSet = new Set();
  ancestors.forEach((n, i) => { nodeSet.add(n); if (i < ancestors.length - 1) linkTargetSet.add(n); });
  person.descendants().forEach(n => nodeSet.add(n));
  person.links().forEach(l => linkTargetSet.add(l.target));
  enterFocusMode(nodeSet, linkTargetSet, true);
  node.classed("is-focal", d => d === person);
  updateMyTreeInfoPanel(person);
}

function updateMyTreeInfoPanel(person){
  const childrenCount = person.children ? person.children.length : 0;
  let grandchildrenCount = 0;
  if (person.children){
    person.children.forEach(ch => { grandchildrenCount += (ch.children ? ch.children.length : 0); });
  }
  document.getElementById("mtiName").textContent = person.data.name;
  document.getElementById("mtiChildren").textContent = childrenCount;
  document.getElementById("mtiGrandchildren").textContent = grandchildrenCount;
  document.getElementById("myTreeInfoPanel").classList.add("show");
}

function refreshView(){
  buildAndRender();
  if (personalTreeActive){
    showPersonalTree(personalTreeActive);
  }
}

function findPerson(query){
  const parts = query.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1){
    return root.descendants().find(d => d.data.name === parts[0])
        || root.descendants().find(d => d.data.name.includes(parts[0]));
  }
  const exact = root.descendants().find(d => {
    const chain = chainNames(d);
    if (chain.length < parts.length) return false;
    for (let i = 0; i < parts.length; i++) if (chain[i] !== parts[i]) return false;
    return true;
  });
  if (exact) return exact;
  return root.descendants().find(d => {
    const chain = chainNames(d);
    if (chain.length < parts.length) return false;
    for (let i = 0; i < parts.length; i++) if (!chain[i].includes(parts[i])) return false;
    return true;
  });
}

function ancestorsUp(d){ const arr = []; let a = d; while(a){ arr.push(a); a = a.parent; } return arr; } // من الشخص صاعداً للجذر

let joinPointNode = null;
function getJoinPointNode(){
  if (!joinPointNode) joinPointNode = root.descendants().find(d => d.data.isJoinPoint);
  return joinPointNode;
}
function isDescendantOfJoinPoint(d){
  const jp = getJoinPointNode();
  if (!jp) return true;
  let a = d.parent;
  while (a){
    if (a === jp) return true;
    a = a.parent;
  }
  return false;
}

function relationWord(gRef, depth){
  if (gRef === 0){
    return { word: depth === 1 ? "أب" : "جد", literal: true };
  }
  const diff = depth - gRef;
  const minLevel = Math.min(depth, gRef);
  if (diff === 0) return minLevel === 1 ? { word: "أخ", literal: true } : { word: "ابن عم", literal: false };
  if (diff === 1) return { word: "عم", literal: minLevel === 1 };
  if (diff === -1) return { word: "ابن أخ", literal: minLevel === 1 };
  if (diff >= 2) return { word: "جد", literal: true };
  return { word: "حفيد", literal: true };
}

function buildReport(a, b){
  if (a === b) return { same: true };
  const upA = ancestorsUp(a), upB = ancestorsUp(b);
  const mapA = new Map(upA.map((n, i) => [n, i]));
  let lca = null, gA = -1, gB = -1;
  for (let i = 0; i < upB.length; i++){
    if (mapA.has(upB[i])){ lca = upB[i]; gA = mapA.get(upB[i]); gB = i; break; }
  }
  if (!lca) return null;

  const deepIsB = gB >= gA;
  const deepPerson = deepIsB ? b : a, shallowPerson = deepIsB ? a : b;
  const deepUp = deepIsB ? upB : upA, shallowUp = deepIsB ? upA : upB;
  const deepG = Math.max(gA, gB), shallowG = Math.min(gA, gB);
  const diff = deepG - shallowG;

  const deepChain = deepUp.map(n => n.data.name);
  const shallowChain = shallowUp.map(n => n.data.name);

  const lines = [];
  for (let depth = 1; depth <= deepG; depth++){
    const person = deepUp[deepG - depth];
    const rel = relationWord(shallowG, depth);
    lines.push({ name: person.data.name, word: rel.word, literal: rel.literal });
  }

  return {
    lca: lca.data.name, diff, lcaIndex: deepG,
    deepChain, shallowChain,
    refName: shallowPerson.data.name, lines
  };
}

function renderChainGrid(rep){
  const dots = Array.from({ length: rep.diff }, () => "·");
  const rowTop = rep.deepChain;
  const rowBottom = [...dots, ...rep.shallowChain];
  const cell = (txt, i) => {
    const isDot = txt === "·";
    const isLca = i === rep.lcaIndex && !isDot;
    return `<div class="chain-cell ${isDot ? "dot" : ""} ${isLca ? "lca" : ""}">${txt}</div>`;
  };
  const topHtml = rowTop.map((t, i) => cell(t, i)).join("");
  const bottomHtml = rowBottom.map((t, i) => cell(t, i)).join("");
  return `<div class="chain-grid">
    <div class="chain-row top">${topHtml}</div>
    <div class="chain-row bottom">${bottomHtml}</div>
  </div>`;
}

function groupConsecutive(items){
  const groups = [];
  items.forEach(item => {
    const last = groups[groups.length - 1];
    if (last && last.word === item.word && last.literal === item.literal) last.names.push(item.name);
    else groups.push({ word: item.word, literal: item.literal, names: [item.name] });
  });
  return groups;
}

function lineSentence(ref, word, literal, names, isFirst){
  ref = escapeHtml(ref);
  names = names.map(escapeHtml);
  const joined = names.length === 1 ? names[0] : names.join(" وابنه ");
  if (literal){
    if (isFirst && word === "أخ") return `${ref} و${joined} إخوة`;
    return `${isFirst ? "" : "إذن "}${ref} هو ${word} لـ ${joined}`;
  }
  // علاقات بالدرجة (الفارق جيل وليس أخوّة مباشرة بين الآباء)
  if (word === "ابن عم") return `${ref} و${joined} في درجة ابن عم`;
  return `${isFirst ? "" : "إذن "}${ref} في درجة ${word} ${joined}`;
}

function renderSimpleRelation(rep){
  const ref = escapeHtml(rep.refName);
  const last = rep.lines[rep.lines.length - 1];
  const lastName = escapeHtml(last.name);
  let html = `<div class="rel-title">${escapeHtml(rep.lca)} هو أول اسم مشترك</div>`;
  if (rep.lines.length === 1){
    html += `<div class="final">${lineSentence(rep.refName, rep.lines[0].word, rep.lines[0].literal, [rep.lines[0].name], true)}</div>`;
  } else {
    const finalText = last.literal
      ? `العلاقة: ${ref} ${last.word} ${lastName}`
      : (last.word === "ابن عم"
          ? `العلاقة: ${ref} و${lastName} في درجة ابن عم`
          : `العلاقة: ${ref} في درجة ${last.word} ${lastName}`);
    html += `<div class="final">${finalText}</div>`;
  }
  return `<div class="rel-steps">${html}</div>`;
}

function buildCompactLayout(nodeSet, useFoundingRow){
  const miniMap = new Map();
  nodeSet.forEach(n => miniMap.set(n, { orig: n, children: [] }));
  let miniRoot = null;
  nodeSet.forEach(n => {
    const mini = miniMap.get(n);
    if (n.parent && nodeSet.has(n.parent)) miniMap.get(n.parent).children.push(mini);
    else miniRoot = mini;
  });
  const h = d3.hierarchy(miniRoot, d => d.children.length ? d.children : null);
  const compactDx = 130, compactDy = 115;
  d3.tree().nodeSize([compactDx, compactDy])(h);
  let cx0 = Infinity, cx1 = -Infinity;
  h.each(d => { if (d.x > cx1) cx1 = d.x; if (d.x < cx0) cx0 = d.x; });

  const posMap = new Map();
  h.each(d => {
    posMap.set(d.data.orig, { x: d.x - cx0, y: (h.height - d.depth) * compactDy });
  });

  // سلسلة الجد الأول ← علي: تُعرض كصف أفقي واحد بأسفل الشجرة (جزء منها، يتحرك معها)
  // بدل ما تاخذ مساحة رأسية طويلة (جيل فوق جيل) — بميزة "شجرتي" فقط
  if (useFoundingRow){
    const jp = getJoinPointNode();
    let jpMiniNode = null;
    h.each(d => { if (d.data.orig === jp) jpMiniNode = d; });
    if (jpMiniNode){
      const foundingChain = []; // [Ali-mini, ..., root-mini]
      let a = jpMiniNode;
      while (a){ foundingChain.push(a); a = a.parent; }
      const bottomY = h.height * compactDy;
      const rowSpacing = compactDx;
      const aliPos = posMap.get(jp);
      const anchorX = aliPos.x;
      foundingChain.forEach((mn, i) => {
        posMap.set(mn.data.orig, { x: anchorX + i * rowSpacing, y: bottomY });
      });
    }
  }

  let px0 = Infinity, px1 = -Infinity;
  posMap.forEach(p => { if (p.x < px0) px0 = p.x; if (p.x > px1) px1 = p.x; });
  posMap.forEach(p => { p.x -= px0; });
  return { posMap, width: px1 - px0, height: h.height * compactDy };
}

function enterFocusMode(nodeSet, linkTargetSet, useFoundingRow){
  const { posMap, width: cw, height: ch } = buildCompactLayout(nodeSet, useFoundingRow);
  const svgW = svg.node().clientWidth, svgH = svg.node().clientHeight;
  const fitScale = Math.max(0.35, Math.min(1.15, (svgW - 60) / Math.max(cw, 1), (svgH - 120) / Math.max(ch, 1)));
  const tx = svgW / 2 - fitScale * (cw / 2);
  const ty = svgH / 2 - fitScale * (ch / 2);

  svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(fitScale));

  node.classed("path-hidden", d => !nodeSet.has(d));
  node.filter(d => nodeSet.has(d))
    .transition().duration(500)
    .attr("transform", d => { const p = posMap.get(d); return `translate(${p.x},${p.y})`; });

  g.selectAll(".link")
    .classed("path-hidden", d => !linkTargetSet.has(d.target));
  g.selectAll(".link").filter(d => linkTargetSet.has(d.target))
    .classed("path-highlight", true)
    .transition().duration(500)
    .attr("d", d => {
      const ps = posMap.get(d.source), pt = posMap.get(d.target);
      const sxp = ps.x, syp = ps.y, txp = pt.x, typ = pt.y;
      const midY = (syp + typ) / 2;
      return `M${sxp},${syp} L${sxp},${midY} L${txp},${midY} L${txp},${typ}`;
    });

  document.getElementById("exitFocus").classList.add("show");
}

function exitFocusMode(){
  node.classed("path-hidden", false).classed("path-highlight", false).classed("is-focal", false);
  document.getElementById("myTreeInfoPanel").classList.remove("show");
  document.getElementById("artBackground").style.display = "";
  node.transition().duration(400).attr("transform", d => `translate(${sx(d)},${sy(d)})`);
  g.selectAll(".link").classed("path-hidden", false).classed("path-highlight", false)
    .transition().duration(400)
    .attr("d", d => {
      const px_ = sx(d.source), py = sy(d.source), cx = sx(d.target), cy = sy(d.target);
      const busY = busYByParent.get(d.source);
      return `M${px_},${py} L${px_},${busY} L${cx},${busY} L${cx},${cy}`;
    });
  svg.transition().duration(400).call(zoom.transform, centerOnRoot());
  document.getElementById("exitFocus").classList.remove("show");
}
document.getElementById("exitFocus").onclick = () => {
  exitFocusMode();
  searchInput.value = "";
  currentMatches = [];
  personalTreeActive = null;
};

function highlightPath(pa, pb){
  const upA = ancestorsUp(pa), upB = ancestorsUp(pb);
  const mapA = new Map(upA.map((n, i) => [n, i]));
  let lca = null, gA = -1, gB = -1;
  for (let i = 0; i < upB.length; i++){
    if (mapA.has(upB[i])){ lca = upB[i]; gA = mapA.get(upB[i]); gB = i; break; }
  }
  if (!lca) return;

  const nodeSet = new Set();
  const linkTargetSet = new Set();
  for (let i = 0; i <= gA; i++){ nodeSet.add(upA[i]); if (i < gA) linkTargetSet.add(upA[i]); }
  for (let i = 0; i <= gB; i++){ nodeSet.add(upB[i]); if (i < gB) linkTargetSet.add(upB[i]); }
  nodeSet.add(lca);

  enterFocusMode(nodeSet, linkTargetSet);
}

function attachChainAutocomplete(inputEl, dropdownEl){
  inputEl.addEventListener("input", () => {
    const q = inputEl.value.trim();
    if (!q){ dropdownEl.classList.remove("show"); dropdownEl.innerHTML = ""; return; }
    const parts = q.split(/\s+/).filter(Boolean);
    let matches;
    if (parts.length > 1){
      matches = root.descendants().filter(d => {
        if (d.data.type === "female") return false;
        const chain = chainNames(d);
        if (chain.length < parts.length) return false;
        for (let i = 0; i < parts.length; i++) if (!chain[i].includes(parts[i])) return false;
        return true;
      });
    } else {
      matches = root.descendants().filter(d => d.data.type !== "female" && d.data.name.includes(q));
    }
    matches = matches.slice(0, 10);
    dropdownEl.innerHTML = "";
    if (!matches.length){ dropdownEl.classList.remove("show"); return; }
    matches.forEach(m => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";
      item.innerHTML = `${escapeHtml(m.data.name)}<span class="chain-sub">${chainNames(m).map(escapeHtml).join(" بن ")}</span>`;
      item.onclick = () => {
        inputEl.value = chainNames(m).slice(0, 4).join(" ");
        dropdownEl.classList.remove("show");
        dropdownEl.innerHTML = "";
      };
      dropdownEl.appendChild(item);
    });
    portalShowDropdown(inputEl, dropdownEl);
  });
}
attachChainAutocomplete(document.getElementById("relA"), document.getElementById("relADropdown"));
attachChainAutocomplete(document.getElementById("relB"), document.getElementById("relBDropdown"));

async function findMaternalGrandfather(personNode){
  const info = await findMotherInfo(personNode);
  return info ? info.grandfatherNode : null;
}

async function findMotherInfo(personNode){
  const father = personNode.parent;
  if (!father) return null;
  const fatherData = await loadPersonData(personId(father));
  const wives = fatherData.wives || [];
  for (const w of wives){
    if (w.type === "inside" && w.fatherId && (w.children || []).includes(personNode.data.name)){
      const grandfatherNode = root.descendants().find(n => personId(n) === w.fatherId) || null;
      return { wifeId: w.wifeId || null, fatherId: w.fatherId, grandfatherNode };
    }
  }
  return null;
}

async function loadMarriageIndex(){
  try{
    const raw = localStorage.getItem("marriage-index");
    return raw ? JSON.parse(raw) : {};
  } catch(e){ return {}; }
}
async function saveMarriageIndex(idx){
  try{ localStorage.setItem("marriage-index", JSON.stringify(idx)); }
  catch(e){ console.error("تعذر حفظ فهرس الزيجات", e); }
}

async function maternalRelationNote(pa, pb){
  const infoA = await findMotherInfo(pa);
  const infoB = await findMotherInfo(pb);
  const mgfA = infoA ? infoA.grandfatherNode : null;
  const mgfB = infoB ? infoB.grandfatherNode : null;

  // نفس الأم بالضبط (وليس فقط نفس الجد) = إخوة من الأم
  if (infoA && infoB && infoA.wifeId && infoB.wifeId && infoA.wifeId === infoB.wifeId && pa.parent !== pb.parent){
    return `${pa.data.name} و${pb.data.name} إخوة من الأم (نفس الأم، بنت ${infoA.grandfatherNode ? modalTitleChain(infoA.grandfatherNode).join(" ") : "؟"})`;
  }
  if (mgfA && pb === mgfA){
    return `${pb.data.name} هو جد ${pa.data.name} من جهة الأم (والد والدة ${pa.data.name})`;
  }
  if (mgfB && pa === mgfB){
    return `${pa.data.name} هو جد ${pb.data.name} من جهة الأم (والد والدة ${pb.data.name})`;
  }
  if (mgfA && pb.parent === mgfA){
    return `${pb.data.name} هو خال ${pa.data.name} (أخو والدة ${pa.data.name})`;
  }
  if (mgfB && pa.parent === mgfB){
    return `${pa.data.name} هو خال ${pb.data.name} (أخو والدة ${pb.data.name})`;
  }
  if (mgfA && mgfB && mgfA === mgfB && infoA.wifeId !== infoB.wifeId){
    return `${pa.data.name} و${pb.data.name} أبناء خالة (أمّاهما أختان، بنات ${modalTitleChain(mgfA).join(" ")})`;
  }
  // ملاحظة: نفس الحالة تُقرأ "ابن خال" من جهة B أو "ابن عمة" من جهة A — نعرضها هنا
  // بصيغة "ابن عمة" حسب ترتيب الإدخال (A أولاً) كما طُلب.
  if (mgfA && pb.parent && pb.parent.parent === mgfA){
    return `${pa.data.name} هو ابن عمة ${pb.data.name} (والدة ${pa.data.name} هي عمة ${pb.data.name})`;
  }
  if (mgfB && pa.parent && pa.parent.parent === mgfB){
    return `${pa.data.name} هو ابن خال ${pb.data.name} (والد ${pa.data.name} هو خال ${pb.data.name})`;
  }
  return null;
}

async function fatherInLawNote(pa, pb){
  const dataB = await loadPersonData(personId(pb));
  for (const w of (dataB.wives || [])){
    if (w.type === "inside" && w.fatherId === personId(pa) && !w.divorced){
      return `${pa.data.name} هو والد زوجة ${pb.data.name}`;
    }
  }
  const dataA = await loadPersonData(personId(pa));
  for (const w of (dataA.wives || [])){
    if (w.type === "inside" && w.fatherId === personId(pb) && !w.divorced){
      return `${pb.data.name} هو والد زوجة ${pa.data.name}`;
    }
  }
  return null;
}

async function paternalAuntNote(pa, pb){
  function auntsOf(person){
    const father = person.parent;
    if (!father) return [];
    const grandfather = father.parent;
    if (!grandfather) return [];
    return (grandfather.children || []).filter(c => c.data.type === "female");
  }
  const index = await loadMarriageIndex();
  const auntsA = auntsOf(pa);
  for (const aunt of auntsA){
    const m = index[personId(aunt)];
    if (m && !m.divorced && pb.parent && m.husbandId === personId(pb.parent)){
      return `${pa.data.name} هو ابن عمة ${pb.data.name} (والد ${pb.data.name} تزوّج عمة ${pa.data.name})`;
    }
  }
  const auntsB = auntsOf(pb);
  for (const aunt of auntsB){
    const m = index[personId(aunt)];
    if (m && !m.divorced && pa.parent && m.husbandId === personId(pa.parent)){
      return `${pb.data.name} هو ابن عمة ${pa.data.name} (والد ${pa.data.name} تزوّج عمة ${pb.data.name})`;
    }
  }
  return null;
}

async function maternalHalfSiblingUncleNote(pa, pb){
  // حالة: pa أخو والد pb من الأم (نصف أخ من جهة الأم) → pa بمنزلة عم لـ pb، و pb بمنزلة ابن أخ من الأم لـ pa
  if (pb.parent && pb.parent !== pa){
    const infoFatherOfB = await findMotherInfo(pb.parent);
    const infoPa = await findMotherInfo(pa);
    if (infoFatherOfB && infoPa && infoFatherOfB.wifeId && infoPa.wifeId &&
        infoFatherOfB.wifeId === infoPa.wifeId && pa.parent !== pb.parent){
      return `${pa.data.name} أخو ${pb.parent.data.name} من الأم (نصف أخ)، لذلك هو بمنزلة عم لـ ${pb.data.name}، و${pb.data.name} بمنزلة ابن أخ من الأم لـ ${pa.data.name}`;
    }
  }
  // الحالة المعاكسة: pb أخو والد pa من الأم
  if (pa.parent && pa.parent !== pb){
    const infoFatherOfA = await findMotherInfo(pa.parent);
    const infoPb = await findMotherInfo(pb);
    if (infoFatherOfA && infoPb && infoFatherOfA.wifeId && infoPb.wifeId &&
        infoFatherOfA.wifeId === infoPb.wifeId && pb.parent !== pa.parent){
      return `${pb.data.name} أخو ${pa.parent.data.name} من الأم (نصف أخ)، لذلك هو بمنزلة عم لـ ${pa.data.name}، و${pa.data.name} بمنزلة ابن أخ من الأم لـ ${pb.data.name}`;
    }
  }
  return null;
}

async function findOutsideCousinLink(personNode){
  if (!personNode.parent) return null;
  const fatherData = await loadPersonData(personId(personNode.parent));
  const wives = fatherData.wives || [];
  for (const w of wives){
    if (w.type === "outside" && (w.children || []).includes(personNode.data.name)){
      const linkId = w.outsideWifeLinkId || w.linkedOutsideWifeId;
      if (linkId) return linkId;
    }
  }
  return null;
}

async function outsideInlawCousinNote(pa, pb){
  if (!pa.parent || !pb.parent || pa.parent === pb.parent) return null;
  const la = await findOutsideCousinLink(pa);
  const lb = await findOutsideCousinLink(pb);
  if (la && lb && la === lb){
    return `${pa.data.name} و${pb.data.name} أبناء خالة (أمهاتهما أختان من خارج القبيلة)`;
  }
  return null;
}

async function extraRelationNotes(pa, pb){
  const notes = [];
  const n1 = await maternalRelationNote(pa, pb); if (n1) notes.push(n1);
  const n2 = await fatherInLawNote(pa, pb); if (n2) notes.push(n2);
  const n3 = await paternalAuntNote(pa, pb); if (n3 && !notes.includes(n3)) notes.push(n3);
  const n4 = await maternalHalfSiblingUncleNote(pa, pb); if (n4 && !notes.includes(n4)) notes.push(n4);
  const n5 = await outsideInlawCousinNote(pa, pb); if (n5 && !notes.includes(n5)) notes.push(n5);
  return notes;
}

document.getElementById("relCalc").onclick = async () => {
  const qa = document.getElementById("relA").value;
  const qb = document.getElementById("relB").value;
  const resultBox = document.getElementById("relResult");
  const pa = findPerson(qa), pb = findPerson(qb);
  if (!pa || !pb){
    resultBox.innerHTML = `<div class="rel-note">تعذّر العثور على أحد الاسمين في الشجرة الحالية — تأكد من التسلسل (مثال: مهدي محمد أحمد).</div>`;
    return;
  }
  const notes = pa !== pb ? await extraRelationNotes(pa, pb) : [];
  const notesHtml = notes.map(n => `<div class="rel-title" style="margin-top:8px">${escapeHtml(n)}</div>`).join("");
  const rep = buildReport(pa, pb);
  if (!rep){
    resultBox.innerHTML = notes.length
      ? notesHtml
      : `<div class="rel-note">لا توجد علاقة نسب مشتركة بين الاثنين في الشجرة الحالية.</div>`;
    if (notes.length) highlightPath(pa, pb);
    return;
  }
  if (rep.same){
    resultBox.innerHTML = `<div class="rel-title">نفس الشخص</div>`;
    highlightPath(pa, pb);
    return;
  }
  resultBox.innerHTML = renderChainGrid(rep) + renderSimpleRelation(rep) + notesHtml;
  highlightPath(pa, pb);
};

// ============ نافذة "+" (شجرتي الخاصة / إضافة أبناء / إضافة معلومات) ============
function personId(d){ return chainNames(d).join("/"); }
function firestorePersonInfoId(id){ return id.replace(/\//g, "__"); }

const personDataCache = new Map();

async function loadPersonData(id){
  if (personDataCache.has(id)) return personDataCache.get(id);
  try{
    const docSnap = await db.collection("personInfo").doc(firestorePersonInfoId(id)).get();
    const data = docSnap.exists ? docSnap.data() : {};
    personDataCache.set(id, data);
    return data;
  } catch(e){
    console.error("تعذر تحميل بيانات الشخص من قاعدة البيانات", e);
    return {};
  }
}
function stripUndefined(obj){
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  const out = {};
  for (const k in obj) out[k] = stripUndefined(obj[k]);
  return out;
}

async function savePersonData(id, data){
  const cleaned = stripUndefined(data);
  personDataCache.set(id, cleaned);
  try{
    await db.collection("personInfo").doc(firestorePersonInfoId(id)).set(cleaned, { merge: false });
  } catch(e){
    console.error("تعذر الحفظ بقاعدة البيانات", e);
    customAlert("تعذر حفظ البيانات بقاعدة البيانات — تأكد من اتصال الإنترنت وصلاحياتك.\n" + (e.message || e.code));
  }
}

function currentHijriYear(){
  try{
    const f = new Intl.DateTimeFormat('en-u-ca-islamic', { year: 'numeric' });
    const part = f.formatToParts(new Date()).find(p => p.type === 'year');
    return parseInt(part.value);
  } catch(e){ return 1447; }
}

let modalNode = null;
let wivesState = [];    // [{type:'inside', wifeName, fatherId, fatherName, fatherChain, children:[]}] or [{type:'outside', notaries:[{id,name,chain3}], children:[]}]
let motherState = null; // {fatherId, fatherName, fatherChain, auto}
let husbandState = null; // {husbandId, husbandName, husbandChain}
let photoDataUrl = "";

const infoBackdrop = document.getElementById("infoBackdrop");
const infoModal = document.getElementById("infoModal");

function closeInfoModal(){
  infoModal.classList.remove("show");
  infoBackdrop.classList.remove("show");
  pendingHalfSiblings = [];
  pendingWifeAndSiblingJobs = [];
}
infoBackdrop.onclick = closeInfoModal;
document.getElementById("infoModalClose").onclick = closeInfoModal;

document.querySelectorAll(".info-tab").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".info-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tabAddChildren").style.display = btn.dataset.tab === "addchildren" ? "block" : "none";
    document.getElementById("tabInfo").style.display = btn.dataset.tab === "info" ? "block" : "none";
  };
});

function updateAgeDisplay(){
  const by = parseInt(document.getElementById("f-birthYear").value);
  const dead = document.querySelector('input[name="deathStatus"]:checked').value === "dead";
  const dy = parseInt(document.getElementById("f-deathYear").value);
  const disp = document.getElementById("f-ageDisplay");
  if (!by){ disp.textContent = "—"; return; }
  const endYear = dead && dy ? dy : currentHijriYear();
  disp.textContent = Math.max(0, endYear - by) + " سنة (هجري)" + (dead ? " — عند الوفاة" : "");
}
document.getElementById("f-birthYear").addEventListener("input", updateAgeDisplay);
document.getElementById("f-deathYear").addEventListener("input", updateAgeDisplay);
document.querySelectorAll('input[name="deathStatus"]').forEach(r => {
  r.addEventListener("change", () => {
    document.getElementById("deathYearWrap").style.display = document.querySelector('input[name="deathStatus"]:checked').value === "dead" ? "block" : "none";
    updateAgeDisplay();
  });
});


function makePersonSearchBox(placeholder, onSelect){
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  const input = document.createElement("input");
  input.className = "f-input";
  input.placeholder = placeholder;
  const dropdown = document.createElement("div");
  dropdown.className = "autocomplete-dropdown";
  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (!q){ dropdown.classList.remove("show"); dropdown.innerHTML = ""; return; }
    const parts = q.split(/\s+/).filter(Boolean);
    let matches;
    if (parts.length > 1){
      matches = root.descendants().filter(d => {
        if (d.data.type === "female") return false;
        const chain = chainNames(d);
        if (chain.length < parts.length) return false;
        for (let i = 0; i < parts.length; i++) if (!chain[i].includes(parts[i])) return false;
        return true;
      });
    } else {
      matches = root.descendants().filter(d => d.data.type !== "female" && d.data.name.includes(q));
    }
    matches = matches.slice(0, 10);
    dropdown.innerHTML = "";
    if (!matches.length){ dropdown.classList.remove("show"); return; }
    matches.forEach(m => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";
      item.innerHTML = `${escapeHtml(m.data.name)}<span class="chain-sub">${chainNames(m).map(escapeHtml).join(" بن ")}</span>`;
      item.onclick = () => {
        onSelect(m);
        dropdown.classList.remove("show");
        dropdown.innerHTML = "";
        input.value = "";
      };
      dropdown.appendChild(item);
    });
    portalShowDropdown(input, dropdown);
  });
  wrap.appendChild(input);
  wrap.appendChild(dropdown);
  return wrap;
}

function renderHusbandBox(){
  const box = document.getElementById("husbandBox");
  const resultEl = document.getElementById("husbandResult");
  if (!box || !resultEl) return;
  box.innerHTML = "";
  if (husbandState && husbandState.husbandId){
    resultEl.textContent = "الزوج: " + (husbandState.husbandChain || husbandState.husbandName);
    const chip = document.createElement("div");
    chip.className = "chip-list";
    const c = document.createElement("div");
    c.className = "chip";
    c.innerHTML = `<span>${escapeHtml(husbandState.husbandChain || husbandState.husbandName)}</span><span class="chip-x">✕</span>`;
    c.querySelector(".chip-x").onclick = () => { husbandState = null; renderHusbandBox(); };
    chip.appendChild(c);
    box.appendChild(chip);
    return;
  }
  resultEl.textContent = "";
  const search = makePersonSearchBox("اكتب الاسم الثلاثي للزوج، ثم اضغط عليه من القائمة", (m) => {
    husbandState = { husbandId: personId(m), husbandName: m.data.name, husbandChain: modalTitleChain(m).join(" ") };
    renderHusbandBox();
  });
  box.appendChild(search);
}

async function getOrCreateDaughterNode(fatherNode, wifeId, wifeName, sourcePersonId, sourceName){
  fatherNode.data.children = fatherNode.data.children || [];
  let femaleData = fatherNode.data.children.find(c => c.type === "female" && c.wifeId === wifeId);
  if (femaleData){
    if (wifeName && femaleData.name !== wifeName){
      femaleData.name = wifeName;
      if (femaleData.id){
        try{ await db.collection("persons").doc(femaleData.id).update({ name: wifeName }); }catch(e){}
      }
      refreshView(); // يستعيد "شجرتي" إن كانت مفعّلة
    }
    return femaleData;
  }
  // ما لقيناها بالشجرة المحمّلة حاليًا — نتأكد من قاعدة البيانات قبل إنشاء واحدة جديدة (تفادي التكرار)
  try{
    const q = await db.collection("persons").where("wifeId", "==", wifeId).limit(1).get();
    if (!q.empty){
      const doc = q.docs[0];
      const d = doc.data();
      femaleData = { id: doc.id, name: d.name, type: "female", gender: "female", wifeId, sourcePersonId: d.sourcePersonId || null, sourceName: d.sourceName || null, motherApproved: !!d.motherApproved };
      fatherNode.data.children.push(femaleData);
      refreshView(); // يستعيد "شجرتي" إن كانت مفعّلة
      return femaleData;
    }
  }catch(e){ console.error("تعذر التحقق من وجود الأم بقاعدة البيانات", e); }

  const name = wifeName || "أم";
  const created = await firestoreAddPerson(fatherNode.data, name, "female", { wifeId, sourcePersonId: sourcePersonId || null, sourceName: sourceName || null, motherApproved: false });
  femaleData = { id: created.id, name, type: "female", gender: "female", wifeId, sourcePersonId: sourcePersonId || null, sourceName: sourceName || null, motherApproved: false, ancestorIds: created.ancestorIds };
  fatherNode.data.children.push(femaleData);
  refreshView(); // يستعيد "شجرتي" إن كانت مفعّلة
  return femaleData;
}

async function saveMotherState(){
  const myId = personId(modalNode);
  const data = await loadPersonData(myId);
  data.mother = motherState;
  await savePersonData(myId, data);
}

async function ensureWifeEntryOnFather(fatherNode, sharedMother, divorced, childNames){
  const fid = personId(fatherNode);
  const fData = await loadPersonData(fid);
  fData.wives = fData.wives || [];
  let rec = fData.wives.find(w => w.wifeId === sharedMother.wifeId);
  if (!rec){
    rec = {
      type: "inside", wifeId: sharedMother.wifeId, wifeName: sharedMother.wifeName,
      fatherId: sharedMother.fatherId, fatherName: sharedMother.fatherName, fatherChain: sharedMother.fatherChain,
      divorced: !!divorced, children: []
    };
    fData.wives.push(rec);
  } else {
    rec.divorced = !!divorced;
  }
  (childNames || []).forEach(nm => { if (!rec.children.includes(nm)) rec.children.push(nm); });
  await savePersonData(fid, fData);
  const wifeFatherNode = root.descendants().find(n => personId(n) === sharedMother.fatherId);
  if (wifeFatherNode){
    await getOrCreateDaughterNode(wifeFatherNode, sharedMother.wifeId, sharedMother.wifeName);
  }
}

async function assignMotherToSiblingNode(siblingNode, sharedMother){
  const sid = personId(siblingNode);
  const sData = await loadPersonData(sid);
  // وسم: هذه الأم أُسندت تلقائيًا من ملف الأب، فلا يُطلب اعتماد "الإخوة من الأم" يدويًا عند حفظ ملف الابن
  sData.mother = { ...sharedMother, autoFromFather: true, approved: true };
  await savePersonData(sid, sData);
  return true;
}

async function unlinkSiblingFromMother(siblingNode, sharedMother){
  const sid = personId(siblingNode);
  const sData = await loadPersonData(sid);
  sData.mother = null;
  await savePersonData(sid, sData);
  if (siblingNode.parent){
    const fid = personId(siblingNode.parent);
    const fData = await loadPersonData(fid);
    const wRec = (fData.wives || []).find(w => w.wifeId === sharedMother.wifeId);
    if (wRec){
      wRec.children = (wRec.children || []).filter(nm => nm !== siblingNode.data.name);
      await savePersonData(fid, fData);
    }
  }
}

// حذف كامل وشامل للأم من كل مكان (يُستدعى فقط من: ملف الإضافة الأصلي، ملف والدها، أو حذفها من الشجرة مباشرة)
async function fullyDeleteMother(sharedMother){
  for (const n of root.descendants()){
    const nData = await loadPersonData(personId(n));
    if (nData.mother && nData.mother.wifeId === sharedMother.wifeId){
      nData.mother = null;
      await savePersonData(personId(n), nData);
    }
    if (nData.wives && nData.wives.some(w => w.wifeId === sharedMother.wifeId)){
      nData.wives = nData.wives.filter(w => w.wifeId !== sharedMother.wifeId);
      await savePersonData(personId(n), nData);
    }
  }
  // حذف عقدة الأم نفسها من الشجرة (باعتبار ملفها "غير موجود")
  const fatherNode = root.descendants().find(n => personId(n) === sharedMother.fatherId);
  if (fatherNode){
    const daughterNode = root.descendants().find(n => n.parent === fatherNode && n.data.type === "female" && n.data.wifeId === sharedMother.wifeId);
    if (daughterNode) await firestoreDeletePerson(daughterNode.data);
  }
}

async function findMotherSiblingsList(sharedMother, excludeId, excludeFatherNode){
  const list = [];
  for (const n of root.descendants()){
    if (personId(n) === excludeId) continue;
    // "الإخوة من الأم" تعني اختلاف الأب. الإخوة من نفس الأب أشقاء، وإدراجهم هنا مضلل.
    if (excludeFatherNode && n.parent === excludeFatherNode) continue;
    const nData = await loadPersonData(personId(n));
    if (nData.mother && nData.mother.wifeId === sharedMother.wifeId){
      list.push(n);
    }
  }
  return list;
}

let pendingHalfSiblings = []; // [{node, name}] بانتظار الاعتماد بهذا الملف تحديدًا
let pendingWifeAndSiblingJobs = []; // بانتظار "حفظ المعلومات" النهائي: [{fatherNode, personalShared, divorced, kidNodes}]
let originalDataSnapshot = null; // نسخة من بيانات الملف عند فتحه، لمقارنتها عند الحفظ واكتشاف عدم وجود أي تغيير

function motherDisplayName(m){
  if (!m) return "";
  if (m.wifeName && !m.wifeName.startsWith("أم ")){
    return m.wifeName;
  }
  return "ابنة " + (m.fatherChain || m.fatherName || "؟");
}

async function renderMotherBox(){
  const box = document.getElementById("motherBox");
  const resultDiv = document.getElementById("motherResult");
  box.innerHTML = "";
  resultDiv.innerHTML = "";
  const myId = personId(modalNode);

  if (motherState && motherState.auto){
    resultDiv.textContent = "الأم: " + motherDisplayName(motherState) + " (تلقائي — مرتبطة عبر زوجة مضافة لدى الأب)";
    return;
  }

  if (motherState && motherState.pendingSave){
    const row = document.createElement("div");
    row.style.cssText = "display:flex; flex-direction:column; gap:8px; background:#FFF8E1; border-radius:8px; padding:10px 12px; border:1px dashed #C9A227;";
    const header = document.createElement("div");
    header.style.cssText = "display:flex; align-items:center; justify-content:space-between;";
    header.innerHTML = `<span style="color:#241a10;"><b>الأم:</b> ${escapeHtml(motherDisplayName(motherState))}${motherState.divorced ? " (مطلّقة)" : ""} — <span style="color:#a67c00;">بانتظار الحفظ النهائي</span></span><span class="chip-x">✕</span>`;
    header.querySelector(".chip-x").onclick = () => {
      motherState = null;
      pendingWifeAndSiblingJobs = [];
      pendingHalfSiblings = [];
      renderMotherBox();
    };
    row.appendChild(header);
    if (pendingWifeAndSiblingJobs.length){
      const list = document.createElement("div");
      list.style.cssText = "font-size:12.5px; color:#5a4a2a; line-height:1.8;";
      list.innerHTML = pendingWifeAndSiblingJobs.map(j =>
        `الأب: ${escapeHtml(j.fatherNode.data.name)}${j.divorced ? " (مطلّقة منه)" : ""} — الأبناء: ${j.kidNodes.map(k => escapeHtml(k.data.name)).join("، ")}`
      ).join("<br>");
      row.appendChild(list);
    }
    const hint = document.createElement("div");
    hint.style.cssText = "font-size:11.5px; color:#a67c00;";
    hint.textContent = "لن يتم حفظ أو ربط أي شيء إلا بعد الضغط على \"حفظ المعلومات\" أسفل هذا الملف.";
    row.appendChild(hint);
    box.appendChild(row);
    return;
  }

  if (motherState && motherState.wifeId && motherState.approved){
    const isSource = motherState.sourcePersonId === myId;
    const row = document.createElement("div");
    row.style.cssText = "display:flex; align-items:center; justify-content:space-between; background:#F1E9D8; border-radius:8px; padding:8px 12px;";
    row.innerHTML = `<span style="color:#241a10;">الأم: ${escapeHtml(motherDisplayName(motherState))}${motherState.divorced ? " (مطلّقة)" : ""}</span><span class="chip-x" title="${isSource ? "حذف كامل" : "فكّ ارتباطي"}">✕</span>`;
    row.querySelector(".chip-x").onclick = async () => {
      if (isSource){
        if (!confirm("هذا حذف كامل شامل: راح يحذف الأم من كل ملفات الأزواج والأبناء والإخوة المرتبطين. متأكد؟")) return;
        await fullyDeleteMother(motherState);
        motherState = null;
      } else {
        if (!confirm("فكّ ارتباطك أنت بس عن هذه الأم؟")) return;
        await unlinkSiblingFromMother(modalNode, motherState);
        motherState = null;
      }
      renderMotherBox();
    };
    box.appendChild(row);
    if (!isSource){
      const note = document.createElement("div");
      note.style.cssText = "font-size:12px; color:#a67c00; margin-top:4px;";
      // البيانات القديمة قد تفتقر sourceName، فنستنتج المصدر من الشجرة: هي زوجة مسجّلة في ملف الأب
      const srcName = motherState.sourceName ||
        (modalNode.parent ? modalTitleChain(modalNode.parent).join(" ") : "");
      note.textContent = srcName
        ? "مسجّلة أصلًا من ملف: " + srcName
        : "مسجّلة تلقائيًا عبر زوجة مضافة لدى الأب";
      box.appendChild(note);
    }

    const siblingsBox = document.createElement("div");
    siblingsBox.style.cssText = "margin-top:10px;";
    siblingsBox.innerHTML = `<div class="f-label" style="margin:0 0 6px;">الإخوة غير الأشقاء من هذه الأم</div><div id="halfSiblingsList">جارِ التحميل…</div>`;
    box.appendChild(siblingsBox);
    findMotherSiblingsList(motherState, myId, modalNode.parent).then(siblings => {
      const listEl = document.getElementById("halfSiblingsList");
      if (!listEl) return;
      // لا إخوة من أم (بآباء مختلفين) => نخفي القسم كليًا بدل عرض قسم فارغ مضلل
      if (!siblings.length){ siblingsBox.style.display = "none"; return; }
      listEl.innerHTML = "";
      const chipList = document.createElement("div");
      chipList.className = "chip-list";
      siblings.forEach(sib => {
        const chip = document.createElement("div");
        chip.className = "chip";
        chip.innerHTML = `<span>${escapeHtml(sib.data.name)}</span>`;
        chipList.appendChild(chip);
      });
      listEl.appendChild(chipList);
    });

    if (isSource){
      const addBtn = document.createElement("button");
      addBtn.className = "f-btn-sm";
      addBtn.style.cssText = "width:100%; margin-top:10px; background:#0B3D2E;";
      addBtn.textContent = "+ إضافة الإخوة من الأم";
      addBtn.onclick = () => renderHalfSiblingPicker();
      box.appendChild(addBtn);
    }
    return;
  }

  // حالة "قيد الإعداد" — أم جديدة تم اختيارها لكن ما اعتُمدت بعد
  if (motherState && motherState.wifeId && !motherState.approved){
    // استثناء: الأم المسندة تلقائيًا عبر زوجة مسجّلة في ملف الأب تُعامل كمعتمدة (لا واجهة اختيار إخوة)
    const autoInfo = await findMotherInfo(modalNode);
    if (autoInfo && autoInfo.wifeId && autoInfo.wifeId === motherState.wifeId){
      motherState = Object.assign({}, motherState, { approved: true, autoFromFather: true });
    } else {
      renderHalfSiblingPicker();
      return;
    }
  }

  const search = makePersonSearchBox("اكتب اسم أب الأم (جدّها)، ثم اضغط عليه من القائمة", (m) => {
    motherState = { fatherId: personId(m), fatherName: m.data.name, fatherChain: modalTitleChain(m).join(" "), wifeId: null };
    renderMotherBox();
  });
  box.appendChild(search);

  if (motherState && motherState.fatherId && !motherState.wifeId){
    const fatherNode = root.descendants().find(n => personId(n) === motherState.fatherId);
    const existingDaughters = fatherNode ? (fatherNode.data.children || []).filter(c => c.type === "female" && c.wifeId) : [];
    const title = document.createElement("div");
    title.style.cssText = "font-size:13px; color:#555; margin:8px 0 4px;";
    title.textContent = existingDaughters.length
      ? "هل هي إحدى بنات هذا الأب الموجودات، أو أم جديدة؟"
      : "لا توجد بنات مسجّلات لهذا الأب بعد — أضفها كأم جديدة";
    box.appendChild(title);
    const chooseWrap = document.createElement("div");
    chooseWrap.className = "chip-list";
    existingDaughters.forEach(fd => {
      const btn = document.createElement("button");
      btn.className = "f-btn-sm";
      btn.textContent = fd.name;
      btn.onclick = async () => {
        motherState.wifeId = fd.wifeId;
        motherState.wifeName = fd.name;
        motherState.sourcePersonId = fd.sourcePersonId || myId;
        motherState.sourceName = fd.sourceName || modalTitleChain(modalNode).join(" ");
        motherState.approved = false;
        pendingHalfSiblings = [];
        renderMotherBox();
      };
      chooseWrap.appendChild(btn);
    });
    const newBtn = document.createElement("button");
    newBtn.className = "f-btn-sm";
    newBtn.style.background = "#0B3D2E";
    newBtn.textContent = "+ أم جديدة";
    newBtn.onclick = () => {
      const newWifeId = generateWifeId();
      const fatherOfMe = modalNode.parent ? modalNode.parent.data.name : "";
      motherState.wifeId = newWifeId;
      motherState.wifeName = "أم " + modalNode.data.name + (fatherOfMe ? " " + fatherOfMe : "");
      motherState.sourcePersonId = myId;
      motherState.sourceName = modalTitleChain(modalNode).join(" ");
      motherState.approved = false;
      motherState.isNew = true;
      pendingHalfSiblings = [];
      renderMotherBox();
    };
    chooseWrap.appendChild(newBtn);
    box.appendChild(chooseWrap);
  }
}

function renderHalfSiblingPicker(){
  const box = document.getElementById("motherBox");
  box.innerHTML = "";

  const note = document.createElement("div");
  note.style.cssText = "background:#FFF8E1; border-radius:8px; padding:8px 12px; font-size:13px; margin-bottom:8px; color:#241a10;";
  note.textContent = `الأم: ${motherDisplayName(motherState)} — بانتظار الاعتماد`;
  box.appendChild(note);

  const title = document.createElement("div");
  title.className = "f-label";
  title.textContent = "إضافة الإخوة غير الأشقاء (يجب أن يكونوا مضافين بالشجرة مسبقًا)";
  box.appendChild(title);

  const pickedList = document.createElement("div");

  const search = makePersonSearchBox("اكتب اسمه، ثم اضغط عليه من القائمة", (m) => {
    if (m.data === modalNode.data) return;
    if (pendingHalfSiblings.some(p => p.node === m)) return;
    pendingHalfSiblings.push({ node: m, name: m.data.name });
    renderPicked();
  });
  box.appendChild(search);
  box.appendChild(pickedList);

  function renderPicked(){
    pickedList.innerHTML = "";
    pickedList.className = "chip-list";
    pendingHalfSiblings.forEach((p, idx) => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="chip-x">✕</span>`;
      chip.querySelector(".chip-x").onclick = () => { pendingHalfSiblings.splice(idx, 1); renderPicked(); };
      pickedList.appendChild(chip);
    });
  }
  renderPicked();

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "f-btn-sm";
  cancelBtn.style.cssText = "width:100%; margin-top:8px; background:#8B1E1E;";
  cancelBtn.textContent = "✕ إلغاء إضافة هذه الأم";
  cancelBtn.onclick = () => {
    if (!confirm("إلغاء إضافة هذه الأم وكل الإخوة المُضافين مؤقتًا؟")) return;
    motherState = null;
    pendingHalfSiblings = [];
    pendingWifeAndSiblingJobs = [];
    renderMotherBox();
  };
  box.appendChild(cancelBtn);

  const approveBtn = document.createElement("button");
  approveBtn.className = "f-btn-sm";
  approveBtn.style.cssText = "width:100%; margin-top:8px; background:#0B3D2E;";
  approveBtn.textContent = "اعتمد البيانات";
  approveBtn.onclick = () => renderFatherChoiceDialog();
  box.appendChild(approveBtn);
}

function renderFatherChoiceDialog(){
  const box = document.getElementById("motherBox");
  box.innerHTML = "";

  const title = document.createElement("div");
  title.className = "f-label";
  title.textContent = `هل ${motherDisplayName(motherState)} على عصمة أحد هؤلاء الآن؟`;
  box.appendChild(title);

  // تجميع الآباء المرشّحين بدون تكرار: أبو صاحب الملف الأصلي أولًا، ثم آباء بقية الإخوة
  const candidates = [];
  const seenFatherIds = new Set();
  function addCandidate(personNode){
    if (!personNode.parent) return;
    const fid = personId(personNode.parent);
    if (seenFatherIds.has(fid)) return;
    seenFatherIds.add(fid);
    candidates.push({ fatherNode: personNode.parent, ownKids: [personNode] });
  }
  // صاحب الملف الأصلي أولًا (قد يكون نفس modalNode لو هو المصدر، أو نجيبه بالاسم)
  const sourceNode = motherState.sourcePersonId === personId(modalNode)
    ? modalNode
    : root.descendants().find(n => personId(n) === motherState.sourcePersonId) || modalNode;
  addCandidate(sourceNode);
  pendingHalfSiblings.forEach(p => {
    const existing = candidates.find(c => personId(c.fatherNode) === personId(p.node.parent));
    if (existing) existing.ownKids.push(p.node);
    else addCandidate(p.node);
  });

  const choiceWrap = document.createElement("div");
  choiceWrap.className = "chip-list";
  let chosenFatherId = null;
  candidates.forEach(c => {
    const btn = document.createElement("button");
    btn.className = "f-btn-sm";
    btn.textContent = modalTitleChain(c.fatherNode).slice(0, 3).join(" ");
    btn.onclick = () => { chosenFatherId = personId(c.fatherNode); finalize(); };
    choiceWrap.appendChild(btn);
  });
  const noneBtn = document.createElement("button");
  noneBtn.className = "f-btn-sm";
  noneBtn.style.background = "#8B1E1E";
  noneBtn.textContent = "لا أحد (مطلّقة من الجميع)";
  noneBtn.onclick = () => { chosenFatherId = null; finalize(); };
  choiceWrap.appendChild(noneBtn);
  box.appendChild(choiceWrap);

  async function finalize(){
    const shared = {
      wifeId: motherState.wifeId, fatherId: motherState.fatherId, fatherName: motherState.fatherName,
      fatherChain: motherState.fatherChain, wifeName: motherState.wifeName,
      sourcePersonId: motherState.sourcePersonId, sourceName: motherState.sourceName, approved: true
    };
    pendingWifeAndSiblingJobs = candidates.map(c => {
      const divorced = chosenFatherId ? personId(c.fatherNode) !== chosenFatherId : true;
      return { fatherNode: c.fatherNode, personalShared: Object.assign({}, shared, { divorced }), divorced, kidNodes: c.ownKids };
    });
    motherState = Object.assign({}, motherState, { approved: true, divorced: chosenFatherId ? personId(sourceNode.parent) !== chosenFatherId : true, pendingSave: true });
    pendingHalfSiblings = [];
    renderMotherBox();
  }
}

function toArabicDigits(n){
  const map = ["٠","١","٢","٣","٤","٥","٦","٧","٨","٩"];
  return String(n).split("").map(ch => /[0-9]/.test(ch) ? map[+ch] : ch).join("");
}

function generateWifeId(){
  return "wf_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

// يبني اسم عقدة الزوجة من حالة الطلاق الحالية + الاسم الثنائي للزوج
// مثال: "زوجة صديق مهدي" أو "طليقة صديق مهدي"
function buildWifeNodeName(divorced){
  const chain2 = chainNames(modalNode).slice(0, 2).join(" ");
  return (divorced ? "طليقة " : "زوجة ") + chain2;
}

// هل الاسم مولّد تلقائيًا (فيجوز تحديثه)؟ الأسماء التي كتبها المستخدم يدويًا لا تُمس.
function isAutoWifeName(name){
  return !name || name === "أم" || /^(زوجة|طليقة)\s/.test(name);
}

async function ensureWifeNode(wi){
  const w = wivesState[wi];
  if (w.type !== "inside" || !w.fatherId || !w.wifeId) return;
  const fatherNode = root.descendants().find(n => personId(n) === w.fatherId);
  if (!fatherNode) return;
  // مهم: نحسب الاسم الصحيح من حالة "مطلقة" الحالية قبل إنشاء/تحديث العقدة،
  // وإلا أُنشئت بالاسم القديم فظهر الاسم متأخرًا دورة كاملة عن الحالة الفعلية.
  if (isAutoWifeName(w.wifeName)){
    w.wifeName = buildWifeNodeName(!!w.divorced);
  }
  const femaleData = await getOrCreateDaughterNode(fatherNode, w.wifeId, w.wifeName);
  w._femaleNodeData = femaleData;
  const myDataRef = modalNode.data;
  refreshView(); // يستعيد "شجرتي" إن كانت مفعّلة
  modalNode = root.descendants().find(n => n.data === myDataRef);
  document.getElementById("f-sonsCount").textContent = modalNode.children ? modalNode.children.filter(c => c.data.type !== "female").length : 0;
}

function renderWives(){
  const box = document.getElementById("wivesList");
  box.innerHTML = "";
  wivesState.forEach((w, wi) => {
    const block = document.createElement("div");
    block.className = "wife-block";

    if (w.type === "inside"){
      const fatherBox = makePersonSearchBox("اكتب اسم الأب، ثم اضغط عليه من القائمة", (m) => {
        wivesState[wi].fatherId = personId(m);
        wivesState[wi].fatherName = m.data.name;
        wivesState[wi].fatherChain = modalTitleChain(m).join(" ");
        wivesState[wi].wifeId = null; // يحتاج اختيار البنت بعد اختيار الأب
        renderWives();
      });
      block.appendChild(fatherBox);

      if (w.fatherChain){
        const res = document.createElement("div");
        res.className = "father-search-result";
        res.textContent = "الأب: " + w.fatherChain;
        block.appendChild(res);
      }

      if (w.fatherId && !w.wifeId){
        // خطوة اختيار البنت: نفس امرأة موجودة (إخوة من الأم) أو أخت جديدة (أبناء خالة)
        const fatherNode = root.descendants().find(n => personId(n) === w.fatherId);
        const existingDaughters = fatherNode ? (fatherNode.data.children || []).filter(c => c.type === "female" && c.wifeId) : [];
        const chooseTitle = document.createElement("div");
        chooseTitle.style.cssText = "font-size:13px; color:#555; margin:8px 0 4px;";
        chooseTitle.textContent = existingDaughters.length
          ? "هل هي إحدى بنات هذا الأب الموجودات، أو بنت جديدة (أخت)؟"
          : "لا توجد بنات مسجّلات لهذا الأب بعد — أضفها كبنت جديدة";
        block.appendChild(chooseTitle);
        const chooseWrap = document.createElement("div");
        chooseWrap.className = "chip-list";
        existingDaughters.forEach(fd => {
          const btn = document.createElement("button");
          btn.className = "f-btn-sm";
          btn.textContent = fd.name;
          btn.onclick = () => {
            wivesState[wi].wifeId = fd.wifeId;
            wivesState[wi].wifeName = fd.name;
            renderWives();
          };
          chooseWrap.appendChild(btn);
        });
        const newBtn = document.createElement("button");
        newBtn.className = "f-btn-sm";
        newBtn.style.background = "#0B3D2E";
        newBtn.textContent = "+ بنت جديدة (أخت أخرى)";
        newBtn.onclick = () => {
          wivesState[wi].wifeId = generateWifeId();
          renderWives();
        };
        chooseWrap.appendChild(newBtn);
        block.appendChild(chooseWrap);
      }

      if (w.wifeId){
        const nameInput = document.createElement("input");
        nameInput.className = "f-input";
        nameInput.placeholder = "اسم الزوجة (اختياري)";
        nameInput.value = w.wifeName || "";
        nameInput.oninput = () => { wivesState[wi].wifeName = nameInput.value; };
        block.appendChild(nameInput);

        const summary = document.createElement("div");
        summary.style.cssText = "margin-top:8px;font-weight:700;color:#333;font-size:13px";
        summary.textContent = (w.wifeName && !w.wifeName.startsWith("أم ") ? w.wifeName + " " : "") + "ابنة " + (w.fatherChain || w.fatherName);
        block.appendChild(summary);

        const divorceLbl = document.createElement("label");
        divorceLbl.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:10px;font-size:12.5px;color:#a33;cursor:pointer";
        const divorceCb = document.createElement("input");
        divorceCb.type = "checkbox";
        divorceCb.checked = !!w.divorced;
        divorceCb.onchange = () => { wivesState[wi].divorced = divorceCb.checked; };
        divorceLbl.appendChild(divorceCb);
        divorceLbl.append("مطلقة");
        block.appendChild(divorceLbl);
      }
    } else {
      w.autoName = "زوجة " + modalNode.data.name;
      const nameLabel = document.createElement("div");
      nameLabel.style.cssText = "font-weight:700; color:#333; font-size:14px; margin-bottom:8px;";
      nameLabel.textContent = w.autoName;
      block.appendChild(nameLabel);

      const notaryTitle = document.createElement("label");
      notaryTitle.className = "f-label";
      notaryTitle.textContent = "أسماء العدلاء الخاصين بهذه الزوجة";
      block.appendChild(notaryTitle);

      const searchBox = makePersonSearchBox("اكتب اسم من القبيلة، ثم اضغط عليه من القائمة", async (m) => {
        w.notaries = w.notaries || [];
        w.inlaws = w.inlaws || [];
        const id = personId(m);
        const chain3 = chainNames(m).slice(0,3).join(" بن ");

        // العديل مضاف مسبقًا لهذه الزوجة نفسها؟ لا نكرره.
        if (w.inlaws.some(x => x.notaryId === id)){
          customAlert("هذا العديل مضاف بالفعل لهذه الزوجة.");
          return;
        }

        // كشف الازدواج: هل أضافك هو مسبقًا كعديل له؟ عندها نعيد استخدام رابطه بدل توليد رابط جديد.
        let reuseLinkId = null;
        try{
          const hisData = await loadPersonData(id);
          const linkedToMe = (hisData.wives || []).find(x => x.sisterOfPersonId === myId && x.linkedOutsideWifeId);
          if (linkedToMe){
            const alreadyUsed = (wivesState || []).some(ww => ww.outsideWifeLinkId === linkedToMe.linkedOutsideWifeId);
            if (!alreadyUsed){
              reuseLinkId = linkedToMe.linkedOutsideWifeId;
              customAlert("تنبيه: هذا الشخص أضافك كعديل له مسبقًا — سيتم ربط نفس الزواج بدل إنشاء رابط مكرر.");
            }
          }
        }catch(e){}
        if (reuseLinkId && !w.outsideWifeLinkId) w.outsideWifeLinkId = reuseLinkId;

        if (!w.notaries.some(x => x.id === id)){
          w.notaries.push({ id, name: m.data.name, chain3 });
        }
        w.inlaws.push({
          notaryId: id, notaryName: m.data.name, notaryChain: chain3,
          sonNames: [], divorced: false, confirmed: false,
          fullSister: true   // افتراضيًا: زوجته شقيقة زوجتي (من الأب والأم)
        });
        renderWives();
      });
      block.appendChild(searchBox);

      const chipList = document.createElement("div");
      chipList.className = "chip-list";
      (w.notaries || []).forEach((n, ni) => {
        const chip = document.createElement("div");
        chip.className = "chip";
        chip.innerHTML = `<span>${escapeHtml(n.chain3 || n.name)}</span><span class="chip-x">✕</span>`;
        chip.querySelector(".chip-x").onclick = () => {
          w.notaries.splice(ni, 1);
          if (w.inlaws) w.inlaws = w.inlaws.filter(x => x.notaryId !== n.id);
          renderWives();
        };
        chipList.appendChild(chip);
      });
      block.appendChild(chipList);

      (w.inlaws || []).forEach((inlaw) => {
        const notaryNode = root.descendants().find(n => personId(n) === inlaw.notaryId);
        const sons = notaryNode ? (notaryNode.children || []).filter(c => c.data.type !== "female") : [];
        const wrap = document.createElement("div");
        wrap.style.cssText = "border:1.3px solid #EFE7D8; background:#FFF8E1; border-radius:14px; padding:12px 14px; margin-top:10px;";

        if (inlaw.confirmed){
          const summary = document.createElement("div");
          summary.style.cssText = "display:flex; justify-content:space-between; align-items:flex-start; gap:8px; cursor:pointer;";
          summary.innerHTML = `<div style="font-size:13px; color:#333;"><b>أبناء خالة من:</b> ${escapeHtml(inlaw.notaryChain || inlaw.notaryName)}<br>${escapeHtml((inlaw.sonNames||[]).join("، ") || "لا يوجد أبناء محددون")}${inlaw.divorced ? " — (مطلّقة)" : ""}</div><span class="chip-x">✕</span>`;
          summary.querySelector(".chip-x").onclick = (e) => {
            e.stopPropagation();
            w.notaries = (w.notaries || []).filter(x => x.id !== inlaw.notaryId);
            w.inlaws = w.inlaws.filter(x => x.notaryId !== inlaw.notaryId);
            renderWives();
          };
          summary.addEventListener("click", (e) => {
            if (e.target.classList.contains("chip-x")) return;
            inlaw.confirmed = false;
            renderWives();
          });
          wrap.appendChild(summary);
        } else {
          const title = document.createElement("div");
          title.className = "f-label";
          title.style.margin = "0 0 8px";
          title.style.color = "#0B3D2E";
          title.textContent = `حدد أبناء الخالة وحالة الزوجة — ${inlaw.notaryChain || inlaw.notaryName}`;
          wrap.appendChild(title);

          if (!sons.length){
            const noSons = document.createElement("div");
            noSons.style.cssText = "color:#999; font-size:13px;";
            noSons.textContent = "لا يوجد أبناء مسجّلون لهذا العديل بالشجرة.";
            wrap.appendChild(noSons);
          } else {
            const sonsWrap = document.createElement("div");
            sonsWrap.className = "wife-children";
            // الأبناء المرتبطون بزوجة أخرى لنفس العديل لا يُعرضون هنا (يستحيل أن يكون الابن من أمّين)
            const takenByOtherWife = new Set();
            (wivesState || []).forEach(ww => {
              if (ww === w) return;
              (ww.inlaws || []).forEach(il => {
                if (il.notaryId === inlaw.notaryId) (il.sonNames || []).forEach(nm => takenByOtherWife.add(nm));
              });
            });
            const availableSons = sons.filter(sn => !takenByOtherWife.has(sn.data.name) || (inlaw.sonNames || []).includes(sn.data.name));
            if (!availableSons.length){
              const allTaken = document.createElement("div");
              allTaken.style.cssText = "color:#999; font-size:13px;";
              allTaken.textContent = "كل أبناء هذا العديل مرتبطون بزوجة أخرى.";
              wrap.appendChild(allTaken);
            }
            availableSons.forEach(sonNode => {
              const sName = sonNode.data.name;
              const lbl = document.createElement("label");
              const cb = document.createElement("input");
              cb.type = "checkbox";
              cb.checked = (inlaw.sonNames || []).includes(sName);
              cb.onchange = () => {
                inlaw.sonNames = inlaw.sonNames || [];
                if (cb.checked){ if (!inlaw.sonNames.includes(sName)) inlaw.sonNames.push(sName); }
                else { inlaw.sonNames = inlaw.sonNames.filter(x => x !== sName); }
              };
              lbl.appendChild(cb);
              lbl.append(sName);
              sonsWrap.appendChild(lbl);
            });
            wrap.appendChild(sonsWrap);
          }

          // خانة "شقيقة": تؤكد أن زوجته أخت زوجتك من الأب والأم، فتُربط شبكة العدلاء المفعّلين ببعضها
          const sisLbl = document.createElement("label");
          sisLbl.style.cssText = "display:flex; align-items:center; gap:6px; margin-top:10px; font-size:12.5px; color:#0B3D2E; cursor:pointer";
          const sisCb = document.createElement("input");
          sisCb.type = "checkbox";
          sisCb.checked = inlaw.fullSister !== false;
          sisCb.onchange = () => { inlaw.fullSister = sisCb.checked; };
          sisLbl.appendChild(sisCb);
          sisLbl.append("زوجته شقيقة زوجتي (من الأب والأم) — يُربط بباقي العدلاء المفعّلين");
          wrap.appendChild(sisLbl);

          const divorceLbl2 = document.createElement("label");
          divorceLbl2.style.cssText = "display:flex; align-items:center; gap:6px; margin-top:10px; font-size:12.5px; color:#a33; cursor:pointer";
          const divorceCb2 = document.createElement("input");
          divorceCb2.type = "checkbox";
          divorceCb2.checked = !!inlaw.divorced;
          divorceCb2.onchange = () => { inlaw.divorced = divorceCb2.checked; };
          divorceLbl2.appendChild(divorceCb2);
          divorceLbl2.append("زوجة العديل (أخت هذه الزوجة) مطلّقة");
          wrap.appendChild(divorceLbl2);

          const saveBtn = document.createElement("button");
          saveBtn.className = "f-btn-sm";
          saveBtn.style.cssText = "width:100%; margin-top:12px; background:#0B3D2E;";
          saveBtn.textContent = "حفظ";
          saveBtn.onclick = () => { inlaw.confirmed = true; renderWives(); };
          wrap.appendChild(saveBtn);
        }
        block.appendChild(wrap);
      });
    }

    const childWrap = document.createElement("div");
    childWrap.className = "wife-children";
    const assignedElsewhere = new Set();
    wivesState.forEach((ow, oi) => { if (oi !== wi) ow.children.forEach(c => assignedElsewhere.add(c)); });
    const kidNodes = modalNode.children
      ? modalNode.children.filter(c => c.data.type !== "female" && !assignedElsewhere.has(c.data.name))
      : [];
    if (!kidNodes.length){
      childWrap.innerHTML = `<span style="color:#999">لا يوجد أبناء متاحون للربط بهذه الزوجة</span>`;
    } else {
      const checkboxByName = new Map();
      kidNodes.forEach(kNode => {
        const kName = kNode.data.name;
        const lbl = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = w.children.includes(kName);
        cb.onchange = async () => {
          if (cb.checked){
            if (w.wifeId){
              await assignMotherToSiblingNode(kNode, { wifeId: w.wifeId, fatherId: w.fatherId, fatherName: w.fatherName, fatherChain: w.fatherChain, wifeName: w.wifeName || "", sourcePersonId: w.sourcePersonId, sourceName: w.sourceName, approved: true, divorced: !!w.divorced });
            }
            if (!wivesState[wi].children.includes(kName)) wivesState[wi].children.push(kName);
          } else {
            wivesState[wi].children = wivesState[wi].children.filter(x => x !== kName);
            if (w.wifeId) await unlinkSiblingFromMother(kNode, { wifeId: w.wifeId });
          }
          renderWives();
        };
        lbl.appendChild(cb);
        lbl.append(kName);
        childWrap.appendChild(lbl);
        checkboxByName.set(kName, cb);
      });

      // فحص غير متزامن: تأشير تلقائي لمن هو مرتبط فعليًا بنفس الأم (بالهوية أو بتطابق الاسم)
      if (w.wifeId){
        (async () => {
          for (const kNode of kidNodes){
            const kName = kNode.data.name;
            if (w.children.includes(kName)) continue;
            const kData = await loadPersonData(personId(kNode));
            const km = kData.mother;
            if (km && km.wifeId === w.wifeId){
              if (!wivesState[wi].children.includes(kName)) wivesState[wi].children.push(kName);
              const cb = checkboxByName.get(kName);
              if (cb) cb.checked = true;
            }
          }
        })();
      }
    }
    block.appendChild(childWrap);

    const rm = document.createElement("div");
    rm.innerHTML = `<span class="chip-x" style="cursor:pointer;font-size:12px">✕ حذف هذه الزوجة</span>`;
    rm.querySelector(".chip-x").onclick = () => { wivesState.splice(wi,1); renderWives(); };
    block.appendChild(rm);

    box.appendChild(block);
  });
}

document.querySelectorAll(".bio-tag-btn").forEach(btn => {
  btn.onclick = () => {
    const ta = document.getElementById("f-bio");
    const prefix = (ta.value && !ta.value.endsWith("\n")) ? "\n" : "";
    ta.value += prefix + btn.dataset.tag + ": ";
    ta.focus();
  };
});

document.getElementById("f-wifeAdd").onclick = () => {
  document.getElementById("wifeTypeChooser").style.display = "flex";
};
document.getElementById("wifeTypeInside").onclick = () => {
  wivesState.push({ type: "inside", wifeName: "", fatherId: "", fatherName: "", fatherChain: "", children: [] });
  document.getElementById("wifeTypeChooser").style.display = "none";
  renderWives();
};
document.getElementById("wifeTypeOutside").onclick = () => {
  wivesState.push({ type: "outside", notaries: [], children: [] });
  document.getElementById("wifeTypeChooser").style.display = "none";
  renderWives();
};

document.getElementById("f-photo").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 260;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale; canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      photoDataUrl = canvas.toDataURL("image/jpeg", 0.75);
      document.getElementById("photoPreviewWrap").innerHTML = `<img src="${photoDataUrl}">`;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

async function confirmDeletePerson(d){
  const name = d.data.name;
  const childCount = (d.data.children || []).length;
  const isMotherNode = d.data.type === "female" && d.data.wifeId;
  const warnExtra = childCount ? `\nسيتم حذف ${childCount} من أبنائه وكل ذريتهم أيضًا!` : "";
  const motherWarn = isMotherNode ? "\nهذا حذف كامل للأم من كل ملفات الأزواج والأبناء والإخوة المرتبطين بيها." : "";
  const ok = window.confirm(`هل أنت متأكد من حذف "${name}"؟${warnExtra}${motherWarn}\nهذا الإجراء لا يمكن التراجع عنه.`);
  if (!ok) return;
  if (!d.parent){
    customAlert("لا يمكن حذف الجذر الرئيسي للشجرة.");
    return;
  }
  if (isMotherNode){
    await fullyDeleteMother({ wifeId: d.data.wifeId, fatherId: d.parent.data.id, fatherName: d.parent.data.name });
  }
  if (isDbBacked() && d.data.id){
    try{ await firestoreDeletePerson(d.data); }
    catch(e){ customAlert("تعذّر الحذف من قاعدة البيانات: " + (e.message || e.code)); return; }
  }
  const siblingsArr = d.parent.data.children;
  const idx = siblingsArr.indexOf(d.data);
  if (idx !== -1) siblingsArr.splice(idx, 1);
  saveTreeDataEdits();
  if (personalTreeActive === d.data) personalTreeActive = null;
  refreshView();
}

function saveTreeDataEdits(){
  try{ localStorage.setItem("tree-data-edits", JSON.stringify(treeData)); }catch(e){}
}

document.getElementById("mtiClose").onclick = function(){
  document.getElementById("myTreeInfoPanel").classList.remove("show");
};

document.getElementById("mtiExportBtn").onclick = async function(){
  if (!personalTreeActive) return;
  const person = root.descendants().find(n => n.data === personalTreeActive);
  if (!person) return;

  const chain = chainNames(person); // [الاسم, الأب, الجد, ...]
  const threePart = chain.slice(0, 3).join(" ");
  const title = `شجرة عائلة ${threePart} حكمي`;
  const exportDate = new Date().toLocaleDateString("ar-SA");

  const svgEl = document.getElementById("tree-svg");
  const treeG = svgEl.querySelector("g");
  const bbox = treeG.getBBox();

  // اختيار اتجاه الورقة A4 حسب شكل الشجرة
  const wide = bbox.width > bbox.height * 1.15;
  const PAGE_W = wide ? 842 : 595;
  const PAGE_H = wide ? 595 : 842;

  const frameMargin = 24;
  const titleH = 64;
  const footerH = 36;
  const contentPad = 24;
  const contentX = frameMargin + contentPad;
  const contentY = frameMargin + titleH + contentPad;
  const contentW = PAGE_W - frameMargin*2 - contentPad*2;
  const contentH = PAGE_H - frameMargin*2 - titleH - footerH - contentPad*2;

  const scale = Math.min(contentW / bbox.width, contentH / bbox.height);
  const offsetX = contentX + (contentW - bbox.width*scale)/2 - bbox.x*scale;
  const offsetY = contentY + (contentH - bbox.height*scale)/2 - bbox.y*scale;

  const svgNS = "http://www.w3.org/2000/svg";
  const page = document.createElementNS(svgNS, "svg");
  page.setAttribute("xmlns", svgNS);
  page.setAttribute("width", PAGE_W);
  page.setAttribute("height", PAGE_H);
  page.setAttribute("viewBox", `0 0 ${PAGE_W} ${PAGE_H}`);

  const styleEl = document.createElementNS(svgNS, "style");
  styleEl.textContent = document.querySelector("style").textContent;
  page.appendChild(styleEl);

  // خلفية بيضاء
  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("x", 0); bg.setAttribute("y", 0);
  bg.setAttribute("width", PAGE_W); bg.setAttribute("height", PAGE_H);
  bg.setAttribute("fill", "#FFFDF6");
  page.appendChild(bg);

  // إطار زخرفي مزدوج
  const outerFrame = document.createElementNS(svgNS, "rect");
  outerFrame.setAttribute("x", frameMargin); outerFrame.setAttribute("y", frameMargin);
  outerFrame.setAttribute("width", PAGE_W - frameMargin*2); outerFrame.setAttribute("height", PAGE_H - frameMargin*2);
  outerFrame.setAttribute("fill", "none");
  outerFrame.setAttribute("stroke", "#B8860B");
  outerFrame.setAttribute("stroke-width", "2.5");
  outerFrame.setAttribute("rx", "10");
  page.appendChild(outerFrame);

  const innerFrame = document.createElementNS(svgNS, "rect");
  innerFrame.setAttribute("x", frameMargin + 6); innerFrame.setAttribute("y", frameMargin + 6);
  innerFrame.setAttribute("width", PAGE_W - (frameMargin+6)*2); innerFrame.setAttribute("height", PAGE_H - (frameMargin+6)*2);
  innerFrame.setAttribute("fill", "none");
  innerFrame.setAttribute("stroke", "#0B3D2E");
  innerFrame.setAttribute("stroke-width", "1");
  innerFrame.setAttribute("rx", "6");
  page.appendChild(innerFrame);

  // خط فاصل تحت العنوان
  const titleLine = document.createElementNS(svgNS, "line");
  titleLine.setAttribute("x1", frameMargin + 30); titleLine.setAttribute("x2", PAGE_W - frameMargin - 30);
  titleLine.setAttribute("y1", frameMargin + titleH - 6); titleLine.setAttribute("y2", frameMargin + titleH - 6);
  titleLine.setAttribute("stroke", "#B8860B"); titleLine.setAttribute("stroke-width", "1.2");
  page.appendChild(titleLine);

  // العنوان في منتصف الورقة أفقيًا
  const titleText = document.createElementNS(svgNS, "text");
  titleText.setAttribute("x", PAGE_W/2);
  titleText.setAttribute("y", frameMargin + titleH/2 + 6);
  titleText.setAttribute("text-anchor", "middle");
  titleText.setAttribute("font-family", "Tajawal, sans-serif");
  titleText.setAttribute("font-size", "24");
  titleText.setAttribute("font-weight", "700");
  titleText.setAttribute("fill", "#241a10");
  titleText.textContent = title;
  page.appendChild(titleText);

  // الشجرة نفسها (منسوخة ومُحجّمة لتناسب المساحة)
  const gClone = treeG.cloneNode(true);
  gClone.querySelectorAll(".plus-badge, .minus-badge, .star-badge").forEach(elm => elm.remove());
  gClone.setAttribute("transform", `translate(${offsetX},${offsetY}) scale(${scale})`);
  page.appendChild(gClone);

  // تاريخ التصدير أسفل الصفحة
  const dateText = document.createElementNS(svgNS, "text");
  dateText.setAttribute("x", PAGE_W - frameMargin - 14);
  dateText.setAttribute("y", PAGE_H - frameMargin - 12);
  dateText.setAttribute("text-anchor", "end");
  dateText.setAttribute("font-family", "Tajawal, sans-serif");
  dateText.setAttribute("font-size", "11");
  dateText.setAttribute("fill", "#777");
  dateText.textContent = "تاريخ التصدير: " + exportDate;
  page.appendChild(dateText);

  const svgText = new XMLSerializer().serializeToString(page);
  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = function(){
    const dpiScale = 3; // جودة طباعة عالية
    const canvas = document.createElement("canvas");
    canvas.width = PAGE_W * dpiScale;
    canvas.height = PAGE_H * dpiScale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpiScale, dpiScale);
    ctx.drawImage(img, 0, 0, PAGE_W, PAGE_H);
    URL.revokeObjectURL(url);

    const imgData = canvas.toDataURL("image/png");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: wide ? "l" : "p", unit: "pt", format: "a4" });
    pdf.addImage(imgData, "PNG", 0, 0, PAGE_W, PAGE_H);
    pdf.save(`${title}.pdf`);
  };
  img.src = url;
};

async function openInfoModal(d){
  if (typeof bottomPanels !== "undefined") bottomPanels.forEach(p => p.classList.remove("show"));
  modalNode = d;
  pendingHalfSiblings = [];
  pendingWifeAndSiblingJobs = [];
  document.getElementById("infoModalName").textContent = modalTitleChain(d).join(" ");
  document.querySelectorAll(".info-tab").forEach(b => b.classList.remove("active"));
  document.querySelector('.info-tab[data-tab="info"]').classList.add("active");
  document.getElementById("tabAddChildren").style.display = "none";
  document.getElementById("tabInfo").style.display = "block";

  const data = await loadPersonData(personId(d));
  originalDataSnapshot = canonicalStringify(data);
  document.getElementById("f-birthYear").value = data.birthYear || "";
  document.querySelector(`input[name="deathStatus"][value="${data.deathStatus || 'alive'}"]`).checked = true;
  document.getElementById("deathYearWrap").style.display = data.deathStatus === "dead" ? "block" : "none";
  document.getElementById("f-deathYear").value = data.deathYear || "";
  document.getElementById("f-job").value = data.job || "";
  document.getElementById("f-nickname").value = data.nickname || "";
  const isFemale = d.data.type === "female";
  document.getElementById("husbandWrap").style.display = isFemale ? "block" : "none";
  husbandState = (isFemale && data.husbandId) ? { husbandId: data.husbandId, husbandName: data.husbandName, husbandChain: data.husbandChain } : null;
  renderHusbandBox();
  document.getElementById("f-husbandDivorced").checked = !!data.husbandDivorced;
  document.getElementById("f-sonsCount").textContent = modalNode.children ? modalNode.children.filter(c => c.data.type !== "female").length : 0;
  document.getElementById("f-bio").value = data.bio || "";
  photoDataUrl = data.photo || "";
  document.getElementById("photoPreviewWrap").innerHTML = photoDataUrl ? `<img src="${photoDataUrl}">` : "";
  wivesState = (data.wives || []).map(w => ({ ...w, children: [...(w.children||[])], inlaws: (w.inlaws || []).map(x => ({ ...x, sonNames: [...(x.sonNames||[])] })) }));
  renderWives();
  updateAgeDisplay();
  renderCurrentSons();

  if (data.mother && data.mother.wifeId){
    motherState = data.mother;
  } else {
    const autoInfo = await findMotherInfo(d);
    if (autoInfo && autoInfo.grandfatherNode){
      motherState = { fatherId: autoInfo.fatherId, fatherName: autoInfo.grandfatherNode.data.name, fatherChain: modalTitleChain(autoInfo.grandfatherNode).join(" "), wifeId: autoInfo.wifeId, auto: true };
    } else {
      motherState = null;
    }
  }
  await renderMotherBox();

  // ═══ ملف الزوجة غير قابل للتحرير ═══
  // بيانات النساء تُسجَّل حصرًا من الملف الأصلي (الأب أو الزوج)، لا مباشرةً هنا.
  // نُعطّل كل حقول الإدخال وزر الحفظ، ونُبقي الحذف والإغلاق فعّالين.
  const isAutoWife = d.data.type === "female" && !!(await loadPersonData(personId(d))).autoLinked;
  const lockNotice = document.getElementById("wifeLockNotice");
  if (isAutoWife){
    infoModal.querySelectorAll('input, textarea, select, button').forEach(el => {
      if (el.id === "infoModalClose") return;   // زر الإغلاق يبقى فعّالًا
      el.disabled = true;
      el.style.opacity = "0.55";
      el.style.cursor = "not-allowed";
    });
    const saveBtn = document.getElementById("f-save");
    if (saveBtn){ saveBtn.disabled = true; saveBtn.style.display = "none"; }
    if (lockNotice) lockNotice.style.display = "block";
  } else {
    infoModal.querySelectorAll('input, textarea, select, button').forEach(el => {
      el.disabled = false;
      el.style.opacity = "";
      el.style.cursor = "";
    });
    const saveBtn = document.getElementById("f-save");
    if (saveBtn){ saveBtn.disabled = false; saveBtn.style.display = ""; }
    if (lockNotice) lockNotice.style.display = "none";
  }

  infoModal.classList.add("show");
  infoBackdrop.classList.add("show");
}

function renderCurrentSons(){
  const box = document.getElementById("currentSonsList");
  box.innerHTML = "";
  const kids = (modalNode.children || []).filter(k => k.data.type !== "female");
  if (!kids.length){ box.innerHTML = `<span style="color:#999;font-size:13px">لا يوجد أبناء مضافين بعد</span>`; return; }
  kids.forEach((k) => {
    const idx = modalNode.data.children.indexOf(k.data);
    const chip = document.createElement("div");
    chip.className = "chip";
    const hasKids = k.children && k.children.length;
    const canDeleteThis = k.data.manuallyAdded && can("tree", "delete");
    chip.innerHTML = canDeleteThis
      ? `<span>${k.data.name}</span><span class="chip-x" title="حذف">✕</span>`
      : `<span>${k.data.name}</span>`;
    if (canDeleteThis){
      chip.querySelector(".chip-x").onclick = async () => {
        const msg = hasKids
          ? `"${k.data.name}" له أبناء بالشجرة — حذفه بيحذف كل ذريته أيضًا. متأكد؟`
          : `حذف "${k.data.name}"؟`;
        if (!confirm(msg)) return;
        if (isDbBacked() && k.data.id){
          try{ await firestoreDeletePerson(k.data); }
          catch(e){ customAlert("تعذّر الحذف من قاعدة البيانات: " + (e.message || e.code)); return; }
        }
        modalNode.data.children.splice(idx, 1);
        const myDataRef = modalNode.data;
        refreshView();
        modalNode = root.descendants().find(n => n.data === myDataRef);
        document.getElementById("f-sonsCount").textContent = modalNode.children ? modalNode.children.filter(c => c.data.type !== "female").length : 0;
        renderCurrentSons();
        renderWives();
      };
    }
    box.appendChild(chip);
  });
}

document.getElementById("f-newSonAdd").onclick = async () => {
  const input = document.getElementById("f-newSonInput");
  const name = input.value.trim();
  if (!name) return;
  if (isDbBacked() && !canAddUnder(modalNode.data)){
    customAlert("ما تقدر تضيف هنا — الإضافة مسموحة بس داخل النطاق المحدد لك.");
    return;
  }
  const newType = modalNode.data.type === "root" ? "trunk" : modalNode.data.type;
  const newChild = { name, type: newType, manuallyAdded: true };
  if (isDbBacked()){
    try{
      const { id, ancestorIds, pending } = await firestoreAddPerson(modalNode.data, name, newType);
      if (pending){
        customAlert(`تمت إضافة "${name}" وهي الآن بانتظار اعتماد محمد رشاد. لن تظهر بالشجرة حتى يعتمدها.`);
        input.value = "";
        return; // لا نضيفها للعرض المحلي — تبقى مخفية لحد الاعتماد
      }
      newChild.id = id;
      newChild.ancestorIds = ancestorIds;
    }catch(e){
      customAlert("تعذّر حفظ الإضافة بقاعدة البيانات: " + (e.message || e.code));
      return;
    }
  }
  modalNode.data.children = modalNode.data.children || [];
  modalNode.data.children.push(newChild);
  const myDataRef = modalNode.data;
  refreshView();
  modalNode = root.descendants().find(n => n.data === myDataRef);
  input.value = "";
  document.getElementById("f-sonsCount").textContent = modalNode.children ? modalNode.children.filter(c => c.data.type !== "female").length : 0;
  renderCurrentSons();
  renderWives();
};

document.getElementById("f-save").onclick = async () => {
  if (motherState && motherState.fatherId && !motherState.wifeId){
    customAlert("لم تكمل بيانات إضافة الأم — اختر إحدى البنات الموجودات أو أضف أمًا جديدة، أو ألغِ الإضافة (امسح اسم الأب من حقل البحث) قبل حفظ المعلومات.");
    return;
  }
  if (motherState && motherState.wifeId && !motherState.approved && !motherState.autoFromFather){
    // لا نطلب اعتماد "الإخوة من الأم" إن كانت الأم مسندة تلقائيًا عبر زوجة مسجّلة في ملف الأب.
    // نفحص الواقع الفعلي (لا وسمًا يُكتب مستقبلًا) حتى تسري القاعدة على البيانات القديمة أيضًا.
    const autoInfo = await findMotherInfo(modalNode);
    const isAutoFromFather = !!(autoInfo && autoInfo.wifeId && autoInfo.wifeId === motherState.wifeId);
    if (!isAutoFromFather){
      customAlert("لم يتم اعتماد بيانات الإخوة من الأم — اعتمد البيانات أو الغِ الإضافة أولًا قبل حفظ المعلومات.");
      return;
    }
  }
  for (const w of wivesState){
    if (w.type === "inside" && !w.fatherId && (w.children || []).length){
      customAlert(`يجب اختيار "أب الزوجة" قبل حفظ المعلومات — تم إسناد أبناء لزوجة من داخل القبيلة بدون تحديد أبيها.`);
      return;
    }
    if (w.type === "outside" && (w.children || []).length && !(w.notaries || []).length){
      customAlert(`يجب إضافة "أسماء العدلاء الخاصين بهذه الزوجة" قبل حفظ المعلومات — إلا لو ما فيه حاجة لإضافة بياناتها أصلًا.`);
      return;
    }
  }

  // لا تُحفظ زوجة من خارج القبيلة إلا إذا كانت مرتبطة بأبناء أو عدلاء
  wivesState = wivesState.filter(w => !(w.type === "outside" && !(w.children || []).length && !(w.notaries || []).length));

  // الآن (وقت الحفظ فقط) نجسّد أي زوجة/بنت جديدة بقاعدة البيانات فعليًا
  for (let wi = 0; wi < wivesState.length; wi++){
    if (wivesState[wi].type === "inside" && wivesState[wi].fatherId && wivesState[wi].wifeId){
      await ensureWifeNode(wi);
    }
  }

  // توليد معرّف ثابت لكل زوجة من خارج القبيلة فيها روابط "أبناء خالة" معتمدة
  wivesState.forEach(w => {
    if (w.type === "outside" && (w.inlaws || []).some(x => x.confirmed) && !w.outsideWifeLinkId){
      w.outsideWifeLinkId = generateWifeId();
    }
  });

  const data = {
    birthYear: document.getElementById("f-birthYear").value,
    deathStatus: document.querySelector('input[name="deathStatus"]:checked').value,
    deathYear: document.getElementById("f-deathYear").value,
    job: document.getElementById("f-job").value,
    nickname: document.getElementById("f-nickname").value,
    sonsCount: document.getElementById("f-sonsCount").textContent,
    bio: document.getElementById("f-bio").value,
    photo: photoDataUrl,
    mother: motherState,
    wives: wivesState,
    husband: modalNode.data.type === "female" ? (husbandState ? husbandState.husbandName : null) : null,
    husbandId: modalNode.data.type === "female" ? (husbandState ? husbandState.husbandId : null) : null,
    husbandChain: modalNode.data.type === "female" ? (husbandState ? husbandState.husbandChain : null) : null,
    husbandDivorced: modalNode.data.type === "female" ? document.getElementById("f-husbandDivorced").checked : null
  };

  if (!isPersonDataFilled(data)){
    customAlert("الملف فارغ — لا يوجد أي معلومات لحفظها.");
    return;
  }
  if (canonicalStringify(data) === originalDataSnapshot){
    customAlert("لم يحدث أي تغيير في البيانات — لا حاجة للحفظ.");
    return;
  }
  const myId = personId(modalNode);
  await savePersonData(myId, data);

  // تحديث فهرس الزيجات المركزي (لحساب أبناء العمة لاحقًا)
  const marriageIndex = await loadMarriageIndex();
  wivesState.forEach(w => {
    if (w.type === "inside" && w.fatherId && w._femaleNodeData){
      const femaleNode = root.descendants().find(n => n.data === w._femaleNodeData);
      if (femaleNode){
        marriageIndex[personId(femaleNode)] = {
          husbandId: myId,
          husbandName: modalNode.data.name,
          husbandChain: chainNames(modalNode).slice(0,3).join(" بن "),
          divorced: !!w.divorced
        };
      }
    }
  });
  await saveMarriageIndex(marriageIndex);

  // ═══ الربط التلقائي الكامل لملف الزوجة ═══
  // الزوجة عقدة "سلبية": لا يُدخل فيها شيء يدويًا. كل بياناتها تُملأ تلقائيًا من ملف زوجها.
  // هذا يفعّل: "زوج ابنة" في أصهار والدها، و"العديل"، و"أبناء الخالة" — بلا أي إدخال منفصل.
  const myChain3 = chainNames(modalNode).slice(0, 3).join(" بن ");
  let wifeNameChanged = false;
  for (const w of wivesState){
    if (w.type !== "inside" || !w.fatherId || !w._femaleNodeData) continue;
    const femaleNode = root.descendants().find(n => n.data === w._femaleNodeData);
    if (!femaleNode) continue;
    const wifeNodeId = personId(femaleNode);
    const wifeData = await loadPersonData(wifeNodeId);

    // 1) الزوج وحالة الطلاق — تُملأ تلقائيًا
    wifeData.husbandId = myId;
    wifeData.husbandName = modalNode.data.name;
    wifeData.husbandChain = myChain3;
    wifeData.husband = myChain3;
    wifeData.husbandDivorced = !!w.divorced;

    // 2) أبناؤها — يُسندون تلقائيًا من سجل الزوجة في ملف الزوج
    wifeData.sons = (w.children || []).slice();

    // 2ب) نضع وسم "أُسندت تلقائيًا" في ملف كل ابن، ليُعفى من شرط اعتماد الإخوة من الأم
    for (const childName of (w.children || [])){
      const childNode = (modalNode.children || []).find(cn => cn.data.name === childName && cn.data.type !== "female");
      if (!childNode) continue;
      const cid = personId(childNode);
      const cData = await loadPersonData(cid);
      if (cData.mother && cData.mother.wifeId === w.wifeId && !cData.mother.autoFromFather){
        cData.mother = { ...cData.mother, autoFromFather: true, approved: true };
        await savePersonData(cid, cData);
      }
    }

    // 3) وسم: بيانات مولّدة تلقائيًا، وملفها غير قابل للتحرير اليدوي
    wifeData.autoLinked = true;

    await savePersonData(wifeNodeId, wifeData);

    // 4) تحديث اسم عقدتها ليطابق حالة الطلاق الحالية (زوجة/طليقة + الاسم الثنائي للزوج)
    const desiredName = buildWifeNodeName(!!w.divorced);
    if (isAutoWifeName(femaleNode.data.name) && femaleNode.data.name !== desiredName){
      femaleNode.data.name = desiredName;
      w.wifeName = desiredName;
      if (femaleNode.data.id){
        try{ await db.collection("persons").doc(femaleNode.data.id).update({ name: desiredName }); }catch(e){}
      }
      wifeNameChanged = true;
    }
  }
  // إعادة الرسم بعد تغيير الأسماء، وإلا ظل الاسم القديم معروضًا (يبدو متأخرًا دورة كاملة)
  if (wifeNameChanged){
    const myDataRef2 = modalNode.data;
    refreshView();
    modalNode = root.descendants().find(n => n.data === myDataRef2) || modalNode;
  }

  // ربط "أبناء خالة": لكل زوجة من خارج القبيلة فيها عدلاء معتمدون، أضف/حدّث زوجة (أختها) في ملف كل عديل
  for (const w of wivesState){
    if (w.type !== "outside" || !w.outsideWifeLinkId) continue;
    const confirmedInlaws = (w.inlaws || []).filter(x => x.confirmed);

    for (const inlaw of confirmedInlaws){
      const notaryData = await loadPersonData(inlaw.notaryId);
      notaryData.wives = notaryData.wives || [];
      let rec = notaryData.wives.find(x => x.linkedOutsideWifeId === w.outsideWifeLinkId);
      if (!rec){
        rec = {
          type: "outside", autoName: "زوجة " + inlaw.notaryChain, notaries: [], children: [],
          linkedOutsideWifeId: w.outsideWifeLinkId, sisterOfPersonId: myId, sisterOfPersonName: modalNode.data.name
        };
        notaryData.wives.push(rec);
      }
      rec.divorced = !!inlaw.divorced;
      (inlaw.sonNames || []).forEach(nm => { if (!rec.children.includes(nm)) rec.children.push(nm); });

      // ═══ شبكة العدلاء: لكل عديل تُدرج قائمة عدلائه كاملةً في inlaws ═══
      // (أ) صاحب الملف الأصلي نفسه (أنا) عديلٌ له — كان يُخزَّن في sisterOfPersonId فقط،
      //     فلا يظهر في واجهة "إضافة المعلومات" التي تقرأ inlaws. ندرجه هنا ليتساوى العدد لدى الجميع.
      // (ب) بقية العدلاء المفعّلين "شقيقة" — زوجاتهم شقيقات لبعضهن ⇒ أزواجهن عدلاء لبعضهم.
      //     العديل غير المفعّل (أخت من جهة واحدة) لا يدخل الشبكة ويبقى مرتبطًا بي وحدي.
      rec.inlaws = rec.inlaws || [];
      if (inlaw.fullSister !== false){
        let meRec = rec.inlaws.find(x => x.notaryId === myId);
        if (!meRec){
          meRec = {
            notaryId: myId, notaryName: modalNode.data.name, notaryChain: myChain3,
            sonNames: [], divorced: false, confirmed: true, fullSister: true, autoLinked: true
          };
          rec.inlaws.push(meRec);
        }
        (w.children || []).forEach(nm => { if (!meRec.sonNames.includes(nm)) meRec.sonNames.push(nm); });

        for (const peer of confirmedInlaws){
          if (peer.notaryId === inlaw.notaryId) continue;
          if (peer.fullSister === false) continue;
          let peerRec = rec.inlaws.find(x => x.notaryId === peer.notaryId);
          if (!peerRec){
            peerRec = {
              notaryId: peer.notaryId, notaryName: peer.notaryName, notaryChain: peer.notaryChain,
              sonNames: [], divorced: !!peer.divorced, confirmed: true, fullSister: true, autoLinked: true
            };
            rec.inlaws.push(peerRec);
          }
          peerRec.divorced = !!peer.divorced;
          (peer.sonNames || []).forEach(nm => { if (!peerRec.sonNames.includes(nm)) peerRec.sonNames.push(nm); });
        }
      }

      await savePersonData(inlaw.notaryId, notaryData);
    }
  }

  // ربط الأم والإخوة غير الأشقاء (وربط الزوجة عند أبيهم): لا يُنفَّذ إلا الآن، عند الحفظ النهائي
  if (pendingWifeAndSiblingJobs.length){
    for (const job of pendingWifeAndSiblingJobs){
      for (const kid of job.kidNodes){
        await assignMotherToSiblingNode(kid, job.personalShared);
      }
      await ensureWifeEntryOnFather(job.fatherNode, job.personalShared, job.divorced, job.kidNodes.map(k => k.data.name));
    }
    if (motherState && motherState.fatherId){
      const gfNode = root.descendants().find(n => personId(n) === motherState.fatherId);
      const femaleNode = gfNode ? (gfNode.data.children || []).find(c => c.type === "female" && c.wifeId === motherState.wifeId) : null;
      if (femaleNode && femaleNode.id){
        try{ await db.collection("persons").doc(femaleNode.id).update({ motherApproved: true }); }catch(e){}
      }
    }
    pendingWifeAndSiblingJobs = [];
  }

  const msg = document.getElementById("f-saveMsg");
  msg.textContent = "تم الحفظ ✅";
  setTimeout(() => {
    msg.textContent = "";
    closeInfoModal();
  }, 1100);
};

document.getElementById("f-clearAll").onclick = async () => {
  const ok = confirm(`مسح جميع المعلومات المضافة لـ "${modalNode.data.name}" (تاريخ الميلاد، الوظيفة، الأم، الزوجات، إلخ)؟\nهذا لا يحذف الشخص نفسه من الشجرة، بل يمسح بياناته الإضافية فقط.\nهذا الإجراء لا يمكن التراجع عنه.`);
  if (!ok) return;
  const myId = personId(modalNode);
  const oldData = await loadPersonData(myId);

  const emptyData = {
    birthYear: "", deathStatus: "alive", deathYear: "", job: "", nickname: "", sonsCount: "", bio: "", photo: null,
    mother: null, notaries: [], wives: [], husband: "", husbandId: null, husbandChain: null, husbandDivorced: false
  };
  await savePersonData(myId, emptyData);
  photoDataUrl = null;
  motherState = null;
  husbandState = null;
  wivesState = [];
  await openInfoModal(modalNode);
  const msg = document.getElementById("f-saveMsg");
  msg.textContent = "تم مسح كل المعلومات وتنظيف الإشارات المرتبطة 🗑️";
  setTimeout(() => { msg.textContent = ""; }, 2500);
};

// ═══════════════════════════════════════════════════════════════
// النسخ الاحتياطي والاستعادة — من/إلى Firestore مباشرة
// تنبيه: النسخة القديمة كانت تقرأ من localStorage فقط، فكانت تُصدّر بقايا محلية
// ولا تشمل الشجرة (persons) ولا المستخدمين ولا المرفقات — أي نسخة بلا قيمة فعليًا.
// ═══════════════════════════════════════════════════════════════
const BACKUP_COLLECTIONS = ["persons", "personInfo", "users", "meta", "knowledgeChunks"];

document.getElementById("exportData").onclick = async () => {
  const btn = document.getElementById("exportData");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "⏳ جارِ التصدير…";
  try{
    const backup = {
      _meta: {
        exportedAt: new Date().toISOString(),
        version: 2,
        source: "firestore"
      }
    };
    const counts = [];
    for (const col of BACKUP_COLLECTIONS){
      backup[col] = {};
      try{
        const snap = await db.collection(col).get();
        snap.forEach(doc => { backup[col][doc.id] = doc.data(); });
        counts.push(`${col}: ${snap.size}`);
      }catch(e){
        console.warn("تعذر تصدير المجموعة", col, e);
        counts.push(`${col}: تعذّر`);
      }
    }
    const blob = new Blob([JSON.stringify(backup, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "asmal-full-backup-" + new Date().toISOString().slice(0,10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    customAlert("تم تصدير نسخة كاملة ✅\n\n" + counts.join("\n"));
  }catch(err){
    console.error(err);
    customAlert("تعذّر التصدير: " + (err.message || err));
  }finally{
    btn.disabled = false;
    btn.textContent = original;
  }
};

document.getElementById("importData").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    let backup;
    try{
      backup = JSON.parse(ev.target.result);
    }catch(err){
      customAlert("تعذّر قراءة الملف — تأكد أنه ملف نسخة صالح.");
      return;
    }

    // ملخّص قبل التنفيذ
    const summary = [];
    let total = 0;
    for (const col of BACKUP_COLLECTIONS){
      const n = backup[col] ? Object.keys(backup[col]).length : 0;
      if (n) summary.push(`${col}: ${n}`);
      total += n;
    }
    if (!total){
      customAlert("الملف لا يحتوي بيانات قابلة للاستيراد.\n(قد يكون نسخة قديمة من صيغة localStorage.)");
      return;
    }

    const ok = confirm(
      "استيراد نسخة احتياطية\n\n" + summary.join("\n") +
      "\n\n⚠️ سيُستبدل أي مستند يحمل نفس المعرّف.\nهذا الإجراء لا يمكن التراجع عنه.\n\nمتابعة؟"
    );
    if (!ok) return;

    const btnLabel = document.getElementById("importDataLabel");
    const originalLabel = btnLabel ? btnLabel.textContent : "";
    if (btnLabel) btnLabel.textContent = "⏳ جارِ الاستيراد…";

    try{
      let written = 0;
      for (const col of BACKUP_COLLECTIONS){
        const docs = backup[col];
        if (!docs) continue;
        const ids = Object.keys(docs);
        // الكتابة على دفعات (حد Firestore: 500 عملية للدفعة)
        for (let i = 0; i < ids.length; i += 400){
          const batch = db.batch();
          ids.slice(i, i + 400).forEach(id => {
            batch.set(db.collection(col).doc(id), docs[id]);
          });
          await batch.commit();
          written += Math.min(400, ids.length - i);
        }
      }
      customAlert(`تم استيراد ${written} مستندًا بنجاح ✅\n\nسيُعاد تحميل الصفحة.`);
      setTimeout(() => location.reload(), 1500);
    }catch(err){
      console.error(err);
      customAlert("تعذّر الاستيراد: " + (err.message || err));
    }finally{
      if (btnLabel) btnLabel.textContent = originalLabel;
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

// ---------- خلفية الشجرة: رفع صورة/PDF + تكبير وتحريك ----------
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}
const bgImg = document.getElementById("bgImg");
function updateBarHeight(){
  const bar = document.getElementById("bottomBar");
  if (bar) document.documentElement.style.setProperty("--barh", bar.offsetHeight + "px");
}
updateBarHeight();
window.addEventListener("resize", updateBarHeight);
window.addEventListener("orientationchange", updateBarHeight);
setTimeout(updateBarHeight, 300);
setTimeout(updateBarHeight, 1000);
if (window.ResizeObserver){
  const barEl = document.getElementById("bottomBar");
  if (barEl) new ResizeObserver(updateBarHeight).observe(barEl);
}

let bgScale = 1, bgX = 0, bgY = 0;
function applyBgTransform(){
  bgImg.style.transform = `translate(calc(-50% + ${bgX}px), calc(-50% + ${bgY}px)) scale(${bgScale})`;
}
function setBgImage(url){
  bgImg.src = url;
  bgImg.style.display = "block";
  bgScale = 1; bgX = 0; bgY = 0;
  applyBgTransform();
}

document.getElementById("bgFileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  try {
    if (isPdf){
      if (!window.pdfjsLib){ customAlert("تعذر تحميل مكتبة قراءة PDF، تأكد من الاتصال بالإنترنت."); return; }
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 3 }); // دقة عالية
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      setBgImage(canvas.toDataURL("image/jpeg", 0.92));
    } else {
      const reader = new FileReader();
      reader.onload = () => setBgImage(reader.result);
      reader.readAsDataURL(file);
    }
  } catch(err){
    customAlert("تعذر تحميل الملف كخلفية.");
  }
  e.target.value = "";
});

document.getElementById("bgZoomIn").onclick = () => { bgScale = Math.min(6, bgScale + 0.25); applyBgTransform(); };

document.getElementById("bgZoomOut").onclick = () => { bgScale = Math.max(0.5, bgScale - 0.25); applyBgTransform(); };
document.getElementById("bgReset").onclick = () => { bgScale = 1; bgX = 0; bgY = 0; applyBgTransform(); };

let bgMoveMode = true;
const bgMoveToggle = document.getElementById("bgMoveToggle");
bgMoveToggle.style.display = "none"; // لم يعد ضروريًا: التحكم بالخلفية متاح دائمًا

let bgDragging = false, bgLastX = 0, bgLastY = 0, bgPinchDist = 0, bgPinchStartScale = 1;
function bgPointFromEvent(e){ return e.touches ? { x:e.touches[0].clientX, y:e.touches[0].clientY } : { x:e.clientX, y:e.clientY }; }
function bgHasImage(){ return bgImg.style.display !== "none" && bgImg.getAttribute("src"); }
function bgIsInteractiveTarget(e){
  return e.target.closest && e.target.closest("#bottomBar, .bottom-panel, .node, #myTreeInfoPanel, #sheet, #infoModal, .zoom-fab, .exit-focus");
}
function bgStart(e){
  if (!bgHasImage() || bgIsInteractiveTarget(e)) return;
  if (e.touches && e.touches.length === 2){
    const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
    bgPinchDist = Math.hypot(dx, dy); bgPinchStartScale = bgScale; bgDragging = false;
    return;
  }
  bgDragging = true;
  const p = bgPointFromEvent(e); bgLastX = p.x; bgLastY = p.y;
}
function bgMove(e){
  if (!bgHasImage()) return;
  if (e.touches && e.touches.length === 2){
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    if (bgPinchDist > 0){ bgScale = Math.min(6, Math.max(0.5, bgPinchStartScale * (dist / bgPinchDist))); applyBgTransform(); }
    return;
  }
  if (!bgDragging) return;
  e.preventDefault();
  const p = bgPointFromEvent(e);
  bgX += p.x - bgLastX; bgY += p.y - bgLastY;
  bgLastX = p.x; bgLastY = p.y;
  applyBgTransform();
}
function bgEnd(){ bgDragging = false; bgPinchDist = 0; }
window.addEventListener("mousedown", bgStart);
window.addEventListener("touchstart", bgStart, { passive:false });
window.addEventListener("mousemove", bgMove);
window.addEventListener("touchmove", bgMove, { passive:false });
window.addEventListener("mouseup", bgEnd);
window.addEventListener("touchend", bgEnd);


/* =====================================================================
   تكبير/تصغير الواجهة بالكامل (A+ / A-) — يشمل الخطوط والأزرار والتبويبات
   وجميع تصاميم الموقع (الافتراضي ولوحة التحكم والمستقبلي) بشكل متناسب.
   يُحفظ الاختيار بمتصفح كل مستخدم (localStorage).

   ملاحظة مهمة: خاصية zoom تكبّر كل شيء بصريًا، لكن وحدات الشاشة (vh/dvh)
   المستخدمة لحدود ارتفاع النوافذ المنبثقة (كالمعلومات وحاسبة العلاقة) تبقى
   محسوبة على الحجم الفعلي للشاشة بدون اعتبار التكبير — فتطلع النافذة أكبر
   من الشاشة الحقيقية. لذلك نحسب هنا حدًا أقصى بالبكسل يعوّض هذا الفرق،
   ونطبّقه مباشرة على كل نافذة، فتبقى دائمًا ضمن حدود الموقع مهما كان التكبير.
   ===================================================================== */
(function(){
  const MIN_SCALE = 0.8, MAX_SCALE = 1.6, STEP = 0.1;
  let uiScale = parseFloat(localStorage.getItem("uiScale") || "1");
  if (isNaN(uiScale)) uiScale = 1;

  function applyScaledPanelSizing(){
    const effectiveVh = window.innerHeight / uiScale;
    const targets = [
      { id: "relPanel", pct: 0.8 },
      { id: "infoModal", pct: 0.86 },
      { id: "sheet", pct: 0.78 }
    ];
    targets.forEach(({ id, pct }) => {
      const el = document.getElementById(id);
      if (el) el.style.maxHeight = Math.round(effectiveVh * pct) + "px";
    });
  }

  function applyUiScale(){
    document.body.style.zoom = uiScale;
    localStorage.setItem("uiScale", String(uiScale));
    applyScaledPanelSizing();
  }

  const upBtn = document.getElementById("uiScaleUp");
  const downBtn = document.getElementById("uiScaleDown");
  if (upBtn) upBtn.onclick = () => {
    uiScale = Math.min(MAX_SCALE, +(uiScale + STEP).toFixed(2));
    applyUiScale();
  };
  if (downBtn) downBtn.onclick = () => {
    uiScale = Math.max(MIN_SCALE, +(uiScale - STEP).toFixed(2));
    applyUiScale();
  };

  window.addEventListener("resize", applyScaledPanelSizing);
  applyUiScale();
})();

/* =====================================================================
   فحص بيانات شخص وتنظيف الأخطاء (زوجات من خارج القبيلة بلا أبناء/عدلاء، إلخ)
   ===================================================================== */
let inspectTargetNode = null;

function resetInspectSearch(){
  const box = document.getElementById("inspectSearchBox");
  const btn = document.getElementById("inspectBtn");
  const resultsEl = document.getElementById("inspectResults");
  if (!box || !btn || !resultsEl) return;
  inspectTargetNode = null;
  btn.disabled = true;
  resultsEl.innerHTML = "";
  box.innerHTML = "";
  const search = makePersonSearchBox("اكتب الاسم الرباعي، ثم اضغط عليه من القائمة", (m) => {
    inspectTargetNode = m;
    box.innerHTML = "";
    const chip = document.createElement("div");
    chip.className = "chip-list";
    const c = document.createElement("div");
    c.className = "chip";
    c.innerHTML = `<span>${escapeHtml(chainNames(m).slice(0,4).join(" بن "))}</span><span class="chip-x">✕</span>`;
    c.querySelector(".chip-x").onclick = resetInspectSearch;
    chip.appendChild(c);
    box.appendChild(chip);
    btn.disabled = false;
  });
  box.appendChild(search);
}

(function setupInspectPanel(){
  const btn = document.getElementById("inspectBtn");
  const resultsEl = document.getElementById("inspectResults");
  if (!document.getElementById("inspectSearchBox") || !btn || !resultsEl) return;

  resetInspectSearch();

  btn.onclick = async () => {
    if (!inspectTargetNode) return;
    resultsEl.innerHTML = `<div style="text-align:center; color:#999; font-size:13px;">جارِ التحميل…</div>`;
    const data = await loadPersonData(personId(inspectTargetNode));
    renderInspectResults(inspectTargetNode, data);
  };
})();

function inspectRowHtml(label, value){
  return `<div class="ip-row"><span class="ip-label">${escapeHtml(label)}:</span><span class="ip-value">${escapeHtml(String(value))}</span></div>`;
}

async function inspectPatchAndRefresh(node, patchFn){
  const pid = personId(node);
  const data = await loadPersonData(pid);
  patchFn(data);
  await savePersonData(pid, data);
  renderInspectResults(node, data);
}

function renderInspectResults(node, data){
  const resultsEl = document.getElementById("inspectResults");
  const pid = personId(node);
  const blocks = [];

  function fieldBlock(title, value, onDelete){
    const row = document.createElement("div");
    row.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:8px; background:#faf8f1; border-radius:8px; padding:8px 12px; margin-bottom:6px; font-size:13px; color:#241a10;";
    row.innerHTML = `<span><b>${escapeHtml(title)}:</b> ${escapeHtml(String(value))}</span>`;
    const x = document.createElement("span");
    x.textContent = "✕";
    x.style.cssText = "color:#8B1E1E; font-weight:700; cursor:pointer; flex:none;";
    x.onclick = async () => { if (confirm(`حذف "${title}"؟`)) await onDelete(); };
    row.appendChild(x);
    return row;
  }

  resultsEl.innerHTML = "";
  const header = document.createElement("div");
  header.style.cssText = "display:flex; justify-content:space-between; align-items:center; font-weight:700; color:#0B3D2E; margin-bottom:8px;";
  header.innerHTML = `<span>بيانات: ${escapeHtml(chainNames(node).slice(0,4).join(" بن "))}</span>`;
  const closeBtn = document.createElement("button");
  closeBtn.className = "f-btn-sm";
  closeBtn.style.cssText = "background:#8B1E1E; padding:5px 12px; font-size:12px;";
  closeBtn.textContent = "✕ إغلاق وفحص آخر";
  closeBtn.onclick = resetInspectSearch;
  header.appendChild(closeBtn);
  resultsEl.appendChild(header);

  if (data.birthYear){
    resultsEl.appendChild(fieldBlock("تاريخ الميلاد", data.birthYear, () => inspectPatchAndRefresh(node, d => { d.birthYear = ""; })));
  }
  if (data.deathStatus === "dead"){
    resultsEl.appendChild(fieldBlock("الحالة", "متوفى" + (data.deathYear ? (" (" + data.deathYear + "هـ)") : ""), () => inspectPatchAndRefresh(node, d => { d.deathStatus = "alive"; d.deathYear = ""; })));
  }
  if (data.job){
    resultsEl.appendChild(fieldBlock("الوظيفة", data.job, () => inspectPatchAndRefresh(node, d => { d.job = ""; })));
  }
  if (data.nickname){
    resultsEl.appendChild(fieldBlock("اللقب/الشهرة", data.nickname, () => inspectPatchAndRefresh(node, d => { d.nickname = ""; })));
  }
  if (data.bio){
    resultsEl.appendChild(fieldBlock("نبذة", data.bio.slice(0,60) + (data.bio.length > 60 ? "…" : ""), () => inspectPatchAndRefresh(node, d => { d.bio = ""; })));
  }
  if (data.photo){
    resultsEl.appendChild(fieldBlock("صورة", "مرفقة", () => inspectPatchAndRefresh(node, d => { d.photo = null; })));
  }
  if (data.mother && data.mother.wifeId){
    resultsEl.appendChild(fieldBlock("الأم", motherDisplayName(data.mother), () => inspectPatchAndRefresh(node, d => { d.mother = null; })));
  }
  if (data.husband){
    resultsEl.appendChild(fieldBlock("الزوج", data.husband + (data.husbandDivorced ? " (مطلّقة)" : ""), () => inspectPatchAndRefresh(node, d => { d.husband = null; d.husbandId = null; d.husbandChain = null; d.husbandDivorced = null; })));
  }

  (data.wives || []).forEach((w, idx) => {
    const wrap = document.createElement("div");
    const broken = w.type === "outside" && !(w.children || []).length && !(w.notaries || []).length;
    wrap.style.cssText = `border:1.3px solid ${broken ? "#8B1E1E" : "#EFE7D8"}; background:${broken ? "#FBEAEA" : "#FFF8E1"}; border-radius:10px; padding:10px 12px; margin-bottom:8px; font-size:13px; color:#241a10;`;
    let desc = w.type === "inside"
      ? `زوجة من داخل القبيلة${w.fatherChain ? (" — والدها: " + w.fatherChain) : " — (بدون تحديد والدها)"}`
      : `زوجة من خارج القبيلة${w.divorced ? " (مطلّقة)" : ""}`;
    let extra = "";
    if ((w.children || []).length) extra += `<div>الأبناء: ${escapeHtml(w.children.join("، "))}</div>`;
    if ((w.notaries || []).length) extra += `<div>العدلاء: ${escapeHtml(w.notaries.map(n => n.chain3 || n.name).join("، "))}</div>`;
    if (broken) extra += `<div style="color:#8B1E1E; font-weight:700; margin-top:4px;">⚠️ زوجة بدون أي ربط (أبناء أو عدلاء) — سجل قديم يُنصح بحذفه</div>`;
    wrap.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
        <div><b>${escapeHtml(desc)}</b>${extra}</div>
        <span class="ip-del-wife" style="color:#8B1E1E; font-weight:700; cursor:pointer; flex:none;">✕</span>
      </div>`;
    wrap.querySelector(".ip-del-wife").onclick = async () => {
      if (!confirm("حذف هذه الزوجة وكل بياناتها من هذا الملف؟")) return;
      await inspectPatchAndRefresh(node, d => { (d.wives || []).splice(idx, 1); });
    };
    resultsEl.appendChild(wrap);
  });

  if (!resultsEl.children.length || resultsEl.children.length === 1){
    const empty = document.createElement("div");
    empty.style.cssText = "color:#999; font-size:13px; text-align:center; padding:10px 0;";
    empty.textContent = "لا يوجد أي بيانات مسجّلة لهذا الشخص.";
    resultsEl.appendChild(empty);
  }
}
