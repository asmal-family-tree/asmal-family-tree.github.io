/* ============================================================
   stats.js — منطق صفحة الإحصائيات (حصرية للأدمن)
   يعتمد على auth.js المشترك، ونفس إعداد Firebase في app.js.

   بنية قابلة للتوسعة: كل إحصائية = عنصر بمصفوفة STATS_MODULES
   (id, title, desc, render(container)). لإضافة إحصائية جديدة مستقبلًا:
   أضف كائنًا جديدًا لهذه المصفوفة فقط — بلا أي تعديل بباقي الملف.
   ============================================================ */

// ============ Firebase (نفس إعداد الموقع الرئيسي) ============
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
const auth = firebase.auth();
const db = firebase.firestore();

// ============ تحميل بيانات الشجرة كاملة (مرة واحدة) ============
let personsById = new Map();       // id -> {id, name, type, parentId, wifeId, ...}
let personInfoById = new Map();    // id -> بيانات نموذج "إضافة معلومات"
let childrenByParent = new Map();  // parentId -> [child, ...]
let fullChainById = new Map();     // id -> "الاسم بن الأب بن الجد ... حتى الجد الجامع"
let rootId = null;

function isFemale(p){ return p && p.type === "female"; }

async function loadAllData(){
  const [personsSnap, infoSnap] = await Promise.all([
    db.collection("persons").get(),
    db.collection("personInfo").get()
  ]);

  personsById = new Map();
  personsSnap.forEach(doc => {
    const d = doc.data();
    personsById.set(doc.id, {
      id: doc.id, name: d.name, type: d.type, parentId: d.parentId || null,
      wifeId: d.wifeId || null, isJoinPoint: !!d.isJoinPoint, pendingApproval: !!d.pendingApproval
    });
    if (!d.parentId) rootId = doc.id;
  });

  // بيانات personInfo مفتاحها الفعلي "سلسلة الاسم" (نفس دالة personId/firestorePersonInfoId
  // بالموقع الرئيسي: الأسماء من الشخص حتى الجذر مفصولة بـ"/" ثم استُبدلت بـ"__") — وليس
  // معرّف مستند persons مباشرة. نبني نفس المفتاح لكل شخص لنربط بياناته الإضافية بدقة.
  const rawPersonInfoByChainKey = new Map();
  infoSnap.forEach(doc => rawPersonInfoByChainKey.set(doc.id, doc.data()));
  function chainKeyOf(id){
    const names = [];
    let cur = personsById.get(id);
    while (cur){ names.push(cur.name); cur = cur.parentId ? personsById.get(cur.parentId) : null; }
    return names.join("/").replace(/\//g, "__");
  }
  personInfoById = new Map();
  personsById.forEach((p, id) => {
    personInfoById.set(id, rawPersonInfoByChainKey.get(chainKeyOf(id)) || {});
  });

  // فهرس الأبناء المباشرين لكل شخص
  childrenByParent = new Map();
  personsById.forEach(p => {
    if (!p.parentId) return;
    if (!childrenByParent.has(p.parentId)) childrenByParent.set(p.parentId, []);
    childrenByParent.get(p.parentId).push(p);
  });

  // بناء سلسلة الاسم الكاملة لكل شخص (حتى الجد الجامع)
  fullChainById = new Map();
  function chainOf(id){
    if (fullChainById.has(id)) return fullChainById.get(id);
    const names = [];
    let cur = personsById.get(id);
    while (cur){
      names.push(cur.name);
      cur = cur.parentId ? personsById.get(cur.parentId) : null;
    }
    const chain = names.join(" بن ");
    fullChainById.set(id, chain);
    return chain;
  }
  personsById.forEach((p, id) => chainOf(id));
}

function personInfo(id){ return personInfoById.get(id) || {}; }

// سلسلة أسماء شخص (من نفسه حتى الجذر)، مع إمكانية استبدال اسم شخص واحد بالسلسلة
// باسم بديل (بلا تعديل أي بيانات فعلية) — تُستخدم لحساب "قبل/بعد" تغيير الاسم.
function chainNamesWithOverride(startId, overrideId, overrideName){
  const names = [];
  let cur = personsById.get(startId);
  while (cur){
    names.push((overrideId && cur.id === overrideId) ? overrideName : cur.name);
    cur = cur.parentId ? personsById.get(cur.parentId) : null;
  }
  return names;
}
function rawChainOf(startId, overrideId, overrideName){
  return chainNamesWithOverride(startId, overrideId || null, overrideName || null).join("/");
}
function displayChainOf(startId, overrideId, overrideName){
  return chainNamesWithOverride(startId, overrideId || null, overrideName || null).join(" بن ");
}

// كل ذرية شخص (أبناؤه وأحفاده... بلا حد للعمق)، شاملةً الشخص نفسه
function collectWithDescendants(personDbId){
  const result = [];
  (function walk(pid){
    result.push(pid);
    (childrenByParent.get(pid) || []).forEach(c => walk(c.id));
  })(personDbId);
  return result;
}

// ============ أداة عرض قائمة أسماء قابلة للضغط (تفتح نموذج التعديل الحقيقي) ============
// opts.editable = true: يضيف زر ✏️ بجانب كل اسم لتعديله (خاص بوحدة بحث تطابق الأسماء فقط)
function renderNameList(container, ids, opts){
  opts = opts || {};
  const ul = document.createElement("ul");
  ul.className = "stat-name-list";
  ids.forEach(id => {
    const li = document.createElement("li");
    li.style.display = "flex"; li.style.alignItems = "center"; li.style.justifyContent = "space-between"; li.style.gap = "8px";
    const nameSpan = document.createElement("span");
    nameSpan.style.flex = "1"; nameSpan.style.cursor = "pointer";
    nameSpan.textContent = fullChainById.get(id) || personsById.get(id)?.name || id;
    nameSpan.onclick = () => { location.href = "index.html?openInfo=" + encodeURIComponent(id); };
    li.appendChild(nameSpan);
    if (opts.editable){
      const editBtn = document.createElement("button");
      editBtn.className = "name-edit-btn";
      editBtn.type = "button";
      editBtn.title = "تعديل الاسم (أدمن)";
      editBtn.textContent = "✏️";
      editBtn.onclick = (e) => { e.stopPropagation(); toggleNameEditRow(li, id); };
      li.appendChild(editBtn);
    }
    ul.appendChild(li);
  });
  container.appendChild(ul);
}

// ============ تعديل الاسم: صفّ التعديل المضغوط أسفل كل اسم ============
function toggleNameEditRow(li, personDbId){
  const existing = li.nextElementSibling;
  if (existing && existing.classList.contains("name-edit-row")){ existing.remove(); return; }
  document.querySelectorAll(".name-edit-row").forEach(r => r.remove());

  const row = document.createElement("li");
  row.className = "name-edit-row";
  const currentName = personsById.get(personDbId)?.name || "";
  row.innerHTML = `
    <div class="stat-input-row" style="margin-top:6px;">
      <input type="text" class="ner-input" value="${currentName}" placeholder="الاسم الجديد">
      <button type="button" class="ner-preview-btn">معاينة التغيير</button>
    </div>
    <div class="ner-preview-result"></div>`;
  li.after(row);
  row.querySelector(".ner-preview-btn").onclick = () => runNamePreview(personDbId, row);
}

function runNamePreview(personDbId, row){
  const input = row.querySelector(".ner-input");
  const resultBox = row.querySelector(".ner-preview-result");
  const newName = input.value.trim();
  const oldName = personsById.get(personDbId)?.name || "";
  if (!newName){ resultBox.textContent = "اكتب اسمًا جديدًا أولًا."; return; }
  if (newName === oldName){ resultBox.textContent = "الاسم الجديد مطابق للاسم الحالي."; return; }

  const affected = collectWithDescendants(personDbId);
  const affectedSet = new Set(affected);
  const inlawAffected = [];
  personsById.forEach((p, pid) => {
    if (!isFemale(p)) return;
    const info = personInfo(pid);
    if (info.husbandId && affectedSet.has(info.husbandId)) inlawAffected.push(pid);
  });

  resultBox.innerHTML = `
    <div class="stat-preview-box">
      سيتأثر بهذا التغيير:<br>
      • ${affected.length} شخصًا (هو وذريته) — سيُعاد ربط بياناتهم بالكامل<br>
      • ${inlawAffected.length} سجل "صهر" بمكان آخر بالشجرة — سيُحدَّث اسمه هناك<br>
      <button type="button" class="ner-confirm-btn">✅ تأكيد التنفيذ</button>
      <button type="button" class="ner-cancel-btn">إلغاء</button>
    </div>`;
  resultBox.querySelector(".ner-cancel-btn").onclick = () => { resultBox.innerHTML = ""; };
  resultBox.querySelector(".ner-confirm-btn").onclick = () =>
    executeNameChange(personDbId, newName, affected, inlawAffected, resultBox);
}

async function executeNameChange(personDbId, newName, affected, inlawAffected, resultBox){
  resultBox.innerHTML = '<div class="stat-loading">جارِ التنفيذ…</div>';
  try{
    let batch = db.batch();
    let opCount = 0;
    async function flushIfNeeded(force){
      if (opCount > 0 && (opCount >= 450 || force)){
        await batch.commit();
        batch = db.batch();
        opCount = 0;
      }
    }

    // 1) اسم الشخص نفسه بمجموعة persons
    batch.update(db.collection("persons").doc(personDbId), { name: newName });
    opCount++;

    // 2) نقل بيانات personInfo لكل شخص متأثر (هو وكل ذريته) من مفتاحه القديم للجديد
    for (const pid of affected){
      const oldKey = rawChainOf(pid).replace(/\//g, "__");
      const newKey = rawChainOf(pid, personDbId, newName).replace(/\//g, "__");
      if (oldKey !== newKey){
        const oldDoc = await db.collection("personInfo").doc(oldKey).get();
        if (oldDoc.exists){
          batch.set(db.collection("personInfo").doc(newKey), oldDoc.data());
          batch.delete(db.collection("personInfo").doc(oldKey));
          opCount += 2;
        }
      }
      await flushIfNeeded(false);
    }

    // 3) تحديث husbandChain لأي سجل "صهر" متأثر بمكان آخر
    for (const dgtId of inlawAffected){
      const dgtInfo = personInfo(dgtId);
      const newHusbandChain = displayChainOf(dgtInfo.husbandId, personDbId, newName);
      const dgtKey = rawChainOf(dgtId).replace(/\//g, "__");
      batch.update(db.collection("personInfo").doc(dgtKey), { husbandChain: newHusbandChain });
      opCount++;
      await flushIfNeeded(false);
    }

    await flushIfNeeded(true);

    resultBox.innerHTML = `<div class="stat-result-count">✅ تم تحديث ${affected.length + inlawAffected.length} سجلًا بنجاح. جارِ تحديث الصفحة…</div>`;
    await loadAllData();
    renderAllModules();
  }catch(e){
    console.error(e);
    resultBox.innerHTML = `<div class="stat-empty">تعذّر التنفيذ: ${e.message || e.code}</div>`;
  }
}

// ============ الوحدة 1: بحث السلاسل بطول متغيّر ============
const modNameChainSearch = {
  id: "nameChainSearch",
  title: "🔎 بحث تطابق الأسماء",
  desc: "اكتب اسم شخص، أو اسمه مع أبيه، أو أكثر — يظهر عدد كل من يطابق هذه السلسلة من بدايتها، بأسمائهم كاملة حتى الجد الجامع.",
  render(container){
    const row = document.createElement("div");
    row.className = "stat-input-row";
    row.innerHTML = `<input id="ncsInput" type="text" placeholder="مثال: علي محمد">
                      <button id="ncsBtn">بحث</button>`;
    container.appendChild(row);
    const resultBox = document.createElement("div");
    container.appendChild(resultBox);

    function runSearch(){
      const q = document.getElementById("ncsInput").value.trim();
      resultBox.innerHTML = "";
      if (!q) return;
      const queryWords = q.split(/\s+/).filter(Boolean);
      const matches = [];
      personsById.forEach((p, id) => {
        const chainWords = (fullChainById.get(id) || "").split(" بن ");
        let ok = true;
        for (let i = 0; i < queryWords.length; i++){
          if (chainWords[i] !== queryWords[i]){ ok = false; break; }
        }
        if (ok) matches.push(id);
      });
      const countEl = document.createElement("div");
      countEl.className = "stat-result-count";
      countEl.textContent = `🔢 العدد: ${matches.length}`;
      resultBox.appendChild(countEl);
      if (matches.length) renderNameList(resultBox, matches, { editable: true });
    }
    document.getElementById("ncsBtn").onclick = runSearch;
    document.getElementById("ncsInput").addEventListener("keydown", e => { if (e.key === "Enter") runSearch(); });
  }
};

// ============ الوحدة 2: البيانات الفارغة (حسب حقل من نموذج إضافة المعلومات) ============
const EMPTY_FIELD_OPTIONS = [
  { key: "nickname",  label: "اللقب/الشهرة" },
  { key: "birthYear", label: "تاريخ الميلاد (سنة هجرية)" },
  { key: "deathYear", label: "سنة الوفاة (هجرية) — للمتوفَّين فقط" },
  { key: "job",       label: "الوظيفة" },
  { key: "husband",   label: "زوجها/الصهر — للإناث فقط" },
  { key: "mother",    label: "الأم" },
  { key: "wives",     label: "بيانات الزوجة والأبناء — للذكور فقط" },
  { key: "bio",       label: "نبذة تاريخية" },
  { key: "photo",     label: "صورة" }
];
function isEmptyValue(v){
  if (v === undefined || v === null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}
const modEmptyFields = {
  id: "emptyFields",
  title: "🗂️ البيانات الفارغة",
  desc: "اختر حقلًا لتظهر فورًا قائمة كل من هذا الحقل فارغ لديه. الضغط على أي اسم يفتح نموذج إضافة المعلومات الحقيقي له مباشرة للتعبئة.",
  render(container){
    const row = document.createElement("div");
    row.className = "stat-input-row";
    const select = document.createElement("select");
    select.id = "efSelect";
    select.innerHTML = `<option value="">— اختر حقلًا —</option>` +
      EMPTY_FIELD_OPTIONS.map(o => `<option value="${o.key}">${o.label}</option>`).join("");
    row.appendChild(select);
    container.appendChild(row);
    const resultBox = document.createElement("div");
    container.appendChild(resultBox);

    select.onchange = () => {
      resultBox.innerHTML = "";
      const key = select.value;
      if (!key) return;
      const matches = [];
      personsById.forEach((p, id) => {
        if (key === "husband" && !isFemale(p)) return;   // يخص الإناث فقط
        if (key === "wives" && isFemale(p)) return;       // يخص الذكور فقط
        if (key === "deathYear" && personInfo(id).deathStatus !== "deceased") return; // يخص المتوفَّين فقط
        if (isEmptyValue(personInfo(id)[key])) matches.push(id);
      });
      const countEl = document.createElement("div");
      countEl.className = "stat-result-count";
      countEl.textContent = `🔢 العدد: ${matches.length}`;
      resultBox.appendChild(countEl);
      if (matches.length) renderNameList(resultBox, matches);
      else{
        const e = document.createElement("div");
        e.className = "stat-empty"; e.textContent = "لا يوجد — كل السجلات مكتملة بهذا الحقل 🎉";
        resultBox.appendChild(e);
      }
    };
  }
};

// ============ الوحدة 3: الأكثر أبناءً (ذكورًا) ============
const modMostSons = {
  id: "mostSons",
  title: "👨‍👦‍👦 الأكثر أبناءً",
  desc: "ترتيب تنازلي حسب عدد الأبناء الذكور المباشرين (المُسجَّلين فعليًا بالشجرة).",
  render(container){
    const rows = [];
    personsById.forEach((p, id) => {
      const kids = childrenByParent.get(id) || [];
      const sons = kids.filter(k => !isFemale(k));
      if (sons.length) rows.push({ id, sons });
    });
    rows.sort((a, b) => b.sons.length - a.sons.length);
    const top = rows.slice(0, 20);
    if (!top.length){
      const e = document.createElement("div"); e.className = "stat-empty"; e.textContent = "لا توجد بيانات كافية بعد.";
      container.appendChild(e); return;
    }
    top.forEach(r => {
      const g = document.createElement("div");
      g.className = "stat-group";
      const t = document.createElement("div");
      t.className = "stat-group-title";
      t.style.cursor = "pointer";
      t.textContent = `${fullChainById.get(r.id)} — عدد الأبناء: ${r.sons.length}`;
      t.onclick = () => { location.href = "index.html?openInfo=" + encodeURIComponent(r.id); };
      g.appendChild(t);
      r.sons.forEach(s => {
        const sub = document.createElement("div");
        sub.className = "stat-group-sub";
        sub.textContent = "• " + s.name;
        g.appendChild(sub);
      });
      container.appendChild(g);
    });
  }
};

// ============ الوحدة 4: تقرير الأصهار (منظَّم حسب الأب) ============
const modInLaws = {
  id: "inLaws",
  title: "🤝 تقرير الأصهار",
  desc: "لكل أب، أزواج بناته المسجَّلون (متزوجون حاليًا أو مطلَّقون)، بأسمائهم الرباعية الكاملة.",
  render(container){
    const rows = [];
    personsById.forEach((p, id) => {
      const daughters = (childrenByParent.get(id) || []).filter(isFemale);
      const entries = [];
      daughters.forEach(dgt => {
        const info = personInfo(dgt.id);
        if (info.husbandChain || info.husband){
          entries.push({
            husbandName: info.husbandChain || info.husband,
            divorced: !!info.husbandDivorced
          });
        }
      });
      if (entries.length) rows.push({ id, entries });
    });
    if (!rows.length){
      const e = document.createElement("div"); e.className = "stat-empty"; e.textContent = "لا توجد بيانات أصهار مسجَّلة بعد.";
      container.appendChild(e); return;
    }
    rows.forEach(r => {
      const g = document.createElement("div");
      g.className = "stat-group";
      const t = document.createElement("div");
      t.className = "stat-group-title";
      t.style.cursor = "pointer";
      t.textContent = fullChainById.get(r.id);
      t.onclick = () => { location.href = "index.html?openInfo=" + encodeURIComponent(r.id); };
      g.appendChild(t);
      r.entries.forEach(en => {
        const sub = document.createElement("div");
        sub.className = "stat-group-sub" + (en.divorced ? " divorced" : "");
        sub.textContent = en.divorced ? `ابنته طليقة ${en.husbandName}` : `ابنته متزوجة ${en.husbandName}`;
        g.appendChild(sub);
      });
      container.appendChild(g);
    });
  }
};

// ============ الوحدتان 5 و6: تطابق سنوات الميلاد/الوفاة ============
function buildYearDuplicatesModule(fieldKey, id, title, icon, statusFilter){
  return {
    id, title: `${icon} ${title}`,
    desc: `كل سنة هجرية يشترك بها أكثر من شخص واحد بهذا التاريخ، مع أسمائهم.`,
    render(container){
      const byYear = new Map();
      personsById.forEach((p, pid) => {
        const info = personInfo(pid);
        if (statusFilter && info.deathStatus !== statusFilter) return;
        const y = (info[fieldKey] || "").trim();
        if (!y) return;
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y).push(pid);
      });
      const dupYears = [...byYear.entries()].filter(([, ids]) => ids.length > 1)
        .sort((a, b) => b[1].length - a[1].length);
      if (!dupYears.length){
        const e = document.createElement("div"); e.className = "stat-empty"; e.textContent = "لا يوجد تطابق حاليًا.";
        container.appendChild(e); return;
      }
      dupYears.forEach(([year, ids]) => {
        const g = document.createElement("div");
        g.className = "stat-group";
        const t = document.createElement("div");
        t.className = "stat-group-title";
        t.textContent = `${year}هـ ← ${ids.length} أشخاص`;
        g.appendChild(t);
        renderNameList(g, ids);
        container.appendChild(g);
      });
    }
  };
}
const modBirthYearDup = buildYearDuplicatesModule("birthYear", "birthYearDup", "تطابق سنوات الميلاد", "📅", null);
const modDeathYearDup = buildYearDuplicatesModule("deathYear", "deathYearDup", "تطابق سنوات الوفاة", "📅", "deceased");

// ============ مصفوفة الوحدات (أضف هنا أي إحصائية جديدة مستقبلًا) ============
const STATS_MODULES = [
  modNameChainSearch,
  modEmptyFields,
  modMostSons,
  modInLaws,
  modBirthYearDup,
  modDeathYearDup
];

function renderAllModules(){
  const container = document.getElementById("statsContainer");
  container.innerHTML = "";
  STATS_MODULES.forEach(mod => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.id = "stat-" + mod.id;
    const h = document.createElement("h3");
    h.textContent = mod.title;
    card.appendChild(h);
    if (mod.desc){
      const d = document.createElement("div");
      d.className = "stat-desc";
      d.textContent = mod.desc;
      card.appendChild(d);
    }
    container.appendChild(card);
    try{ mod.render(card); }
    catch(e){
      console.error("تعذّر عرض وحدة إحصائية:", mod.id, e);
      const err = document.createElement("div");
      err.className = "stat-empty"; err.textContent = "تعذّر تحميل هذه الإحصائية.";
      card.appendChild(err);
    }
  });
}

// ============ تسجيل الدخول والتحقق من صلاحية الأدمن ============
auth.onAuthStateChanged(async (user) => {
  const gate = document.getElementById("authGate");
  if (!user){
    gate.textContent = "يجب تسجيل الدخول أولًا — سيتم تحويلك للصفحة الرئيسية...";
    setTimeout(() => location.href = "index.html", 1500);
    return;
  }
  try{
    const snap = await db.collection("users").doc(user.uid).get();
    if (!snap.exists){
      gate.textContent = "حسابك غير مكتمل. راجع الصفحة الرئيسية أولًا.";
      return;
    }
    window.authUser = buildAuthUser(user.uid, snap.data());
    if (!isAdminUser()){
      gate.textContent = "هذه الصفحة حصرية للمشرف. سيتم تحويلك للصفحة الرئيسية...";
      setTimeout(() => location.href = "index.html", 1500);
      return;
    }
    const loadingMsg = document.createElement("div");
    loadingMsg.className = "stat-loading";
    loadingMsg.textContent = "جارِ تحميل بيانات الشجرة الكاملة…";
    gate.textContent = "";
    gate.appendChild(loadingMsg);

    await loadAllData();

    gate.style.display = "none";
    document.getElementById("pageWrap").style.display = "";
    document.getElementById("statsUserName").textContent = window.authUser.displayName || "";
    renderAllModules();
  }catch(e){
    gate.textContent = "حدث خطأ أثناء التحميل: " + (e.message || e.code);
    console.error(e);
  }
});
