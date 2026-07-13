/* ============================================================
   news.js — منطق صفحة الأخبار (المرحلة 3)
   يعتمد على auth.js المشترك، ونفس إعداد Firebase في app.js.
   ============================================================ */

// ============ Firebase ============
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

// ============ مزامنة ثيم/تصميم الموقع (نفس منطق app.js تمامًا) ============
// تُستدعى فورًا (لا تنتظر تسجيل الدخول) حتى لا تظهر الصفحة بألوان افتراضية خاطئة.
async function loadAndApplySiteTheme(ignoreLocalOverride){
  let theme = "", layoutStyle = "";
  try{
    const snap = await db.collection("meta").doc("siteSettings").get();
    if (snap.exists){
      theme = snap.data().theme || "";
      layoutStyle = snap.data().layoutStyle || "";
    }
  }catch(e){ console.warn("تعذر تحميل ثيم الموقع، استُخدم الافتراضي:", e); }

  if (!ignoreLocalOverride){
    const myTheme  = localStorage.getItem("myTheme");
    const myLayout = localStorage.getItem("myLayout");
    if (myTheme  !== null) theme = myTheme;
    if (myLayout !== null) layoutStyle = myLayout;
  }

  if (theme) document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");
  if (layoutStyle) document.documentElement.setAttribute("data-style", layoutStyle);
  else document.documentElement.removeAttribute("data-style");
}
loadAndApplySiteTheme();

// ============ أدوات مساعدة ============
function escapeHtml(str){
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function customAlert(message){
  document.getElementById("customAlertMsg").textContent = message;
  document.getElementById("customAlertBackdrop").style.display = "flex";
}
document.getElementById("customAlertOk").onclick = () => {
  document.getElementById("customAlertBackdrop").style.display = "none";
};

// أي رقم هاتف سعودي داخل النص يتحول لرابط واتساب مباشر (0 البادئة → 966)
function linkifyPhones(rawText){
  const safe = escapeHtml(rawText);
  return safe.replace(/(0\d{9}|\+?9665\d{8})/g, (m)=>{
    const digits = m.replace(/[^\d]/g, "").replace(/^0/, "966");
    return `<a href="https://wa.me/${digits}" target="_blank" class="phone-link">${m}</a>`;
  });
}

function avatarUrl(name){
  return `https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(name||"?")}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

function fmtDate(ts){
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("ar-SA-u-ca-gregory", { day:"numeric", month:"long", year:"numeric" });
}

function todayKey(){
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

// ضغط الصورة (نفس أسلوب app.js: أقصى بُعد 1200، جودة 0.7)
function compressImage(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (ev)=>{
      const img = new Image();
      img.onload = ()=>{
        const maxDim = 1200;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale; canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============ الحالة العامة ============
let dailyLimit = 2;          // يُستبدل بقيمة meta/newsSettings الفعلية
let uploadedImg = null;      // صورة الخبر الجاري كتابته (Data URL)

// ============ تسجيل الدخول والتحقق من الصلاحية ============
auth.onAuthStateChanged(async (user)=>{
  const gate = document.getElementById("authGate");
  if (!user){
    gate.textContent = "يجب تسجيل الدخول أولًا — سيتم تحويلك للصفحة الرئيسية...";
    setTimeout(()=> location.href = "index.html", 1500);
    return;
  }
  try{
    const snap = await db.collection("users").doc(user.uid).get();
    if (!snap.exists){
      gate.textContent = "حسابك غير مكتمل. راجع الصفحة الرئيسية أولًا.";
      return;
    }
    window.authUser = buildAuthUser(user.uid, snap.data());
    if (isAdminUser()) await loadAndApplySiteTheme(true); // الأدمن يرى ثيم الموقع العام دائمًا، بلا تفضيل محلي شخصي
    if (window.authUser.status !== "active"){
      gate.textContent = "حسابك بانتظار التفعيل أو محظور. راجع المشرف.";
      return;
    }
    if (!can("news","view")){
      gate.textContent = "لا تملك صلاحية مشاهدة الأخبار.";
      return;
    }
    await loadNewsSettings();
    gate.style.display = "none";
    document.getElementById("pageWrap").style.display = "";
    if (canWriteNews()) document.getElementById("btnCompose").style.display = "flex";
    if (canModerateNews() || isAdminUser()) await cleanupExpiredPosts();
    await loadFeed();
  } catch(e){
    gate.textContent = "حدث خطأ أثناء التحقق: " + (e.message || e.code);
  }
});

async function loadNewsSettings(){
  try{
    const snap = await db.collection("meta").doc("newsSettings").get();
    if (snap.exists && typeof snap.data().dailyLimitPerUser === "number"){
      dailyLimit = snap.data().dailyLimitPerUser;
    }
  }catch(e){ /* يبقى الافتراضي 2 عند أي خطأ */ }
}

// حذف فعلي للأخبار المنتهية عند دخول من يملك صلاحية الاعتماد
async function cleanupExpiredPosts(){
  try{
    const now = firebase.firestore.Timestamp.now();
    const snap = await db.collection("posts").where("expiresAt","<=", now).get();
    const batch = db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    if (!snap.empty) await batch.commit();
  }catch(e){ console.warn("تعذّر تنظيف الأخبار المنتهية:", e); }
}

// ============ تحميل وعرض الخلاصة ============
async function loadFeed(){
  const feed = document.getElementById("feed");
  feed.innerHTML = `<div class="empty">جارٍ التحميل...</div>`;

  const uid = window.authUser.uid;
  const moderator = canModerateNews();
  let posts = [];

  if (moderator){
    const snap = await db.collection("posts").orderBy("createdAt","desc").get();
    posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    posts.sort((a,b)=> (a.status==="pending"?-1:0) - (b.status==="pending"?-1:0));
  } else {
    const [pubSnap, mineSnap] = await Promise.all([
      db.collection("posts").where("status","==","published").orderBy("createdAt","desc").get(),
      db.collection("posts").where("authorId","==", uid).get()
    ]);
    const map = new Map();
    pubSnap.forEach(d => map.set(d.id, { id:d.id, ...d.data() }));
    mineSnap.forEach(d => map.set(d.id, { id:d.id, ...d.data() }));
    posts = [...map.values()].sort((a,b)=> (b.createdAt?.toMillis()||0) - (a.createdAt?.toMillis()||0));
  }

  // إخفاء أي خبر منتهي الصلاحية من العرض فورًا (حتى قبل حذفه الفعلي لاحقًا)
  const now = Date.now();
  posts = posts.filter(p => !p.expiresAt || p.expiresAt.toMillis() > now);

  feed.innerHTML = "";
  if (posts.length === 0){
    feed.innerHTML = `<div class="empty">لا توجد أخبار حاليًا</div>`;
    return;
  }
  if (moderator){
    feed.insertAdjacentHTML("beforeend", `<div class="section-label">كل الأخبار — غير المعتمد يظهر أولًا</div>`);
  }

  for (const p of posts){
    const updatesSnap = await db.collection("posts").doc(p.id).collection("updates").orderBy("createdAt","asc").get();
    let updates = updatesSnap.docs.map(d => ({ id:d.id, ...d.data() }));
    if (!moderator){
      updates = updates.filter(u => u.status === "published" || u.authorId === uid);
    }
    const showMain = moderator || p.status === "published" || p.authorId === uid;
    if (!showMain && updates.length === 0) continue;

    let html = `<div class="thread">`;
    const items = [];
    if (showMain) items.push({ postId:p.id, updateId:null, ...p });
    updates.forEach(u => items.push({ postId:p.id, updateId:u.id, ...u }));

    items.forEach((item, idx)=>{
      html += renderPostCard(item, moderator);
      if (idx < items.length-1) html += `<div class="connector-gap"><div class="connector-line"></div></div>`;
    });
    html += `</div>`;
    feed.insertAdjacentHTML("beforeend", html);
  }

  feed.insertAdjacentHTML("beforeend", `<div class="empty" style="padding:20px;font-size:11px;">-- نهاية الأخبار --</div>`);
  wireCardActions();
}

function statusLabelAr(s){
  return { published:"منشور", pending:"بانتظار اعتماد", hidden:"مخفي" }[s] || s;
}

function renderPostCard(item, moderator){
  const isUpdate = !!item.updateId;
  const idLabel = isUpdate ? `${item.postId.slice(0,5)}…-تحديث` : item.postId.slice(0,6)+"…";
  const canManageThis = moderator; // الإخفاء/الاعتماد/الحذف: للمفوَّض/الأدمن فقط
  const canAddUpdate = !isUpdate && (moderator || item.authorId === window.authUser.uid);

  return `
  <div class="post-card" data-post="${item.postId}" data-update="${item.updateId||''}" data-status="${item.status}">
    <div class="post-inner">
      <div class="post-head-row">
        <div class="rail"><div class="avatar"><img src="${avatarUrl(item.authorName)}" alt=""></div></div>
        <div class="post-head">
          ${moderator ? `<b>${escapeHtml(item.authorName||'')}</b>` : ''}
          <span class="id-tag">#${idLabel}</span>
          <span class="dot">·</span>
          <span class="time">${fmtDate(item.createdAt)}</span>
          ${moderator ? `<span class="badge ${item.status}">${statusLabelAr(item.status)}</span>` : ''}
        </div>
      </div>
      <div class="post-body">
        ${!isUpdate && item.title ? `<div class="post-title">${escapeHtml(item.title)}</div>` : ''}
        <div class="post-text">${linkifyPhones(item.text||'')}</div>
        ${item.imageUrl ? `<img class="post-img" src="${item.imageUrl}">` : ''}
      </div>
      <div class="post-actions">
        ${canAddUpdate ? `<button class="icon-btn btn-add-update" title="إضافة تحديث"><span class="ic">💬</span></button>` : ''}
        <button class="icon-btn btn-share" data-title="${escapeHtml(item.title||'')}" data-text="${escapeHtml(item.text||'')}" title="مشاركة">
          <span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></span>
        </button>
        ${canManageThis ? `
          <button class="icon-btn approve btn-approve" title="${item.status==='pending'?'اعتماد':'منشور'}" ${item.status==='published'?'disabled':''}><span class="ic">✔️</span></button>
          <button class="icon-btn btn-hide" title="${item.status==='hidden'?'إظهار':'إخفاء'}"><span class="ic">👁️‍🗨️</span></button>
          <button class="icon-btn delete btn-delete" title="حذف"><span class="ic">❌</span></button>
        ` : ''}
      </div>
    </div>
  </div>`;
}

// ============ ربط أزرار البطاقات (تفويض أحداث) ============
function wireCardActions(){
  document.querySelectorAll(".btn-share").forEach(btn=>{
    btn.onclick = ()=>{
      const title = btn.dataset.title, text = btn.dataset.text;
      if (navigator.share){
        navigator.share({ title: title || "خبر من موقع بني أسمل الحكمي", text }).catch(()=>{});
      } else {
        navigator.clipboard.writeText((title?title+"\n":"")+text).then(()=>{
          customAlert("تم نسخ نص الخبر — يمكنك لصقه بأي تطبيق.");
        });
      }
    };
  });

  document.querySelectorAll(".btn-add-update").forEach(btn=>{
    btn.onclick = ()=>{
      const card = btn.closest(".post-card");
      openUpdateComposer(card.dataset.post);
    };
  });

  document.querySelectorAll(".btn-approve").forEach(btn=>{
    btn.onclick = ()=> handleModeration(btn, "approve");
  });
  document.querySelectorAll(".btn-hide").forEach(btn=>{
    btn.onclick = ()=> handleModeration(btn, "hide");
  });
  document.querySelectorAll(".btn-delete").forEach(btn=>{
    btn.onclick = ()=> handleModeration(btn, "delete");
  });
}

function docRefFor(card){
  const postId = card.dataset.post, updateId = card.dataset.update;
  return updateId ? db.collection("posts").doc(postId).collection("updates").doc(updateId)
                  : db.collection("posts").doc(postId);
}

async function handleModeration(btn, action){
  const card = btn.closest(".post-card");
  const ref = docRefFor(card);
  const currentStatus = card.dataset.status;
  try{
    if (action === "approve"){
      await ref.update({ status: "published" });
    } else if (action === "hide"){
      await ref.update({ status: currentStatus === "hidden" ? "published" : "hidden" });
    } else if (action === "delete"){
      if (!confirm("تأكيد الحذف؟ لا يمكن التراجع.")) return;
      await ref.delete();
    }
    await loadFeed();
  }catch(e){
    customAlert("تعذّر تنفيذ العملية: " + (e.message || e.code));
  }
}

// ============ الحد اليومي للكتابة ============
async function checkAndIncrementDailyCount(){
  const uid = window.authUser.uid;
  const ref = db.collection("users").doc(uid).collection("dailyCounts").doc(todayKey());
  return db.runTransaction(async (tx)=>{
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data().count || 0) : 0;
    if (current >= dailyLimit) throw new Error(`وصلت الحد اليومي للكتابة (${dailyLimit} أخبار/تحديثات في اليوم). حاول غدًا.`);
    tx.set(ref, { count: current + 1 }, { merge: true });
    return true;
  });
}

// ============ فورم كتابة خبر جديد ============
document.getElementById("btnCompose").onclick = ()=> openComposer();

function openComposer(){
  const backdrop = document.getElementById("composerBackdrop");
  const box = document.getElementById("composer");
  uploadedImg = null;
  box.innerHTML = `
    <div class="composer">
      <h3>✏️ كتابة خبر جديد</h3>
      <div class="limit-note">الحد اليومي: ${dailyLimit} خبر/تحديث لكل مستخدم.</div>
      <div class="field">
        <label>العنوان</label>
        <input type="text" id="fTitle" placeholder="عنوان الخبر">
      </div>
      <div class="field">
        <label>نص الخبر</label>
        <div class="compose-toolbar">
          <button type="button" id="tbImage">🖼️ إدراج صورة</button>
          <button type="button" id="tbLink">🔗 إدراج رابط</button>
        </div>
        <textarea id="fText" placeholder="اكتب نص الخبر هنا..."></textarea>
      </div>
      <div class="field">
        <label>صورة (اختياري)</label>
        <div class="img-upload">📷 اضغط لاختيار صورة<input type="file" id="fImg" accept="image/*"></div>
        <img id="imgPrev" class="img-preview">
      </div>
      <div class="field">
        <label>تاريخ الحذف (اختياري — يبقى للأبد إن تُرك فارغًا)</label>
        <input type="date" id="fExpiry">
      </div>
      <button class="submit-btn" id="fSubmit">${hasNewsAutoPublish() ? "نشر مباشرة" : "إرسال للاعتماد"}</button>
      <button class="close-composer" id="fCancel">إلغاء</button>
    </div>
    <div class="preview-label">👁️ معاينة حية</div>
    <div id="livePreview"></div>
  `;
  backdrop.classList.add("show");

  const fTitle = document.getElementById("fTitle");
  const fText = document.getElementById("fText");
  const fImg = document.getElementById("fImg");
  const imgPrev = document.getElementById("imgPrev");
  const fSubmit = document.getElementById("fSubmit");

  function updatePreview(){
    document.getElementById("livePreview").innerHTML = renderPostCard({
      postId: "preview", updateId: null,
      authorId: window.authUser.uid, authorName: window.authUser.displayName,
      title: fTitle.value || "عنوان الخبر", text: fText.value || "نص الخبر سيظهر هنا...",
      imageUrl: uploadedImg, createdAt: firebase.firestore.Timestamp.now(),
      status: hasNewsAutoPublish() ? "published" : "pending"
    }, true);
  }

  fTitle.addEventListener("input", updatePreview);
  fText.addEventListener("input", updatePreview);
  document.getElementById("tbImage").onclick = ()=> fImg.click();
  document.getElementById("tbLink").onclick = ()=>{
    const url = prompt("الصق الرابط هنا:");
    if (!url) return;
    const start = fText.selectionStart, end = fText.selectionEnd;
    fText.value = fText.value.slice(0,start) + url + fText.value.slice(end);
    fText.focus();
    updatePreview();
  };
  fImg.addEventListener("change", async (e)=>{
    const file = e.target.files[0];
    if (!file) return;
    uploadedImg = await compressImage(file);
    imgPrev.src = uploadedImg;
    imgPrev.style.display = "block";
    updatePreview();
  });
  document.getElementById("fCancel").onclick = closeComposer;

  fSubmit.onclick = async ()=>{
    const title = fTitle.value.trim(), text = fText.value.trim();
    if (!title || !text){ customAlert("العنوان ونص الخبر إلزاميان."); return; }
    fSubmit.disabled = true;
    try{
      await checkAndIncrementDailyCount();
      const expiryVal = document.getElementById("fExpiry").value;
      const status = hasNewsAutoPublish() ? "published" : "pending";
      await db.collection("posts").add({
        title, text,
        imageUrl: uploadedImg || null,
        authorId: window.authUser.uid,
        authorName: window.authUser.displayName,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        status,
        expiresAt: expiryVal ? firebase.firestore.Timestamp.fromDate(new Date(expiryVal + "T23:59:59")) : null
      });
      customAlert(status === "published" ? "تم نشر الخبر." : "تم إرسال الخبر — بانتظار اعتماد الأدمن.");
      closeComposer();
      await loadFeed();
    }catch(e){
      customAlert("تعذّر النشر: " + (e.message || e.code));
      fSubmit.disabled = false;
    }
  };

  updatePreview();
}

function closeComposer(){
  document.getElementById("composerBackdrop").classList.remove("show");
}
document.getElementById("composerBackdrop").addEventListener("click", (e)=>{
  if (e.target.id === "composerBackdrop") closeComposer();
});

// ============ فورم إضافة تحديث لخبر موجود ============
function openUpdateComposer(postId){
  const backdrop = document.getElementById("composerBackdrop");
  const box = document.getElementById("composer");
  uploadedImg = null;
  box.innerHTML = `
    <div class="composer">
      <h3>💬 إضافة تحديث</h3>
      <div class="limit-note">الحد اليومي: ${dailyLimit} خبر/تحديث لكل مستخدم.</div>
      <div class="field">
        <label>نص التحديث</label>
        <textarea id="uText" placeholder="مثال: خرج بحمد الله من المستشفى..."></textarea>
      </div>
      <div class="field">
        <label>صورة (اختياري)</label>
        <div class="img-upload">📷 اضغط لاختيار صورة<input type="file" id="uImg" accept="image/*"></div>
        <img id="uImgPrev" class="img-preview">
      </div>
      <button class="submit-btn" id="uSubmit">${hasNewsAutoPublish() ? "نشر مباشرة" : "إرسال للاعتماد"}</button>
      <button class="close-composer" id="uCancel">إلغاء</button>
    </div>
  `;
  backdrop.classList.add("show");

  const uImg = document.getElementById("uImg");
  const uImgPrev = document.getElementById("uImgPrev");
  uImg.addEventListener("change", async (e)=>{
    const file = e.target.files[0];
    if (!file) return;
    uploadedImg = await compressImage(file);
    uImgPrev.src = uploadedImg;
    uImgPrev.style.display = "block";
  });
  document.getElementById("uCancel").onclick = closeComposer;

  document.getElementById("uSubmit").onclick = async ()=>{
    const text = document.getElementById("uText").value.trim();
    if (!text){ customAlert("نص التحديث إلزامي."); return; }
    try{
      await checkAndIncrementDailyCount();
      const status = hasNewsAutoPublish() ? "published" : "pending";
      await db.collection("posts").doc(postId).collection("updates").add({
        text, imageUrl: uploadedImg || null,
        authorId: window.authUser.uid,
        authorName: window.authUser.displayName,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        status
      });
      customAlert(status === "published" ? "تم نشر التحديث." : "تم إرسال التحديث — بانتظار الاعتماد.");
      closeComposer();
      await loadFeed();
    }catch(e){
      customAlert("تعذّر الإرسال: " + (e.message || e.code));
    }
  };
}
