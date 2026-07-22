
// ============ توليد رابط صورة QR لأي شخص (يحمل رابط ملفه الحقيقي داخله) ============
// ===== QR FEATURE START (معزول — احذف بأمان لإلغاء كل ميزات QR) =====
function qrImageUrl(personIdStr, size){
  const targetUrl = location.origin + location.pathname.replace(/[^/]*$/, "") + "index.html?viewInfo=" + encodeURIComponent(personIdStr);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size || 200}x${size || 200}&data=${encodeURIComponent(targetUrl)}`;
}
// يحمّل صورة QR فعليًا كـ dataURL محلي (وليس رابطًا خارجيًا) — ضروري لأن المتصفحات
// تمنع تضمين صور خارجية (Cross-Origin) داخل canvas/SVG يُرسَم كصورة، وتتجاهل
// خاصية التنزيل لأي رابط خارجي مباشر. يُعيد null بهدوء لو فشل التحميل (بلا اتصال مثلًا).
async function fetchQrDataUrl(personIdStr, size){
  try{
    const res = await fetch(qrImageUrl(personIdStr, size));
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }catch(e){ console.warn("تعذّر تحميل صورة QR:", e); return null; }
}

// هل عقدة node تساوي ancestorCandidate أو أحد ذريته؟ (بالمشي صعودًا من node)
function _isDescendantOrSelf(node, ancestorCandidate){
  let t = node;
  while (t){ if (t === ancestorCandidate) return true; t = t.parent; }
  return false;
}

// هل يملك المستخدم الحالي صلاحية مشاركة بطاقة targetNode؟ (أدمن يتجاوز دومًا)
function canShareThisCard(targetNode){
  if (isAdminUser()) return true;
  const u = window.authUser;
  if (!u || u.isGuest || !u.scopePersonId || !targetNode) return false;
  if (can("share", "all")) return true;
  const myNode = root.descendants().find(n => n.data.id === u.scopePersonId);
  if (!myNode) return false;
  if (can("share", "myNode")){
    return _isDescendantOrSelf(targetNode, myNode) || _isDescendantOrSelf(myNode, targetNode);
  }
  if (can("share", "myCard")){
    return _isDescendantOrSelf(targetNode, myNode);
  }
  return false;
}

// نافذة بسيطة تعرض رمز QR بحجم أكبر + زر تنزيله كصورة
async function openQrViewModal(node){
  if (!node) return;
  const pid = node.data.id;
  let modal = document.getElementById("qrViewModal");
  if (!modal){
    modal = document.createElement("div");
    modal.id = "qrViewModal";
    modal.style.cssText = "position:fixed; inset:0; z-index:9600; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center;";
    modal.innerHTML = `<div style="background:#FFFDF6; border-radius:18px; padding:22px; text-align:center; max-width:88vw;">
        <img id="qrViewImg" style="width:220px; height:220px; border-radius:10px; border:1.5px solid #E6D9B8; background:#f5f5f5;">
        <div style="margin-top:14px; display:flex; gap:10px; justify-content:center;">
          <a id="qrDownloadLink" download="qr.png" style="background:linear-gradient(135deg,#8B4A1E,#5c2f10); color:#fff; text-decoration:none; padding:9px 18px; border-radius:12px; font-family:'Tajawal',sans-serif; font-size:13px; font-weight:700;">⬇️ تنزيل</a>
          <button id="qrCloseBtn" style="background:#F1E9D8; border:none; padding:9px 18px; border-radius:12px; font-family:'Tajawal',sans-serif; font-size:13px; cursor:pointer;">إغلاق</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
    modal.querySelector("#qrCloseBtn").onclick = () => { modal.style.display = "none"; };
  }
  modal.style.display = "flex";
  const dataUrl = await fetchQrDataUrl(pid, 400); // حجم أكبر من العرض لضمان وضوح كافٍ عند المسح
  if (dataUrl){
    modal.querySelector("#qrViewImg").src = dataUrl;
    modal.querySelector("#qrDownloadLink").href = dataUrl;
  } else {
    customAlert("تعذّر تحميل رمز QR — تحقّق من اتصالك بالإنترنت.");
  }
}

// يبني صورة (canvas) شاملة لمشاركتها عبر واتساب — بنفس بيانات البطاقة المعروضة حاليًا
async function buildShareableCardCanvas(){
  const sd = window._shareCardData;
  if (!sd) return null;
  const { node, data, sonNames, uncleNames, pUncleNames, sadahaList, bio, photo } = sd;
  const fiveName = chainNames(node).slice(0, 5).join(" ");
  const fullChain = chainNames(node).join(" بن ");
  const qrDataUrl = await fetchQrDataUrl(node.data.id, 400);

  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  function measureW(text, size, weight){ mctx.font = `${weight||400} ${size}px Tajawal, sans-serif`; return mctx.measureText(text).width; }
  function wrapW(text, maxWidth, size){
    const words = String(text).split(/\s+/); const out = []; let cur = "";
    words.forEach(w => { const t = cur ? cur+" "+w : w; if (measureW(t,size) > maxWidth && cur){ out.push(cur); cur = w; } else cur = t; });
    if (cur) out.push(cur);
    return out.length ? out : [""];
  }

  const W = 360, margin = 18;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  const style = document.createElementNS(svgNS, "style");
  style.textContent = "text{font-family:'Tajawal',sans-serif;}";
  svg.appendChild(style);
  const uid = Math.random().toString(36).slice(2);

  function addText(x, yy, txt, size, weight, color, anchor){
    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", x); t.setAttribute("y", yy); t.setAttribute("font-size", size);
    t.setAttribute("font-weight", weight||400); t.setAttribute("fill", color); t.setAttribute("text-anchor", anchor||"end");
    t.textContent = txt; svg.appendChild(t);
    return t;
  }
  function addRect(x, yy, w, h, fill, rx){
    const r = document.createElementNS(svgNS, "rect");
    r.setAttribute("x", x); r.setAttribute("y", yy); r.setAttribute("width", w); r.setAttribute("height", h);
    r.setAttribute("fill", fill); if (rx) r.setAttribute("rx", rx);
    svg.appendChild(r);
    return r;
  }

  // ---------- حساب الارتفاع الكلي مسبقًا (نفس أسلوب تصدير PDF: قياس دقيق قبل الرسم) ----------
  const HEADER_H = 108, QR_ROW_H = qrDataUrl ? 92 : 0;
  const rowH = 19, fieldGap = 6, sectionTitleH = 26;
  const contentW = W - margin*2;

  const basicFields = [];
  basicFields.push({ label: "الحالة", value: data.deathStatus === "dead" ? "متوفى" : "حي يرزق" });
  basicFields.push({ label: "عدد الأبناء بالمشجرة", value: String((node.children||[]).filter(c=>c.data.type!=="female").length) });
  if (sonNames.length) basicFields.push({ label: "أسماء الأبناء", value: sonNames.join("، ") });
  if (uncleNames.length) basicFields.push({ label: "الأخوال", value: uncleNames.join("، ") });
  if (pUncleNames.length) basicFields.push({ label: "الأعمام", value: pUncleNames.join("، ") });
  const basicWrapped = basicFields.map(f => ({ label: f.label, lines: wrapW(f.value, contentW, 12.5) }));
  let basicH = 0;
  basicWrapped.forEach(f => { basicH += 19 + f.lines.length*rowH + fieldGap; });

  const sadahaWrapped = (sadahaList||[]).map(s => {
    const line = `${s.label}: ${s.name}${s.relSuffix ? " " + s.relSuffix : ""}`;
    return { lines: wrapW(line, contentW - 20, 12), relSuffix: s.relSuffix };
  });
  let sadahaH = sadahaWrapped.length ? sectionTitleH : 0;
  sadahaWrapped.forEach(s => { sadahaH += s.lines.length*17 + 14 + 6; });

  let bioH = 0;
  let bioLines = [];
  if (bio){
    bioLines = wrapW(bio.replace(/\n/g, " "), contentW, 11.5).slice(0, 3);
    bioH = sectionTitleH + bioLines.length*17 + 18;
  }

  const H = HEADER_H + QR_ROW_H + 16 + basicH + sadahaH + bioH + 40;

  svg.setAttribute("xmlns", svgNS);
  svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("width", W); bg.setAttribute("height", H); bg.setAttribute("rx", 18); bg.setAttribute("fill", "#FFFDF6");
  bg.setAttribute("stroke", "#B8860B"); bg.setAttribute("stroke-width", 1.8);
  svg.appendChild(bg);

  // ---------- الهيدر (تدرّج أخضر + صورة/رمز دائري + الاسم والسلسلة) ----------
  const defs = document.createElementNS(svgNS, "defs");
  const grad = document.createElementNS(svgNS, "linearGradient"); grad.setAttribute("id", "hgrad"+uid);
  grad.setAttribute("x1","0"); grad.setAttribute("y1","0"); grad.setAttribute("x2","1"); grad.setAttribute("y2","1");
  const gs1 = document.createElementNS(svgNS, "stop"); gs1.setAttribute("offset","0"); gs1.setAttribute("stop-color","#0B3D2E");
  const gs2 = document.createElementNS(svgNS, "stop"); gs2.setAttribute("offset","1"); gs2.setAttribute("stop-color","#12503C");
  grad.appendChild(gs1); grad.appendChild(gs2); defs.appendChild(grad); svg.appendChild(defs);

  const clip = document.createElementNS(svgNS, "clipPath"); clip.setAttribute("id", "hc"+uid);
  const clipPath = document.createElementNS(svgNS, "path");
  clipPath.setAttribute("d", `M0,0 H${W} V${HEADER_H-16} Q${W},${HEADER_H} ${W-16},${HEADER_H} H16 Q0,${HEADER_H} 0,${HEADER_H-16} Z`);
  clip.appendChild(clipPath); svg.appendChild(clip);
  const hbg = document.createElementNS(svgNS, "rect");
  hbg.setAttribute("width", W); hbg.setAttribute("height", HEADER_H); hbg.setAttribute("fill", `url(#hgrad${uid})`); hbg.setAttribute("clip-path", `url(#hc${uid})`);
  svg.appendChild(hbg);
  addRect(0, HEADER_H-3, W, 3, "#C9A227");

  const avR = 30, avCx = W - margin - avR, avCy = 44;
  if (photo){
    const pclip = document.createElementNS(svgNS, "clipPath"); pclip.setAttribute("id", "pc"+uid);
    const pcirc = document.createElementNS(svgNS, "circle");
    pcirc.setAttribute("cx", avCx); pcirc.setAttribute("cy", avCy); pcirc.setAttribute("r", avR);
    pclip.appendChild(pcirc); svg.appendChild(pclip);
    const img = document.createElementNS(svgNS, "image");
    img.setAttributeNS("http://www.w3.org/1999/xlink", "href", photo);
    img.setAttribute("x", avCx-avR); img.setAttribute("y", avCy-avR); img.setAttribute("width", avR*2); img.setAttribute("height", avR*2);
    img.setAttribute("clip-path", `url(#pc${uid})`); img.setAttribute("preserveAspectRatio", "xMidYMid slice");
    svg.appendChild(img);
  } else {
    const pcirc = document.createElementNS(svgNS, "circle");
    pcirc.setAttribute("cx", avCx); pcirc.setAttribute("cy", avCy); pcirc.setAttribute("r", avR); pcirc.setAttribute("fill", "#174d3a");
    svg.appendChild(pcirc);
    addText(avCx, avCy+7, "🌳", 22, 400, "#C9A227", "middle");
  }
  const ring = document.createElementNS(svgNS, "circle");
  ring.setAttribute("cx", avCx); ring.setAttribute("cy", avCy); ring.setAttribute("r", avR);
  ring.setAttribute("fill", "none"); ring.setAttribute("stroke", "#C9A227"); ring.setAttribute("stroke-width", 1.8);
  svg.appendChild(ring);

  const nameWrapped = wrapW(fiveName, W - margin*2 - avR*2 - 16, 20);
  let ny = 40;
  nameWrapped.slice(0,2).forEach(l => { addText(margin, ny, l, 20, 700, "#fff", "start"); ny += 24; });
  const chainWrapped = wrapW(fullChain, W - margin*2 - avR*2 - 16, 9.5);
  let cy = ny + 4;
  chainWrapped.slice(0, 2).forEach(l => { addText(margin, cy, l, 9.5, 400, "#cfe6da", "start"); cy += 12; });

  // ---------- صف QR (إن توفّر) ----------
  let y = HEADER_H + 14;
  let qrX = 0, qrY = 0, qrSize = 0;
  if (qrDataUrl){
    addRect(margin, y, contentW, QR_ROW_H - 10, "#F5EFDD", 12);
    qrSize = QR_ROW_H - 26;
    qrX = W - margin - 8 - qrSize; qrY = y + 8;
    addText(W - margin - 20 - qrSize, y + QR_ROW_H/2 - 16, "امسح الرمز", 12.5, 700, "#0B3D2E", "end");
    addText(W - margin - 20 - qrSize, y + QR_ROW_H/2 + 2, "لفتح ملفه الحي بالموقع", 10.5, 400, "#6b5c3a", "end");
    y += QR_ROW_H;
  }

  // ---------- عنوان قسم مزخرف بخطين جانبيين (نفس أسلوب تصدير PDF) ----------
  function drawSectionTitle(text){
    const tw = measureW(text, 13, 700);
    addText(W/2, y, text, 13, 700, "#0B3D2E", "middle");
    [[margin, W/2 - tw/2 - 10], [W/2 + tw/2 + 10, W - margin]].forEach(([x1,x2]) => {
      if (x2 > x1){
        const ln = document.createElementNS(svgNS, "line");
        ln.setAttribute("x1", x1); ln.setAttribute("x2", x2); ln.setAttribute("y1", y-4); ln.setAttribute("y2", y-4); ln.setAttribute("stroke", "#E6D9B8");
        svg.appendChild(ln);
      }
    });
    y += sectionTitleH;
  }

  // ---------- الحقول الأساسية ----------
  basicWrapped.forEach(f => {
    addText(W-margin, y, f.label + ":", 12, 700, "#8B4A1E", "end");
    y += 19;
    f.lines.forEach(l => { addText(W-margin, y, l, 12.5, 400, "#222"); y += rowH; });
    y += fieldGap;
  });

  // ---------- الأصهار (بطاقات صغيرة، مطابقة لشكل الموقع الحقيقي) ----------
  if (sadahaWrapped.length){
    drawSectionTitle("الأصهار");
    sadahaWrapped.forEach(s => {
      const itemH = s.lines.length*17 + 14;
      addRect(margin, y, contentW, itemH, "#F7F2E2", 9);
      let ly = y + 17;
      s.lines.forEach((l, i) => { addText(W-margin-8, ly, l, 12, 400, "#333"); ly += 17; });
      y += itemH + 6;
    });
  }

  // ---------- النبذة التاريخية (3 أسطر كحد أقصى) ----------
  if (bio){
    drawSectionTitle("النبذة التاريخية");
    bioLines.forEach(l => { addText(W-margin, y, l, 11.5, 400, "#444"); y += 17; });
    y += 4;
    addText(W/2, y, "↓ بقية التفاصيل بالموقع", 10.5, 700, "#8B4A1E", "middle");
    y += 14;
  }

  // ---------- التذييل ----------
  addRect(0, H-24, W, 24, "#F5EFDD");
  const footerLine = document.createElementNS(svgNS, "line");
  footerLine.setAttribute("x1",0); footerLine.setAttribute("x2",W); footerLine.setAttribute("y1",H-24); footerLine.setAttribute("y2",H-24); footerLine.setAttribute("stroke","#D8C9A3"); footerLine.setAttribute("stroke-dasharray","3,3");
  svg.appendChild(footerLine);
  addText(W/2, H-8, "🌳 شجرة بني أسمل الحكمي", 10.5, 700, "#8a7550", "middle");

  const svgText = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = W*scale; canvas.height = H*scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      if (qrDataUrl && qrSize){
        const qrImgEl = new Image();
        qrImgEl.onload = () => {
          ctx.imageSmoothingEnabled = false; // حاسم: يمنع تنعيم الحواف الذي يُفسد وضوح مربعات QR
          ctx.drawImage(qrImgEl, qrX, qrY, qrSize, qrSize);
          canvas.toBlob((b) => resolve({ blob: b, fiveName }), "image/png");
        };
        qrImgEl.src = qrDataUrl;
      } else {
        canvas.toBlob((b) => resolve({ blob: b, fiveName }), "image/png");
      }
    };
    img.src = url;
  });
}

async function shareCardViaWhatsapp(){
  const result = await buildShareableCardCanvas();
  if (!result || !result.blob){ customAlert("تعذّر تجهيز الصورة."); return; }
  const file = new File([result.blob], `${result.fiveName}.png`, { type: "image/png" });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })){
    try{
      await navigator.share({ files: [file], title: result.fiveName });
    }catch(e){ /* المستخدم ألغى المشاركة — لا حاجة لأي رسالة */ }
  } else {
    // لا تتوفر مشاركة الملفات بهذا المتصفح — نزّل الصورة بدلًا من ذلك
    const a = document.createElement("a");
    a.href = URL.createObjectURL(result.blob);
    a.download = `${result.fiveName}.png`;
    a.click();
    customAlert("مشاركة الصور غير مدعومة بهذا المتصفح — تم تنزيل الصورة بدلًا من ذلك، يمكنك إرسالها يدويًا.");
  }
}
// ===== QR FEATURE END =====

// ===== WALLET CARD FEATURE START (معزول — احذف بأمان لإلغاء الميزة) =====
async function buildWalletCardImage(node){
  const W = 380, H = 232, margin = 20;
  const fiveName = chainNames(node).slice(0, 5).join(" ");
  const parts = fiveName.split(" ");
  const line1 = parts.slice(0, 3).join(" ");
  const line2 = parts.slice(3).join(" ");
  const qrDataUrl = await fetchQrDataUrl(node.data.id, 400); // دقة عالية؛ تُرسَم لاحقًا بحجمها الحقيقي بلا تصغير يُفسد الوضوح

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("xmlns", svgNS); svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const style = document.createElementNS(svgNS, "style"); style.textContent = "text{font-family:'Tajawal',sans-serif;}"; svg.appendChild(style);

  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("width", W); bg.setAttribute("height", H); bg.setAttribute("rx", 16); bg.setAttribute("fill", "#FFFDF6");
  bg.setAttribute("stroke", "#C9A227"); bg.setAttribute("stroke-width", 2.2);
  svg.appendChild(bg);

  const uid = Math.random().toString(36).slice(2);
  const HEADER_H = 56;
  const defs = document.createElementNS(svgNS, "defs");
  const grad = document.createElementNS(svgNS, "linearGradient"); grad.setAttribute("id", "wcgrad"+uid);
  grad.setAttribute("x1","0"); grad.setAttribute("y1","0"); grad.setAttribute("x2","1"); grad.setAttribute("y2","1");
  const s1 = document.createElementNS(svgNS, "stop"); s1.setAttribute("offset","0"); s1.setAttribute("stop-color","#0B3D2E");
  const s2 = document.createElementNS(svgNS, "stop"); s2.setAttribute("offset","1"); s2.setAttribute("stop-color","#12503C");
  grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad); svg.appendChild(defs);
  const clip = document.createElementNS(svgNS, "clipPath"); clip.setAttribute("id", "wc"+uid);
  const clipPath = document.createElementNS(svgNS, "path");
  clipPath.setAttribute("d", `M0,0 H${W} V${HEADER_H-16} Q${W},${HEADER_H} ${W-16},${HEADER_H} H16 Q0,${HEADER_H} 0,${HEADER_H-16} Z`);
  clip.appendChild(clipPath); svg.appendChild(clip);
  const hbg = document.createElementNS(svgNS, "rect");
  hbg.setAttribute("width", W); hbg.setAttribute("height", HEADER_H); hbg.setAttribute("fill", "url(#wcgrad"+uid+")"); hbg.setAttribute("clip-path", `url(#wc${uid})`);
  svg.appendChild(hbg);
  const hline = document.createElementNS(svgNS, "rect");
  hline.setAttribute("x",0); hline.setAttribute("y",HEADER_H-3); hline.setAttribute("width",W); hline.setAttribute("height",3); hline.setAttribute("fill","#C9A227");
  svg.appendChild(hline);

  function addText(x, yy, txt, size, weight, color, anchor){
    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", x); t.setAttribute("y", yy); t.setAttribute("font-size", size);
    t.setAttribute("font-weight", weight||400); t.setAttribute("fill", color); t.setAttribute("text-anchor", anchor||"end");
    t.textContent = txt; svg.appendChild(t);
  }
  addText(margin, 32, "🌳 شجرة بني أسمل الحكمي", 12.5, 700, "#fff", "start");
  addText(W-margin, 36, "بطاقة نسب", 10.5, 400, "#cfe6da", "end");

  addText(W-margin, 104, "الاسم الكامل", 9, 700, "#a8925a", "end");
  addText(W-margin, 132, line1, 20, 700, "#0B3D2E", "end");
  if (line2) addText(W-margin, 154, line2, 14.5, 400, "#6b5c3a", "end");
  const sepLine = document.createElementNS(svgNS, "line");
  sepLine.setAttribute("x1", margin); sepLine.setAttribute("x2", W-margin-108); sepLine.setAttribute("y1", 170); sepLine.setAttribute("y2", 170);
  sepLine.setAttribute("stroke", "#E6D9B8");
  svg.appendChild(sepLine);

  // مكان القرص الأبيض خلف QR فقط (الرمز نفسه يُرسم لاحقًا مباشرة على الـcanvas النهائي)
  const qrSize = 96, qrX = margin, qrY = 84;
  if (qrDataUrl){
    const qrBg = document.createElementNS(svgNS, "rect");
    qrBg.setAttribute("x", qrX-5); qrBg.setAttribute("y", qrY-5); qrBg.setAttribute("width", qrSize+10); qrBg.setAttribute("height", qrSize+10);
    qrBg.setAttribute("fill", "#fff"); qrBg.setAttribute("rx", 8); qrBg.setAttribute("stroke", "#E6D9B8");
    svg.appendChild(qrBg);
  }

  const footerLine = document.createElementNS(svgNS, "rect");
  footerLine.setAttribute("x",0); footerLine.setAttribute("y",H-14); footerLine.setAttribute("width",W); footerLine.setAttribute("height",14); footerLine.setAttribute("fill","#F5EFDD");
  svg.appendChild(footerLine);

  const svgText = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = 3;
      const canvas = document.createElement("canvas");
      canvas.width = W*scale; canvas.height = H*scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      if (qrDataUrl){
        const qrImgEl = new Image();
        qrImgEl.onload = () => {
          ctx.imageSmoothingEnabled = false; // حاسم: يمنع تنعيم الحواف الذي يُفسد وضوح مربعات QR
          ctx.drawImage(qrImgEl, qrX, qrY, qrSize, qrSize);
          resolve({ dataUrl: canvas.toDataURL("image/png"), fiveName });
        };
        qrImgEl.src = qrDataUrl;
      } else {
        resolve({ dataUrl: canvas.toDataURL("image/png"), fiveName });
      }
    };
    img.src = url;
  });
}

async function toggleWalletCard(){
  let modal = document.getElementById("walletCardModal");
  if (modal && modal.style.display === "flex"){ modal.style.display = "none"; return; }
  const u = window.authUser;
  if (!u || !u.scopePersonId) return;
  const node = root.descendants().find(n => n.data.id === u.scopePersonId);
  if (!node) return;
  const result = await buildWalletCardImage(node);
  if (!modal){
    modal = document.createElement("div");
    modal.id = "walletCardModal";
    modal.style.cssText = "position:fixed; inset:0; z-index:9600; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; padding:20px;";
    modal.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; gap:14px;">
        <img id="walletCardImg" style="max-width:340px; width:100%; border-radius:14px; box-shadow:0 12px 30px rgba(0,0,0,.3);">
        <a id="walletDownloadLink" download="بطاقة_النسب.png" style="background:linear-gradient(135deg,#8B4A1E,#5c2f10); color:#fff; text-decoration:none; padding:10px 22px; border-radius:12px; font-family:'Tajawal',sans-serif; font-size:13.5px; font-weight:700;">⬇️ تحميل البطاقة</a>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
  }
  modal.querySelector("#walletCardImg").src = result.dataUrl;
  modal.querySelector("#walletDownloadLink").href = result.dataUrl;
  modal.querySelector("#walletDownloadLink").download = result.fiveName + ".png";
  modal.style.display = "flex";
}
document.getElementById("currentUserName").addEventListener("click", (e) => { e.stopPropagation(); toggleWalletCard(); });
{
  const _unEl = document.getElementById("currentUserName");
  _unEl.addEventListener("selectstart", (e) => e.preventDefault());
  _unEl.addEventListener("contextmenu", (e) => e.preventDefault());
}
// ===== WALLET CARD FEATURE END =====

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

// ===== SELF-REGISTER START (المرحلة 5 — معزول تمامًا، احذف هذا القسم بأمان لإلغاء الميزة) =====
let regSelectedScope = null;

document.getElementById("openRegisterLink").onclick = (e) => {
  e.preventDefault();
  document.getElementById("authOverlay").classList.add("hidden");
  document.getElementById("registerOverlay").style.display = "flex";
};
document.getElementById("closeRegisterLink").onclick = (e) => {
  e.preventDefault();
  document.getElementById("registerOverlay").style.display = "none";
  document.getElementById("authOverlay").classList.remove("hidden");
};

function showRegError(msg){ document.getElementById("regError").textContent = msg || ""; }
function setRegLoading(on){
  document.getElementById("regLoading").style.display = on ? "block" : "none";
}

// ملء قوائم التاريخ الهجري (اليوم/الشهر/السنة) — معزول، لا يمس أي كود آخر
(function fillHijriBirthDateSelects(){
  const dayEl = document.getElementById("regBirthDay");
  const monthEl = document.getElementById("regBirthMonthHijri");
  const yearEl = document.getElementById("regBirthYearHijri");
  if (!dayEl || !monthEl || !yearEl) return;
  for (let d = 1; d <= 30; d++){
    const o = document.createElement("option"); o.value = d; o.textContent = d; dayEl.appendChild(o);
  }
  const hijriMonths = ["محرم","صفر","ربيع الأول","ربيع الآخر","جمادى الأولى","جمادى الآخرة","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];
  hijriMonths.forEach((m, i) => {
    const o = document.createElement("option"); o.value = i + 1; o.textContent = m; monthEl.appendChild(o);
  });
  const currentHijriYear = 1447; // تقريبي، للنطاق فقط
  for (let y = currentHijriYear; y >= currentHijriYear - 100; y--){
    const o = document.createElement("option"); o.value = y; o.textContent = y; yearEl.appendChild(o);
  }
})();

// الخطوة الأولى: التحقق من رمز الدعوة + إنشاء حساب Firebase Auth فقط (بلا ملف مستخدم بعد)
document.getElementById("regNextBtn").onclick = async function(){
  const username = document.getElementById("regUsername").value.trim();
  const password = document.getElementById("regPassword").value;
  const phone = document.getElementById("regPhone").value.trim();
  const bDay = document.getElementById("regBirthDay").value;
  const bMonth = document.getElementById("regBirthMonthHijri").value;
  const bMonthText = bMonth ? document.getElementById("regBirthMonthHijri").selectedOptions[0].textContent : "";
  const bYear = document.getElementById("regBirthYearHijri").value;
  const birthDate = (bDay && bMonth && bYear) ? `${bDay} ${bMonthText} ${bYear}هـ` : "";
  const inviteCode = document.getElementById("regInviteCode").value.trim();

  showRegError("");
  if (!username || !password){ showRegError("أدخل اسم المستخدم وكلمة المرور"); return; }
  if (password.length < 6){ showRegError("كلمة المرور يجب أن تكون ٦ أحرف على الأقل"); return; }
  if (!phone){ showRegError("أدخل رقم الجوال"); return; }
  if (!birthDate){ showRegError("أدخل تاريخ الميلاد (اليوم والشهر والسنة)"); return; }
  if (!inviteCode){ showRegError("أدخل رمز الدعوة"); return; }

  setRegLoading(true);
  try{
    const codeSnap = await db.collection("meta").doc("registrationSettings").get();
    const realCode = codeSnap.exists ? (codeSnap.data().inviteCode || "") : "";
    if (!realCode || inviteCode !== realCode){
      setRegLoading(false);
      showRegError("رمز الدعوة غير صحيح");
      return;
    }
  }catch(e){
    setRegLoading(false);
    showRegError("تعذّر التحقق من رمز الدعوة: " + (e.message || e.code));
    return;
  }

  const email = usernameToEmail(username);
  window.__selfRegistering = true; // يمنع afterSignIn من التدخل (بنفس أسلوب __adminBootstrapping)
  try{
    await auth.createUserWithEmailAndPassword(email, password);
  }catch(err){
    window.__selfRegistering = false;
    setRegLoading(false);
    if (err.code === "auth/email-already-in-use") showRegError("اسم المستخدم هذا مستخدم بالفعل");
    else if (err.code === "auth/weak-password") showRegError("كلمة المرور ضعيفة جدًا");
    else showRegError("خطأ: " + (err.message || err.code));
    return;
  }

  // الآن أصبح موثّقًا فعليًا، فتُتاح له قراءة بيانات الشجرة للبحث عن نفسه
  try{ await loadTreeFromFirestore(); }catch(e){ console.error("تعذّر تحميل الشجرة للتسجيل:", e); }

  window.__regPendingData = { username, phone, birthDate };
  setRegLoading(false);
  document.getElementById("regStep1").style.display = "none";
  document.getElementById("regStep2").style.display = "block";
};

const regScopeInput = document.getElementById("regScopeInput");
const regScopeDropdown = document.getElementById("regScopeDropdown");
attachPersonSearch(regScopeInput, regScopeDropdown, (picked) => {
  regSelectedScope = { id: picked.id, name: picked.name, ancestorIds: picked.ancestorIds };
});
regScopeInput.addEventListener("input", () => { regSelectedScope = null; });

// الخطوة الثانية: إنشاء ملف المستخدم الفعلي بعد اختيار العقدة
document.getElementById("regFinishBtn").onclick = async function(){
  showRegError("");
  if (!regSelectedScope){ showRegError("اختر اسمك من القائمة المنسدلة (عقدة الشجرة)"); return; }
  const data = window.__regPendingData || {};
  setRegLoading(true);
  try{
    await db.collection("users").doc(auth.currentUser.uid).set({
      role: "user",
      status: "pending",
      displayName: data.username || "",
      scopePersonId: regSelectedScope.id,
      scopePersonName: regSelectedScope.name,
      phone: data.phone || "",
      birthDate: data.birthDate || "",
      perms: DEFAULT_PERMS,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }catch(e){
    setRegLoading(false);
    showRegError("تعذّر إنشاء ملف الحساب: " + (e.message || e.code));
    return;
  }

  await auth.signOut();
  window.__selfRegistering = false;
  window.__regPendingData = null;
  setRegLoading(false);
  document.getElementById("regStep1").style.display = "block";
  document.getElementById("regStep2").style.display = "none";
  document.getElementById("registerOverlay").style.display = "none";
  document.getElementById("authOverlay").classList.remove("hidden");
  showAuthError("تم التسجيل بنجاح! حسابك الآن بانتظار تفعيل المشرف.");
};
// ===== SELF-REGISTER END =====

async function afterSignIn(fbUser){
  if (window.__adminBootstrapping) return;
  if (window.__selfRegistering) return; // تسجيل ذاتي جارٍ — لا تتدخل حتى ننتهي (المرحلة 5)

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
    const isSharedGuestAccount = fbUser.email === usernameToEmail(GUEST_USERNAME);
    const msg = isSharedGuestAccount
      ? "التصفح كضيف متوقف حاليًا. يجب التسجيل، ويُشترط أن تكون من أبناء العائلة."
      : window.authUser.status === "blocked"
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
  refreshAdminNotificationBadges();
  if (typeof refreshQrScanButtonVisibility === "function") refreshQrScanButtonVisibility();
  setTimeout(checkAndMaybeStartTour, 1200); // مهلة بسيطة لضمان استقرار الصفحة (الشجرة/الثيم) قبل الجولة
}

// ===== ONBOARDING TOUR START (معزول تمامًا — احذف هذا القسم بأمان لإلغاء الميزة) =====
const TOUR_STEPS = [
  { id: "currentUserBadge", title: "حسابك", desc: "اسمك وزر الخروج من حسابك.", always: true },
  { id: "newsNavBtn", asmalId: "asmalFab_newsNavBtn", title: "الأخبار", desc: "آخر أخبار وتحديثات العائلة.", page: "news", action: "view" },
  { id: "uiScaleControls", title: "حجم الخط", desc: "تكبير أو تصغير حجم النص بكل الصفحة.", always: true },
  { id: "searchToggle", asmalId: "asmalSearchHost", title: "البحث", desc: "ابحث عن أي شخص بالشجرة بالاسم.", page: "search", action: "view" },
  { id: "myTreeToggle", asmalId: "asmalFab_myTreeToggle", title: "شجرتي", desc: "تعرض فرعك الخاص من الشجرة فقط.", page: "myTree", action: "view" },
  { id: "relToggle", asmalId: "asmalFab_relToggle", title: "خيوط النسب", desc: "احسب صلة القرابة بينك وبين أي شخص.", page: "relation", action: "view" },
  { id: "bgToggle", asmalId: "asmalFab_bgToggle", title: "المظهر", desc: "تغيير خلفية عرض الشجرة (أدمن فقط).", adminOnly: true },
  { id: "designToggle", asmalId: "asmalFab_designToggle", title: "تصميم الموقع", desc: "اختر الثيم وشكل الواجهة اللي يناسبك.", page: "design", action: "view" },
  { id: "usersToggle", asmalId: "asmalFab_usersToggle", title: "المستخدمون", desc: "إدارة الحسابات والصلاحيات (أدمن فقط).", adminOnly: true },
  { id: "aiChatToggle", asmalId: "asmalChipAssistantDemo", title: "المساعد الذكي", desc: "اسأل المساعد عن أي شخص أو معلومة بالشجرة.", page: "ai", action: "view" },
  { id: "recordsToggle", asmalId: "asmalFab_recordsToggle", title: "السجلات", desc: "استعرض وصدّر السجلات المعبّأة.", page: "records", action: "view" },
  { id: "ioToggle", asmalId: "asmalFab_ioToggle", title: "استيراد وتصدير", desc: "تصدير أو استيراد بيانات الشجرة (أدمن فقط).", adminOnly: true },
  { id: "attachmentsToggle", asmalId: "asmalFab_attachmentsToggle", title: "المرفقات", desc: "مرفقات ومصادر إضافية (أدمن فقط).", adminOnly: true },
  { id: "deleteBadgeToggle", asmalId: "asmalFlDelete", title: "علامات الحذف", desc: "إظهار/إخفاء علامات الحذف بالشجرة (أدمن فقط).", adminOnly: true }
];

// يُرجع معرّف العنصر الصحيح الواجب تظليله بالخطوة الحالية، حسب التصميم النشط
function tourStepElementId(step){
  const isAsmal = document.documentElement.getAttribute("data-style") === "5";
  return (isAsmal && step.asmalId) ? step.asmalId : step.id;
}
// عنصر "موجود بالـDOM لكن مخفيًا" (display:none، أو بلا مساحة معروضة) لا يصلح لتظليل الجولة
function isTourElementVisible(el){
  if (!el) return false;
  if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
// قبل تظليل عنصر بأسمل، نفتح حاويته (القائمة العائمة اليسرى أو البطاقة اليمنى)
// إن كانت مطوية، حتى يكون الزر المستهدَف ظاهرًا وواضحًا فعليًا أثناء الجولة.
function ensureAsmalTourTargetOpen(elId){
  if (document.documentElement.getAttribute("data-style") !== "5") return;
  const fabWrapper = document.getElementById("asmalFabWrapper");
  const menuToggle = document.getElementById("asmalMenuToggleDemo");
  const flCard = document.getElementById("asmalFlCard");
  const flToggle = document.getElementById("asmalFlToggle");
  // إغلاق أي حاوية مفتوحة من خطوة سابقة أولًا
  if (fabWrapper) fabWrapper.classList.remove("open");
  if (menuToggle) menuToggle.classList.remove("active");
  if (flCard) flCard.classList.add("collapsed");
  if (flToggle) flToggle.textContent = "›";
  // ثم فتح الحاوية التي تخص الخطوة الحالية فقط
  if (elId && elId.startsWith("asmalFab_") && fabWrapper){
    fabWrapper.classList.add("open");
    if (menuToggle) menuToggle.classList.add("active");
  }
  if (elId === "asmalFlDelete" && flCard){
    flCard.classList.remove("collapsed");
    if (flToggle) flToggle.textContent = "‹";
  }
}

let _tourActiveSteps = [];
let _tourIndex = 0;

function getFilteredTourSteps(){
  return TOUR_STEPS.filter(s => {
    const el = document.getElementById(tourStepElementId(s));
    if (!el || !isTourElementVisible(el)) return false;
    if (s.always) return true;
    if (s.adminOnly) return isAdminUser();
    return can(s.page, s.action);
  });
}

async function checkAndMaybeStartTour(){
  if (!window.authUser || window.authUser.isGuest) return;
  try{
    const metaSnap = await db.collection("meta").doc("tourSettings").get();
    const currentVersion = metaSnap.exists ? (metaSnap.data().tourVersion || 1) : 1;
    const seenVersion = parseInt(localStorage.getItem("tourLastSeenVersion") || "0", 10);
    if (seenVersion >= currentVersion) return; // شافها بنفس الإصدار أو أحدث (بهذا المتصفح)
    startTour(currentVersion);
  }catch(e){ console.warn("تعذّر فحص إصدار الجولة:", e); }
}

function startTour(versionToMark){
  _tourActiveSteps = getFilteredTourSteps();
  _tourIndex = 0;
  if (!_tourActiveSteps.length) return;
  // تعطيل مؤقت لتحجيم الواجهة (A+/A-) أثناء الجولة فقط، حتى تُحسب مواضع العناصر بدقة. يُعاد الوضع الأصلي بنهاية الجولة.
  const _tourWrapper = document.getElementById("appScaleWrapper");
  window._tourSavedScale = _tourWrapper ? _tourWrapper.style.transform : "";
  if (_tourWrapper) _tourWrapper.style.transform = "";
  document.getElementById("tourOverlay").style.display = "block";
  requestAnimationFrame(() => requestAnimationFrame(() => showTourStep(0, versionToMark)));
}

function showTourStep(i, versionToMark){
  const step = _tourActiveSteps[i];
  const elId = tourStepElementId(step);
  ensureAsmalTourTargetOpen(elId);
  const el = document.getElementById(elId);
  if (!el){ nextTourStep(i, versionToMark); return; }
  const rect = el.getBoundingClientRect();
  const pad = 8;
  const spot = document.getElementById("tourSpotlight");
  spot.style.top = (rect.top - pad) + "px";
  spot.style.left = (rect.left - pad) + "px";
  spot.style.width = (rect.width + pad * 2) + "px";
  spot.style.height = (rect.height + pad * 2) + "px";

  document.getElementById("tourCardTitle").textContent = step.title;
  document.getElementById("tourCardDesc").textContent = step.desc;
  document.getElementById("tourNextBtn").textContent = (i === _tourActiveSteps.length - 1) ? "إنهاء ✓" : "التالي ←";

  const card = document.getElementById("tourCard");
  // وضع البطاقة أسفل العنصر إن وُجدت مساحة، وإلا أعلاه
  const cardH = 150;
  let cardTop = rect.bottom + 16;
  if (cardTop + cardH > window.innerHeight) cardTop = Math.max(10, rect.top - cardH - 16);
  let cardLeft = Math.min(Math.max(10, rect.left), window.innerWidth - 296);
  card.style.top = cardTop + "px";
  card.style.left = cardLeft + "px";

  document.getElementById("tourNextBtn").onclick = () => nextTourStep(i, versionToMark);
  document.getElementById("tourSkipBtn").onclick = () => endTour(versionToMark);
}

function nextTourStep(i, versionToMark){
  const next = i + 1;
  if (next >= _tourActiveSteps.length){ endTour(versionToMark); return; }
  _tourIndex = next;
  showTourStep(next, versionToMark);
}

async function endTour(versionToMark){
  document.getElementById("tourOverlay").style.display = "none";
  ensureAsmalTourTargetOpen(null); // يُغلق أي حاوية أسمل مفتوحة من آخر خطوة
  const _tourWrapper = document.getElementById("appScaleWrapper");
  if (_tourWrapper) _tourWrapper.style.transform = window._tourSavedScale || "";
  if (versionToMark){
    localStorage.setItem("tourLastSeenVersion", String(versionToMark));
  }
}

// أزرار الأدمن بلوحة تصميم الموقع
document.addEventListener("DOMContentLoaded", () => {
  const replayBtn = document.getElementById("tourReplayAllBtn");
  const previewBtn = document.getElementById("tourPreviewBtn");
  const statusEl = document.getElementById("tourAdminStatus");
  if (replayBtn){
    replayBtn.onclick = async () => {
      statusEl.textContent = "جارِ التحديث…";
      try{
        const ref = db.collection("meta").doc("tourSettings");
        const snap = await ref.get();
        const currentVersion = snap.exists ? (snap.data().tourVersion || 1) : 1;
        await ref.set({ tourVersion: currentVersion + 1 }, { merge: true });
        statusEl.textContent = "✓ ستظهر الجولة للجميع بدخولهم القادم";
      }catch(e){ statusEl.textContent = "تعذّر التحديث: " + (e.message || e.code); }
    };
  }
  if (previewBtn){
    previewBtn.onclick = () => {
      document.getElementById("designPanel").classList.remove("show");
      startTour(null); // معاينة فقط — بلا تسجيل أي إصدار
    };
  }
});
// ===== ONBOARDING TOUR END =====

// ---------- الدخول كضيف (حساب Firebase حقيقي مشترك، بدل آلية وهمية سابقة) ----------
const GUEST_USERNAME = "guest";
const GUEST_PASSWORD = "123321";

async function enterAsGuest(){
  showAuthError("");
  setAuthLoading(true);
  const email = usernameToEmail(GUEST_USERNAME);
  try{
    await auth.signInWithEmailAndPassword(email, GUEST_PASSWORD);
    // afterSignIn سيتولى الباقي تلقائيًا (نفس تسلسل أي حساب حقيقي عادي)
  }catch(err){
    setAuthLoading(false);
    showAuthError("تعذّر تفعيل الدخول كضيف حاليًا. تواصل مع المشرف.");
  }
}
window.enterAsGuest = enterAsGuest;

document.getElementById("guestEnterLink").onclick = (e) => {
  e.preventDefault();
  enterAsGuest();
};

// الاستايل له مستويان:
//   • المشرف يحفظ في meta/siteSettings  => يصير الافتراضي للجميع
//   • المستخدم يحفظ في localStorage      => يغيّره لنفسه فقط، ويتجاوز به العام
// عند التحميل: نقرأ العام، ثم إن وُجد اختيار شخصي فهو الذي يُطبَّق.
async function loadAndApplySiteTheme(){
  let theme = "royal-green", layoutStyle = ""; // الافتراضي: الأخضر الملكي بشكل الواجهة الأصلي، ما لم يُحدَّد غيره صراحة

  // تطبيق فوري (بلا انتظار الشبكة) لتفضيل المستخدم غير الأدمن المحفوظ محليًا —
  // يمنع "ومضة" التصميم الافتراضي أثناء انتظار استعلام Firestore أدناه، لأن
  // المستخدم العائد يملك تفضيله جاهزًا فوريًا بلا حاجة لأي اتصال شبكة.
  if (!isAdminUser()){
    const myThemeEarly  = localStorage.getItem("myTheme");
    const myLayoutEarly = localStorage.getItem("myLayout");
    if (myThemeEarly !== null || myLayoutEarly !== null){
      let earlyTheme = myThemeEarly !== null ? myThemeEarly : theme;
      let earlyLayout = myLayoutEarly !== null ? myLayoutEarly : layoutStyle;
      const isDesktopEarly = window.matchMedia("(min-width:1024px) and (hover:hover) and (pointer:fine)").matches;
      if (isDesktopEarly && earlyLayout === "5") earlyLayout = "3";
      applyTheme(earlyTheme);
      applyLayoutStyle(earlyLayout);
    }
  }

  try{
    const snap = await db.collection("meta").doc("siteSettings").get();
    if (snap.exists){
      const d = snap.data();
      if ("theme" in d) theme = d.theme;             // موجود صراحة (حتى لو فارغ = المشرف اختار "الافتراضي" عمدًا)
      if ("layoutStyle" in d) layoutStyle = d.layoutStyle;
    }
  }catch(e){ console.error("تعذر تحميل استايل الموقع", e); }

  if (!isAdminUser()){
    const myTheme  = localStorage.getItem("myTheme");
    const myLayout = localStorage.getItem("myLayout");
    if (myTheme  !== null) theme = myTheme;
    if (myLayout !== null) layoutStyle = myLayout;
  }

  // على سطح المكتب: "المستقبلي" هو التصميم الوحيد المدعوم حاليًا — يُجبَر
  // دائمًا بغض النظر عن أي تفضيل محفوظ (أسمل غير متجاوب مع سطح المكتب بعد).
  // هذا تجاوز لهذه الجلسة فقط، لا يُكتب فوق التفضيل الحقيقي المحفوظ.
  const isDesktopViewport = window.matchMedia("(min-width:1024px) and (hover:hover) and (pointer:fine)").matches;
  if (isDesktopViewport && layoutStyle === "5") layoutStyle = "3";

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
}

// ===== ASMAL DEMO UI START (معزول تمامًا — احذف هذا البلوك بأمان لإلغاء الميزة) =====
// الخطوة الأولى المتفق عليها لتصميم "أسمل": استنساخ تفاعلي كامل للملف المرجعي
// (فتح/إغلاق القائمة، حركات الفتح الأربعة، وضع أيقونات/نصوص، تمدد شريط البحث،
// نافذة إعدادات النمط) — بلا أي ربط بلوحاتنا أو أزرارنا الحقيقية حتى الآن.
// كل المعرّفات هنا جديدة كليًا (Demo) ولا تتقاطع مع أي عنصر حقيقي بالموقع.
(function initAsmalDemoUI(){
  const fabWrapper = document.getElementById("asmalFabWrapper");
  const menuToggle = document.getElementById("asmalMenuToggleDemo");
  const searchHost = document.getElementById("asmalSearchHost");
  const searchWrap = document.getElementById("asmalSearchWrapDemo");
  const chipPrompt = document.getElementById("asmalChipPromptDemo");
  const chipAssistant = document.getElementById("asmalChipAssistantDemo");
  const flCard = document.getElementById("asmalFlCard");
  const flToggle = document.getElementById("asmalFlToggle");
  if (!fabWrapper || !menuToggle || !searchHost || !searchWrap) return;

  const transitionClasses = ["transition-slide", "transition-rotate", "transition-bounce", "transition-blur"];
  const modeClasses = ["mode-icons", "mode-text"];

  menuToggle.onclick = () => {
    fabWrapper.classList.toggle("open");
    menuToggle.classList.toggle("active");
  };

  // توسيع/طي شريط البحث عند التركيز على أي حقل داخله (بحث أو مساعد ذكي)
  searchHost.addEventListener("focusin", () => searchWrap.classList.add("expanded"));
  searchHost.addEventListener("focusout", () => {
    setTimeout(() => {
      if (!searchWrap.contains(document.activeElement)) searchWrap.classList.remove("expanded");
    }, 120);
  });

  // نقل عنصري البحث الحقيقي (.searchbar) وصف إدخال المساعد الذكي الحقيقي
  // (aiChatInput/aiChatSend) — مرة واحدة فقط، بشكل دائم، لغلاف البحث المشترك.
  // بعدها، التبديل بين "بحث بالاسم" و"المساعد الذكي" يصبح CSS بحتًا (إظهار/
  // إخفاء فقط)، بلا أي نقل DOM متكرر — هذا يمنع تكرار مشكلة التراكب التي
  // كانت تحدث سابقًا عند نقل العناصر ذهابًا وإيابًا بكل ضغطة.
  const searchbarHome = document.getElementById("searchPanel");
  const aiRowHost = document.getElementById("aiChatInput") ? document.getElementById("aiChatInput").parentElement : null;
  const aiMessagesHome = document.getElementById("aiChatMessages") ? document.getElementById("aiChatMessages").parentElement : null;
  const chatMessagesHost = document.getElementById("asmalChatMessagesHost");

  function ensureAsmalHomes(){
    const searchbar = document.querySelector(".searchbar");
    if (searchbar && searchbar.parentElement !== searchHost) searchHost.appendChild(searchbar);
    if (aiRowHost && aiRowHost.parentElement !== searchHost) searchHost.appendChild(aiRowHost);
    const msgs = document.getElementById("aiChatMessages");
    if (msgs && chatMessagesHost && msgs.parentElement !== chatMessagesHost) chatMessagesHost.appendChild(msgs);
  }

  function setAsmalAiMode(active){
    ensureAsmalHomes(); // يضمن أن العناصر بمكانها الدائم؛ لا نقل إضافي بعد ذلك
    if (active){
      document.documentElement.classList.add("asmal-ai-mode");
      fabWrapper.classList.remove("open");
      menuToggle.classList.remove("active");
      if (flCard) flCard.classList.add("collapsed");
      if (flToggle) flToggle.textContent = "›";
      if (chipAssistant) chipAssistant.classList.add("active");
      const aiInput = document.getElementById("aiChatInput");
      if (aiInput) aiInput.focus();
    } else {
      document.documentElement.classList.remove("asmal-ai-mode");
      if (chipAssistant) chipAssistant.classList.remove("active");
    }
  }

  // البحث بالاسم: نشط افتراضيًا دومًا عند كل دخول — لكن فقط إن كان
  // تصميم أسمل هو النشط فعليًا (نتحقق من data-style حتى لا نُفسد
  // مكان حقل البحث الحقيقي بالتصاميم الأخرى).
  function isAsmalActive(){ return document.documentElement.getAttribute("data-style") === "5"; }
  if (isAsmalActive()) setAsmalAiMode(false);

  // عند تبديل التصميم: نُعيد كل شيء لمكانه الأصلي إن غادرنا أسمل،
  // أو نُفعّل البحث بالاسم افتراضيًا إن دخلنا أسمل.
  const _origApplyLayoutStyle = window.applyLayoutStyle;
  window.applyLayoutStyle = function(layoutStyle){
    _origApplyLayoutStyle(layoutStyle);
    if (layoutStyle === "5") setAsmalAiMode(false);
    else {
      document.documentElement.classList.remove("asmal-ai-mode");
      const searchbar = document.querySelector(".searchbar");
      if (searchbar && searchbarHome && searchbar.parentElement !== searchbarHome) searchbarHome.appendChild(searchbar);
      if (aiRowHost && aiMessagesHome && aiRowHost.parentElement !== aiMessagesHome){
        // insertBefore يتطلب أن يكون المرجع ابنًا مباشرًا للحاوية فعليًا — querySelector
        // قد يُرجع حفيدًا أعمق فيفشل الإدراج، فنتحقق أولًا ونُلحق بالنهاية كحل آمن بديل.
        const statusEl = aiMessagesHome.querySelector("#aiChatStatus");
        if (statusEl && statusEl.parentElement === aiMessagesHome) aiMessagesHome.insertBefore(aiRowHost, statusEl);
        else aiMessagesHome.appendChild(aiRowHost);
      }
      const msgs = document.getElementById("aiChatMessages");
      if (msgs && aiMessagesHome && msgs.parentElement !== aiMessagesHome){
        if (aiRowHost && aiRowHost.parentElement === aiMessagesHome) aiMessagesHome.insertBefore(msgs, aiRowHost);
        else aiMessagesHome.appendChild(msgs);
      }
    }
  };

  if (chipPrompt) chipPrompt.onclick = () => setAsmalAiMode(false);
  if (chipAssistant) chipAssistant.onclick = () => setAsmalAiMode(!document.documentElement.classList.contains("asmal-ai-mode"));
  window.asmalSetAiMode = setAsmalAiMode;

  // ربط الأزرار بعناصرها الحقيقية (كل زر يُشغّل .click() على العنصر
  // الحقيقي مباشرة، بلا أي تكرار للمنطق أو الصلاحيات). وعند فتح أي لوحة
  // من القائمة العائمة، تنكمش القائمة نفسها تلقائيًا (تعود مطوية).
  const ASMAL_REAL_LINKS = {
    "الأخبار": "newsNavBtn",
    "خيوط النسب": "relToggle",
    "شجرتي": "myTreeToggle",
    "السجل": "recordsToggle",
    "المستخدمون": "usersToggle",
    "التصدير": "ioToggle",
    "المرفقات": "attachmentsToggle",
    "المظهر": "bgToggle"
  };
  document.querySelectorAll(".asmal-fab-item").forEach(item => {
    const realId = ASMAL_REAL_LINKS[item.dataset.label];
    if (!realId) return;
    item.onclick = () => {
      const realEl = document.getElementById(realId);
      if (realEl) realEl.click();
      // انكماش القائمة العائمة بعد فتح اللوحة
      fabWrapper.classList.remove("open");
      menuToggle.classList.remove("active");
    };
  });

  // الضغط داخل شريط البحث السفلي (وليس داخل لوحة مفتوحة) يُغلق أي لوحة
  // منبثقة مفتوحة حاليًا من قائمة الأدوات.
  searchHost.addEventListener("focusin", () => {
    document.querySelectorAll(".bottom-panel.show").forEach(p => {
      if (typeof clearPanelInputs === "function") clearPanelInputs(p);
      p.classList.remove("show");
    });
    const pb = document.getElementById("panelsBackdrop");
    if (pb) pb.classList.remove("show");
  });

  // نافذة إعدادات النمط
  const styleModal = document.getElementById("asmalStyleModalDemo");
  const styleModalClose = document.getElementById("asmalStyleModalCloseDemo");
  const transitionPicker = document.getElementById("asmalTransitionPickerDemo");
  const modePicker = document.getElementById("asmalModePickerDemo");
  const themePicker = document.getElementById("asmalThemePickerDemo");
  const styleButton = Array.from(document.querySelectorAll(".asmal-fab-item"))
    .find(btn => btn.dataset.label === "النمط");

  if (styleButton && styleModal){
    styleButton.onclick = () => styleModal.setAttribute("aria-hidden", "false");
  }
  if (styleModalClose && styleModal){
    styleModalClose.onclick = () => styleModal.setAttribute("aria-hidden", "true");
  }
  if (styleModal){
    styleModal.addEventListener("click", (e) => {
      if (e.target.classList.contains("asmal-style-modal-backdrop")) styleModal.setAttribute("aria-hidden", "true");
    });
  }

  // حركة فتح القائمة وشكل أزرارها: تُحفظ فعليًا بـlocalStorage وتُستعاد
  // تلقائيًا عند إعادة تحميل الصفحة (لا يوجد زر حقيقي سابق لهذه الميزة
  // الجديدة، فـ"الحقيقي" هنا يعني: تُحفظ وتستمر، لا مجرد تبديل شكل مؤقت).
  const savedTransition = localStorage.getItem("asmalTransition") || "transition-slide";
  const savedMode = localStorage.getItem("asmalMode") || "mode-icons";
  transitionClasses.forEach(c => fabWrapper.classList.remove(c));
  modeClasses.forEach(c => fabWrapper.classList.remove(c));
  fabWrapper.classList.add(savedTransition);
  fabWrapper.classList.add(savedMode);

  if (transitionPicker){
    transitionPicker.querySelectorAll(".asmal-style-option").forEach(o => {
      o.classList.toggle("active", o.dataset.value === savedTransition);
    });
    transitionPicker.addEventListener("click", (e) => {
      const btn = e.target.closest(".asmal-style-option");
      if (!btn || !btn.dataset.value) return;
      transitionClasses.forEach(c => fabWrapper.classList.remove(c));
      fabWrapper.classList.add(btn.dataset.value);
      localStorage.setItem("asmalTransition", btn.dataset.value);
      transitionPicker.querySelectorAll(".asmal-style-option").forEach(o => o.classList.remove("active"));
      btn.classList.add("active");
    });
  }

  if (modePicker){
    modePicker.querySelectorAll(".asmal-style-option").forEach(o => {
      o.classList.toggle("active", o.dataset.value === savedMode);
    });
    modePicker.addEventListener("click", (e) => {
      const btn = e.target.closest(".asmal-style-option");
      if (!btn || !btn.dataset.value) return;
      modeClasses.forEach(c => fabWrapper.classList.remove(c));
      fabWrapper.classList.add(btn.dataset.value);
      localStorage.setItem("asmalMode", btn.dataset.value);
      modePicker.querySelectorAll(".asmal-style-option").forEach(o => o.classList.remove("active"));
      btn.classList.add("active");
    });
  }

  // قسم "شكل الواجهة" — حقيقي بالكامل: يُشغّل نفس زر layoutChooser
  // الحقيقي (بكل صلاحياته وحفظه)، بلا أي تكرار للمنطق.
  const layoutPicker = document.getElementById("asmalLayoutPickerDemo");
  if (layoutPicker){
    layoutPicker.addEventListener("click", (e) => {
      const btn = e.target.closest(".asmal-style-option");
      if (!btn) return;
      const realStyle = btn.dataset.realStyle;
      const realBtn = document.querySelector(`#layoutChooser .layout-btn[data-style="${realStyle}"]`);
      if (realBtn) realBtn.click();
    });
  }

  // قسم "التصميم (الألوان)" — حقيقي بالكامل الآن: يُشغّل نفس زر themeChooser
  // الحقيقي (بكل صلاحياته وحفظه)، بلا أي تكرار للمنطق.
  if (themePicker){
    themePicker.addEventListener("click", (e) => {
      const btn = e.target.closest(".asmal-style-option");
      if (!btn) return;
      const realTheme = btn.dataset.theme;
      const realBtn = document.querySelector(`#themeChooser .theme-btn[data-theme="${realTheme}"]`);
      if (realBtn) realBtn.click();
    });
  }
})();

// الضغط على الخلفية المعتمة يُغلق أي لوحة منبثقة مفتوحة (يعمل لكل التصاميم)
(function initPanelsBackdropClose(){
  const pb = document.getElementById("panelsBackdrop");
  if (!pb) return;
  pb.addEventListener("click", () => {
    document.querySelectorAll(".bottom-panel.show").forEach(p => {
      if (typeof clearPanelInputs === "function") clearPanelInputs(p);
      p.classList.remove("show");
    });
    pb.classList.remove("show");
  });
})();

// البطاقة العائمة الصغيرة (اختصارات: الأخبار/خيوط النسب/الحذف/تحديث)
(function initAsmalFlCard(){
  const card = document.getElementById("asmalFlCard");
  const toggle = document.getElementById("asmalFlToggle");
  if (!card || !toggle) return;

  toggle.onclick = () => {
    card.classList.toggle("collapsed");
    toggle.textContent = card.classList.contains("collapsed") ? "›" : "‹";
  };

  // مزامنة حالة "نشط" لزر البطاقة مع حالة العنصر الحقيقي المرتبط به
  function bindActiveSync(realId, btnEl){
    const realEl = document.getElementById(realId);
    if (!realEl || !btnEl) return;
    const sync = () => btnEl.classList.toggle("active", realEl.classList.contains("show") || realEl.classList.contains("active"));
    sync();
    new MutationObserver(sync).observe(realEl, { attributes: true, attributeFilter: ["class"] });
  }

  const flNews = document.getElementById("asmalFlNews");
  if (flNews) flNews.onclick = () => { const el = document.getElementById("newsNavBtn"); if (el) el.click(); };

  const flRel = document.getElementById("asmalFlRel");
  if (flRel){
    flRel.onclick = () => { const el = document.getElementById("relToggle"); if (el) el.click(); };
    bindActiveSync("relPanel", flRel);
  }

  const flDelete = document.getElementById("asmalFlDelete");
  if (flDelete){
    flDelete.onclick = () => { const el = document.getElementById("deleteBadgeToggle"); if (el) el.click(); };
    bindActiveSync("deleteBadgeToggle", flDelete);
  }

  const flRefresh = document.getElementById("asmalFlRefresh");
  if (flRefresh){
    flRefresh.onclick = () => {
      if (typeof window.asmalSetAiMode === "function") window.asmalSetAiMode(false);
      const zr = document.getElementById("zoomReset");
      const ef = document.getElementById("exitFocus");
      if (zr) zr.click();
      if (ef) ef.click();
    };
  }
})();
// ===== ASMAL DEMO UI END =====

document.querySelectorAll(".layout-btn").forEach(btn => {
  btn.onclick = async () => {
    if (!guard("design")) return;
    const layoutStyle = btn.dataset.style;
    const statusEl = document.getElementById("layoutStatus");

    // إغلاق كل النوافذ المفتوحة أولًا (كل اللوحات المنبثقة، بطاقة معلومات
    // الشخص، ولوحة الإضافة) قبل الانتقال فعليًا للتصميم الجديد.
    document.querySelectorAll(".bottom-panel.show").forEach(p => {
      if (typeof clearPanelInputs === "function") clearPanelInputs(p);
      p.classList.remove("show");
    });
    document.getElementById("sheet")?.classList.remove("show");
    document.getElementById("infoModal")?.classList.remove("show");
    document.getElementById("panelsBackdrop")?.classList.remove("show");

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

// ===== CHANGE PASSWORD START (معزول تمامًا — احذف بأمان لإلغاء الميزة) =====
document.getElementById("changePasswordBtn").onclick = () => {
  if (!window.authUser || window.authUser.isGuest){ return; }
  document.getElementById("cpOldPassword").value = "";
  document.getElementById("cpNewPassword").value = "";
  document.getElementById("cpNewPassword2").value = "";
  document.getElementById("cpError").textContent = "";
  document.getElementById("changePasswordOverlay").style.display = "flex";
};
document.getElementById("cpCancelBtn").onclick = () => {
  document.getElementById("changePasswordOverlay").style.display = "none";
};
document.getElementById("cpSaveBtn").onclick = async () => {
  const errEl = document.getElementById("cpError");
  errEl.textContent = "";
  const oldPass = document.getElementById("cpOldPassword").value;
  const newPass = document.getElementById("cpNewPassword").value;
  const newPass2 = document.getElementById("cpNewPassword2").value;
  if (!oldPass || !newPass){ errEl.textContent = "عبّي كل الحقول"; return; }
  if (newPass.length < 6){ errEl.textContent = "كلمة المرور الجديدة يجب أن تكون ٦ أحرف على الأقل"; return; }
  if (newPass !== newPass2){ errEl.textContent = "كلمتا المرور الجديدتان غير متطابقتين"; return; }
  const user = auth.currentUser;
  if (!user || !user.email){ errEl.textContent = "تعذّر التحقق من الحساب الحالي"; return; }
  try{
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, oldPass);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(newPass);
    document.getElementById("changePasswordOverlay").style.display = "none";
    if (typeof customAlert === "function") customAlert("تم تغيير كلمة المرور بنجاح ✓");
  }catch(e){
    if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential"){
      errEl.textContent = "كلمة المرور الحالية غير صحيحة";
    } else {
      errEl.textContent = "خطأ: " + (e.message || e.code);
    }
  }
};
// ===== CHANGE PASSWORD END =====

auth.onAuthStateChanged((fbUser) => {
  if (fbUser){
    afterSignIn(fbUser);
  } else {
    currentUser = null;
    window.currentUser = null;
    window.authUser = null;
    document.body.classList.remove("authed");   // إخفاء كل عناصر التحكم فورًا
    document.getElementById("authOverlay").classList.remove("hidden");
    // تأكَّد الآن فعليًا أنه لا توجد جلسة محفوظة — نُظهر نموذج الدخول
    // الحقيقي بدل رسالة "جارِ التحقق من الجلسة…" الأولية.
    const initialCheck = document.getElementById("authInitialCheck");
    const formFields = document.getElementById("authFormFields");
    if (initialCheck) initialCheck.style.display = "none";
    if (formFields) formFields.style.display = "block";
  }
});

function isDbBacked(){ return currentUser && !!treeData.id; }
// شرطان لا بد منهما معًا:
//   ١) يملك صلاحية tree.edit  (كانت مفقودة: من له نطاق كان يضيف ولو بلا صلاحية)
//   ٢) الموضع داخل نطاقه      (عقدته نفسها أو أحد فروعها)
// المشرف يتجاوز قيد النطاق، لا قيد الصلاحية (فهو يملكها أصلًا).
// من يقدر يضيف ابنًا تحت عقدة معيّنة:
//   • الأدمن: أي مكان
//   • trustedAddSons.edit (موثوق): أي مكان بالمشجرة (باعتماد لاحق)
//   • addSons.edit: عقدته نفسها أو فروعها فقط (باعتماد لاحق)
function canAddUnder(parentDataNode){
  if (isAdminUser()) return true;
  if (can("trustedAddSons", "edit")) return true;   // الموثوق: أي مكان
  if (!can("addSons", "edit")) return false;
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
  { id: "recordsToggle",     page: "records",  mode: "hide" },   // السجلات: أدمن فقط الآن
  { id: "aiChatToggle",      page: "ai",       mode: "hide" },
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
  // إخفاء أزرار ➕ الإضافة على العقد لمن لا يملك صلاحية إضافة الأبناء (لعقدته أو الموثوق: بأي مكان)
  document.body.classList.toggle("no-tree-edit", !(can("addSons", "edit") || can("trustedAddSons", "edit")));

  // صندوق إدارة الجولة التفاعلية (لوحة تصميم الموقع) — أدمن فقط
  const tourBox = document.getElementById("tourAdminBox");
  if (tourBox) tourBox.style.display = admin ? "" : "none";

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


  // زر المستخدمين: يظهر للأدمن أو للموثوق (trustedUsers.edit) — استثناء من قاعدة الأدمن فقط
  const usersBtn = document.getElementById("usersToggle");
  if (usersBtn){
    const showUsers = admin || can("trustedUsers", "edit");
    usersBtn.style.display = showUsers ? "" : "none";
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
    // جسر الوصول من صفحة الإحصائيات (stats.html): فتح نموذج "إضافة معلومات"
    // مباشرة لشخص محدد بمعرفه، ثم تنظيف الرابط لمنع إعادة الفتح لاحقًا.
    const openInfoId = new URLSearchParams(location.search).get("openInfo");
    if (openInfoId && typeof root !== "undefined" && root){
      const d = root.descendants().find(n => n.data.id === openInfoId);
      if (d && typeof openInfoModal === "function") openInfoModal(d);
      history.replaceState(null, "", location.pathname);
    }
    // ===== QR FEATURE: جسر منفصل تمامًا خاص برموز QR — يفتح بطاقة العرض
    // الحقيقية (showInfo) بدل نموذج التعديل، لأن أي شخص قد يمسح الرمز
    // (وليس الأدمن حصرًا كحالة openInfo أعلاه). لا تدمج مع openInfo بأي شكل.
    const viewInfoId = new URLSearchParams(location.search).get("viewInfo");
    if (viewInfoId && typeof root !== "undefined" && root){
      const d2 = root.descendants().find(n => n.data.id === viewInfoId);
      if (d2 && typeof showInfo === "function") showInfo(d2);
      history.replaceState(null, "", location.pathname);
    }
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
    // ملاحظة: عقد "الأم" (الإناث) تبقى في البيانات للجميع (لبناء صفوف العديل والعرض النصي وحسابات القرابة)،
    // ويُكتفى بإخفائها بصريًا في الرسم فقط لغير الأدمن (انظر فلتر الرسم) — قاعدة: حجب الرسم لا البيانات.
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
  const admin = isAdminUser();
  const canEdit = admin;   // السجلات + التصدير: أدمن فقط
  // الأدمن يشاهد كل الملفات المعبّأة
  const ownScopeId = (!admin && window.authUser) ? window.authUser.scopePersonId : null;
  const filled = [];
  for (const n of root.descendants()){
    if (n.data.type === "female") continue; // العنصر النسائي لا يظهر كسجل/ملف مستقل
    if (!admin && personId(n) !== ownScopeId) continue;
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
    const actionsHtml = canEdit
      ? `<span><button class="f-btn-sm records-open-btn" style="margin-left:6px;">فتح</button><button class="f-btn-sm records-pdf-btn">⬇️ PDF</button></span>`
      : "";
    row.innerHTML = `<span style="cursor:pointer; color:#241a10;">${chainNames(node).slice(0,3).map(escapeHtml).join(" ")}</span>${actionsHtml}`;
    if (canEdit){
      row.querySelector(".records-open-btn").onclick = () => { recordsPanel.classList.remove("show"); showInfo(node); };
      row.querySelector(".records-pdf-btn").onclick = () => exportPersonPdf(node, data);
    }
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

  // ---------- تصنيف الحقول لثلاثة أقسام بصرية (أساسية / العائلة / النبذة)، كلٌّ بأيقونته ----------
  const basicFields = [];
  if (data.birthYear){
    const isDead = data.deathStatus === "dead" && data.deathYear;
    const endYear = isDead ? parseInt(data.deathYear) : CURRENT_HIJRI_YEAR;
    const age = endYear - parseInt(data.birthYear);
    basicFields.push({ icon: "📅", label: "تاريخ الميلاد", value: data.birthYear + " هـ" });
    if (age > 0 && age < 130) basicFields.push({ icon: "⏳", label: "العمر", value: age + " سنة تقريبًا" + (isDead ? " — عند الوفاة" : "") });
  }
  basicFields.push({ icon: data.deathStatus === "dead" ? "🕊️" : "💚", label: "الحالة", value: data.deathStatus === "dead" ? "متوفى" : "حي يرزق" });
  if (data.job) basicFields.push({ icon: "💼", label: "الوظيفة", value: data.job });
  if (data.nickname) basicFields.push({ icon: "🏷️", label: "اللقب/الشهرة", value: data.nickname });

  const familyFields = [];
  familyFields.push({ icon: "👨‍👦", label: "عدد الأبناء بالمشجرة", value: String(sonsInTree) });
  if (sonNames.length) familyFields.push({ icon: "📋", label: "أسماء الأبناء", value: sonNames.join("، ") });
  if (insideWifeFathers.length) familyFields.push({ icon: "🤝", label: "والد الزوجة (من القبيلة)", value: insideWifeFathers.join("، ") });
  if (unclesLine) familyFields.push({ icon: "👥", label: "الأخوال", value: unclesLine });
  if (halfSiblingsLine) familyFields.push({ icon: "👬", label: "الإخوة من الأم", value: halfSiblingsLine });
  if (wifeSpecificNotaries.length) familyFields.push({ icon: "⚖️", label: "عدلاء الزوجة/الزوجات", value: wifeSpecificNotaries.join("، ") });

  const bioFields = [];
  if (data.bio) bioFields.push({ icon: "📜", label: "نبذة", value: data.bio });

  // ---------- قياس دقيق لعرض النص (بدل عدّ الحروف التقريبي القديم) ----------
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  function measureW(text, fontSize, weight){
    measureCtx.font = `${weight || 400} ${fontSize}px Tajawal, sans-serif`;
    return measureCtx.measureText(text).width;
  }
  function wrapByWidth(text, maxWidth, fontSize){
    const words = String(text).split(/\s+/);
    const out = [];
    let cur = "";
    words.forEach(w => {
      const test = cur ? cur + " " + w : w;
      if (measureW(test, fontSize) > maxWidth && cur){ out.push(cur); cur = w; }
      else cur = test;
    });
    if (cur) out.push(cur);
    return out.length ? out : [""];
  }
  // النبذة التاريخية تحديدًا: تحترم فواصل الأسطر الأصلية (كل فقرة على حدة) قبل
  // لفّ كل فقرة على حدة، حتى تبقى تصنيفاتها (قصة/رواية/...) ببداية سطرها دومًا.
  function wrapBioByWidth(text, maxWidth, fontSize){
    const paragraphs = String(text).split(/\n+/);
    let out = [];
    paragraphs.forEach(p => { if (p.trim()) out = out.concat(wrapByWidth(p, maxWidth, fontSize)); });
    return out.length ? out : [""];
  }

  const W = blockWidth || 515, margin = 18, subLineH = 20;
  const VALUE_FONT_SIZE = 12.5;
  const textMaxWidth = W - margin*2;
  const BIO_TAGS = ["قصة", "رواية", "حادثة", "معلومة", "نبذة تاريخية", "أدب"];

  function prepSection(fields, isBio){
    return fields.map(f => ({
      icon: f.icon, label: f.label,
      valueLines: isBio ? wrapBioByWidth(f.value, textMaxWidth, VALUE_FONT_SIZE) : wrapByWidth(f.value, textMaxWidth, VALUE_FONT_SIZE)
    }));
  }
  const basicWrapped = prepSection(basicFields, false);
  const familyWrapped = prepSection(familyFields, false);
  const bioWrapped = prepSection(bioFields, true);

  // ---------- حساب الارتفاع الكلي مسبقًا (يجب أن يطابق تمامًا حركة المؤشر أثناء الرسم أدناه) ----------
  const HEADER_H = data.photo ? 132 : 78;
  function sectionHeight(wrapped){
    if (!wrapped.length) return 0;
    let h = 22; // عنوان القسم
    wrapped.forEach(f => { h += 20 + f.valueLines.length * subLineH + 6; });
    return h + 4; // فراغ بعد القسم
  }
  const basicH = sectionHeight(basicWrapped);
  const familyH = sectionHeight(familyWrapped);
  const bioH = sectionHeight(bioWrapped);
  const TOP_GAP = 26;
  const H = HEADER_H + TOP_GAP + basicH + familyH + bioH + 14;

  // ---------- بناء SVG ----------
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("xmlns", svgNS);
  svg.setAttribute("width", W); svg.setAttribute("height", H);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const styleEl = document.createElementNS(svgNS, "style");
  styleEl.textContent = "text{font-family:'Tajawal',sans-serif;}";
  svg.appendChild(styleEl);

  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("width", W); bg.setAttribute("height", H); bg.setAttribute("rx", 12); bg.setAttribute("fill", "#FFFDF6");
  bg.setAttribute("stroke", "#B8860B"); bg.setAttribute("stroke-width", 1.4);
  svg.appendChild(bg);

  // شريط الهيدر الملوّن (اسم الشخص + صورته إن وُجدت)
  const uid = Math.random().toString(36).slice(2);
  const clipPath = document.createElementNS(svgNS, "clipPath");
  clipPath.setAttribute("id", "hdrclip" + uid);
  const clipShape = document.createElementNS(svgNS, "path");
  clipShape.setAttribute("d", `M0,0 H${W} V${HEADER_H-12} Q${W},${HEADER_H} ${W-12},${HEADER_H} H12 Q0,${HEADER_H} 0,${HEADER_H-12} Z`);
  clipPath.appendChild(clipShape);
  svg.appendChild(clipPath);

  const headerBg = document.createElementNS(svgNS, "rect");
  headerBg.setAttribute("width", W); headerBg.setAttribute("height", HEADER_H); headerBg.setAttribute("fill", "#0B3D2E");
  headerBg.setAttribute("clip-path", `url(#hdrclip${uid})`);
  svg.appendChild(headerBg);
  const hdrLine = document.createElementNS(svgNS, "rect");
  hdrLine.setAttribute("x", 0); hdrLine.setAttribute("y", HEADER_H-3); hdrLine.setAttribute("width", W); hdrLine.setAttribute("height", 3);
  hdrLine.setAttribute("fill", "#C9A227");
  svg.appendChild(hdrLine);

  if (data.photo){
    const photoSize = 78, photoY = 14;
    const pClip = document.createElementNS(svgNS, "clipPath");
    pClip.setAttribute("id", "photoclip" + uid);
    const pCircle = document.createElementNS(svgNS, "circle");
    pCircle.setAttribute("cx", W/2); pCircle.setAttribute("cy", photoY + photoSize/2); pCircle.setAttribute("r", photoSize/2);
    pClip.appendChild(pCircle);
    svg.appendChild(pClip);
    const pImg = document.createElementNS(svgNS, "image");
    pImg.setAttributeNS("http://www.w3.org/1999/xlink", "href", data.photo);
    pImg.setAttribute("x", W/2 - photoSize/2); pImg.setAttribute("y", photoY);
    pImg.setAttribute("width", photoSize); pImg.setAttribute("height", photoSize);
    pImg.setAttribute("clip-path", `url(#photoclip${uid})`);
    pImg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    svg.appendChild(pImg);
    const pRing = document.createElementNS(svgNS, "circle");
    pRing.setAttribute("cx", W/2); pRing.setAttribute("cy", photoY + photoSize/2); pRing.setAttribute("r", photoSize/2);
    pRing.setAttribute("fill", "none"); pRing.setAttribute("stroke", "#C9A227"); pRing.setAttribute("stroke-width", 2);
    svg.appendChild(pRing);
  }

  const title = document.createElementNS(svgNS, "text");
  title.setAttribute("x", W/2); title.setAttribute("y", data.photo ? HEADER_H - 14 : HEADER_H/2 + 7);
  title.setAttribute("text-anchor", "middle"); title.setAttribute("font-size", "19"); title.setAttribute("font-weight", "700");
  title.setAttribute("fill", "#FFFDF6");
  title.textContent = fiveName;
  svg.appendChild(title);

  // ---------- رسم الأقسام (عنوان مزخرف بخطين جانبيين + حقوله) ----------
  // نتتبّع "نقاط قطع آمنة" (فراغات بين الأسطر/الحقول) أثناء الرسم، ليُستخدَم
  // القطع عندها لاحقًا عند تقسيم الصفحات، بدل قطع أي سطر من منتصفه.
  const safeCuts = [];
  let y = HEADER_H + TOP_GAP;
  safeCuts.push(y - 10); // فوق أول قسم مباشرة (داخل فراغ TOP_GAP)
  function drawSectionTitle(text){
    const tw = measureW(text, 13, 700);
    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", W/2); t.setAttribute("y", y);
    t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", "13"); t.setAttribute("font-weight", "700");
    t.setAttribute("fill", "#0B3D2E");
    t.textContent = text;
    svg.appendChild(t);
    [[margin, W/2 - tw/2 - 10], [W/2 + tw/2 + 10, W - margin]].forEach(([x1,x2]) => {
      if (x2 > x1){
        const ln = document.createElementNS(svgNS, "line");
        ln.setAttribute("x1", x1); ln.setAttribute("x2", x2);
        ln.setAttribute("y1", y-4); ln.setAttribute("y2", y-4); ln.setAttribute("stroke", "#E6D9B8");
        svg.appendChild(ln);
      }
    });
    y += 22;
  }
  function drawFieldRow(f){
    safeCuts.push(y - 14); // فوق تسمية الحقل مباشرة (فراغ آمن قبل بداية "حادثة:" مثلًا)
    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", W - margin); t.setAttribute("y", y);
    t.setAttribute("text-anchor", "end"); t.setAttribute("font-size", "12.5"); t.setAttribute("font-weight", "700"); t.setAttribute("fill", "#8B4A1E");
    t.textContent = `${f.icon} ${f.label}:`;
    svg.appendChild(t);
    y += 20;
    f.valueLines.forEach((vline) => {
      safeCuts.push(y - 14); // فوق كل سطر قيمة (فراغ آمن قبل بداية هذا السطر)
      const v = document.createElementNS(svgNS, "text");
      v.setAttribute("x", W - margin); v.setAttribute("y", y);
      v.setAttribute("text-anchor", "end"); v.setAttribute("font-size", VALUE_FONT_SIZE); v.setAttribute("fill", "#333");
      const matchedTag = (f.label === "نبذة") ? BIO_TAGS.find(tag => vline.startsWith(tag + ":") || vline.startsWith(tag + " :")) : null;
      if (matchedTag){
        const cut = vline.indexOf(":") + 1;
        const tspanTag = document.createElementNS(svgNS, "tspan");
        tspanTag.setAttribute("fill", "#8B1E1E"); tspanTag.setAttribute("font-weight", "700");
        tspanTag.textContent = vline.slice(0, cut);
        const tspanRest = document.createElementNS(svgNS, "tspan");
        tspanRest.textContent = vline.slice(cut);
        v.appendChild(tspanTag); v.appendChild(tspanRest);
      } else {
        v.textContent = vline;
      }
      svg.appendChild(v);
      y += subLineH;
    });
    y += 6;
  }

  if (basicWrapped.length){ drawSectionTitle("📋 معلومات أساسية"); basicWrapped.forEach(drawFieldRow); y += 4; }
  if (familyWrapped.length){ drawSectionTitle("👪 العائلة والأبناء"); familyWrapped.forEach(drawFieldRow); y += 4; }
  if (bioWrapped.length){ drawSectionTitle("📜 النبذة التاريخية"); bioWrapped.forEach(drawFieldRow); y += 4; }
  safeCuts.push(y - 2); // أسفل آخر عنصر مباشرة
  safeCuts.sort((a, b) => a - b);

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
  return { imgData, fiveName, W, H, safeCuts };
}

// ===== PDF MULTI-PAGE SLICING START (معزول — يقسّم الكتلة الطويلة على عدة صفحات بدل قصها) =====
// يرسم صورة الكتلة (imgData بأبعاد W×H نقطة) موزّعةً على صفحات A4 متتالية إن تجاوزت ارتفاع الصفحة.
// يقصّ الصورة أفقيًا لشرائح، كل شريحة بارتفاع صفحة، ويضعها بصفحات منفصلة — بلا فقد أي محتوى.
async function addTallImagePaginated(pdf, imgData, x, yStart, W, H, pageH, margin, addPageIfNeeded, safeCuts){
  const gap = 20; // فراغ بصري (سطر واحد تقريبًا) قبل حد الصفحة السفلي وبعد العلوي عند القطع
  if (H <= (pageH - margin - yStart - gap)){
    // الكتلة تسع بالمساحة المتبقية بالصفحة الحالية — أضفها مباشرة (إطارها
    // الأصلي مرسوم داخل الصورة نفسها بالفعل، بلا حاجة لأي حشوة إضافية هنا)
    pdf.addImage(imgData, "PNG", x, yStart, W, H);
    return yStart + H;
  }
  // الكتلة أطول: نحمّلها كصورة مصدر، ونرسم شرائح منها بـcanvas مؤقت
  const pad = 12; // حشوة داخلية عمودية بين خط الإطار والمحتوى بكل صفحة مقسَّمة
  // أقرب نقطة قطع آمنة (مسجَّلة أثناء البناء) لا تتجاوز الحد الأقصى المسموح —
  // فيقع القطع دومًا بفراغ بين سطرين، لا في منتصف أي سطر نص.
  function nearestSafeCut(maxAllowed, minAllowed){
    if (!safeCuts || !safeCuts.length) return maxAllowed;
    let best = null;
    for (const c of safeCuts){
      if (c <= maxAllowed && c >= (minAllowed || 0)) best = c; // آخر واحد أصغر أو يساوي الحد (مُرتَّبة تصاعديًا)
      else if (c > maxAllowed) break;
    }
    return best !== null ? best : maxAllowed;
  }
  const srcImg = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = imgData; });
  const pxPerPt = srcImg.height / H;        // نسبة بكسل الصورة لكل نقطة PDF
  let drawnPt = 0;                          // كم نقطة رُسمت من ارتفاع الكتلة
  let first = true;
  let lastY = yStart;
  while (drawnPt < H - 0.5){
    let curY, maxContentH;
    if (first){
      curY = yStart;
      maxContentH = pageH - margin - yStart - gap - pad * 2; // ينتهي المحتوى بحشوة قبل الإطار السفلي
    } else {
      pdf.addPage();
      curY = margin + gap; // يبدأ الإطار بفراغ سطر بعد حد الصفحة العلوي
      maxContentH = pageH - margin * 2 - gap * 2 - pad * 2;
    }
    first = false;
    // نبحث عن أقرب نقطة قطع آمنة لا تتجاوز الحد الأقصى المتاح (نسبةً لبداية الكتلة الكلية = drawnPt)
    const idealEndAbs = drawnPt + Math.min(maxContentH, H - drawnPt); // نهاية القطع المثالية (بلا وعي بالأسطر) بمقياس الكتلة الكاملة
    const isLastChunk = (H - drawnPt) <= maxContentH + 0.5;
    const safeEndAbs = isLastChunk ? idealEndAbs : nearestSafeCut(idealEndAbs, drawnPt + 20);
    const contentH = Math.max(20, safeEndAbs - drawnPt); // ارتفاع محتوى هذه الصفحة (بلا الحشوة)
    const sy = Math.round(drawnPt * pxPerPt);                 // بداية القصّ بالبكسل
    const sh = Math.round(contentH * pxPerPt);               // ارتفاع القصّ بالبكسل
    const c = document.createElement("canvas");
    c.width = srcImg.width; c.height = sh;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(srcImg, 0, sy, srcImg.width, sh, 0, 0, srcImg.width, sh);
    // المحتوى يُرسم بحشوة عمودية (pad) عن أعلى/أسفل الإطار، فلا يلامسه النص أبدًا
    pdf.addImage(c.toDataURL("image/png"), "PNG", x, curY + pad, W, contentH);
    // إطار ذهبي حول كل شريحة/صفحة على حدة (يشمل الحشوة، فيحيط بالمحتوى لا يلامسه)
    const frameH = contentH + pad * 2;
    pdf.setDrawColor(184, 134, 11); pdf.setLineWidth(1.2);
    if (typeof pdf.roundedRect === "function") pdf.roundedRect(x, curY, W, frameH, 10, 10, "S");
    else pdf.rect(x, curY, W, frameH, "S");
    drawnPt += contentH;
    lastY = curY + frameH;
  }
  return lastY;
}
// ===== PDF MULTI-PAGE SLICING END =====

// تذييل موحّد لكل صفحات ملف PDF: رقم الصفحة + تاريخ التصدير + اسم الموقع.
// يُرسم كصورة (canvas بخط Tajawal) وليس نص jsPDF مباشر، لأن خطوط jsPDF
// المدمجة (helvetica) لا تدعم الحروف العربية إطلاقًا وتظهر رموزًا غير مقروءة.
function addPdfFooterToAllPages(pdf, PAGE_W, PAGE_H, margin){
  const total = pdf.internal.getNumberOfPages();
  const dateStr = new Date().toLocaleDateString("ar-SA-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" });
  const footerH = 16, scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = (PAGE_W - margin*2) * scale; canvas.height = footerH * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.font = "9px Tajawal, sans-serif";
  ctx.fillStyle = "#8B745A";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.fillText(`شجرة بني أسمل الحكمي — ${dateStr}`, PAGE_W - margin*2, footerH/2);
  const baseDataUrl = canvas.toDataURL("image/png");
  for (let i = 1; i <= total; i++){
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width; pageCanvas.height = canvas.height;
    const pctx = pageCanvas.getContext("2d");
    pctx.drawImage(canvas, 0, 0);
    pctx.scale(scale, scale);
    pctx.font = "9px Tajawal, sans-serif";
    pctx.fillStyle = "#8B745A";
    pctx.textBaseline = "middle";
    pctx.textAlign = "left";
    pctx.fillText(`${i} / ${total}`, 0, footerH/2);
    pdf.setPage(i);
    pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", margin, PAGE_H - margin/2 - footerH/2, PAGE_W - margin*2, footerH);
  }
}

async function exportPersonPdf(personNode, preloadedData){
  const PAGE_W = 595, PAGE_H = 842, margin = 40;
  const { imgData, fiveName, W, H, safeCuts } = await buildPersonBlockDataUrl(personNode, preloadedData, PAGE_W - margin*2);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  await addTallImagePaginated(pdf, imgData, margin, margin, W, H, PAGE_H, margin, null, safeCuts);
  addPdfFooterToAllPages(pdf, PAGE_W, PAGE_H, margin);
  pdf.save(`${fiveName}.pdf`);
}

// يبني صفحة/صفحات غلاف وفهرس (العنوان + التاريخ + قائمة الأسماء وأرقام صفحاتهم)
// بأول ملف "تصدير الكل" — بنفس أسلوب SVG→صورة المستخدم بباقي التصدير (لدعم
// العربية، لأن خطوط jsPDF المدمجة لا تدعمها). يُعيد عدد الصفحات التي استخدمها.
async function addIndexPages(pdf, entries, dateStr, PAGE_W, PAGE_H, margin){
  const W = PAGE_W - margin * 2;
  const rowH = 22, headerH = 86;
  const H = headerH + entries.length * rowH + 16;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("xmlns", svgNS);
  svg.setAttribute("width", W); svg.setAttribute("height", H);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const styleEl = document.createElementNS(svgNS, "style");
  styleEl.textContent = "text{font-family:'Tajawal',sans-serif;}";
  svg.appendChild(styleEl);

  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("width", W); bg.setAttribute("height", H); bg.setAttribute("fill", "#FFFDF6");
  svg.appendChild(bg);

  const title = document.createElementNS(svgNS, "text");
  title.setAttribute("x", W/2); title.setAttribute("y", 34);
  title.setAttribute("text-anchor", "middle"); title.setAttribute("font-size", "20"); title.setAttribute("font-weight", "700");
  title.setAttribute("fill", "#0B3D2E");
  title.textContent = "🌳 سجل بيانات عائلة بني أسمل الحكمي";
  svg.appendChild(title);

  const sub = document.createElementNS(svgNS, "text");
  sub.setAttribute("x", W/2); sub.setAttribute("y", 55);
  sub.setAttribute("text-anchor", "middle"); sub.setAttribute("font-size", "12"); sub.setAttribute("fill", "#8a7a5a");
  sub.textContent = `تاريخ التصدير: ${dateStr}  —  عدد السجلات: ${entries.length}`;
  svg.appendChild(sub);

  const sep = document.createElementNS(svgNS, "line");
  sep.setAttribute("x1", 16); sep.setAttribute("x2", W-16); sep.setAttribute("y1", headerH-12); sep.setAttribute("y2", headerH-12);
  sep.setAttribute("stroke", "#C9A227"); sep.setAttribute("stroke-width", 1.5);
  svg.appendChild(sep);

  let y = headerH + 12;
  entries.forEach((e, idx) => {
    if (idx % 2 === 1){
      const rowBg = document.createElementNS(svgNS, "rect");
      rowBg.setAttribute("x", 10); rowBg.setAttribute("y", y - 15); rowBg.setAttribute("width", W-20); rowBg.setAttribute("height", rowH);
      rowBg.setAttribute("fill", "#F5EFDD");
      svg.appendChild(rowBg);
    }
    const nameT = document.createElementNS(svgNS, "text");
    nameT.setAttribute("x", W - 16); nameT.setAttribute("y", y);
    nameT.setAttribute("text-anchor", "end"); nameT.setAttribute("font-size", "12"); nameT.setAttribute("fill", "#333");
    nameT.textContent = e.name;
    svg.appendChild(nameT);
    const pageT = document.createElementNS(svgNS, "text");
    pageT.setAttribute("x", 16); pageT.setAttribute("y", y);
    pageT.setAttribute("text-anchor", "start"); pageT.setAttribute("font-size", "12"); pageT.setAttribute("font-weight", "700"); pageT.setAttribute("fill", "#8B4A1E");
    pageT.textContent = String(e.page);
    svg.appendChild(pageT);
    y += rowH;
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

  await addTallImagePaginated(pdf, imgData, margin, margin, W, H, PAGE_H, margin);
  return pdf.internal.getNumberOfPages(); // عدد صفحات الفهرس (أول محتوى بملف جديد)
}

async function exportAllRecordsPdf(){
  const btn = document.getElementById("exportAllRecordsBtn");
  const original = btn.textContent;
  btn.disabled = true;
  const filled = [];
  for (const n of root.descendants()){
    if (n.data.type === "female") continue; // العنصر النسائي لا يُصدَّر كملف مستقل
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
  const usableH = PAGE_H - margin * 2;

  // ---------- المرحلة 1: بناء كل البطاقات مسبقًا، ومحاكاة توضّعها لحساب رقم صفحة كل شخص ----------
  const blocks = [];
  for (let i = 0; i < filled.length; i++){
    btn.textContent = `جارِ التجهيز… (${i+1}/${filled.length})`;
    blocks.push(await buildPersonBlockDataUrl(filled[i].node, filled[i].data, blockWidth));
  }
  let simPage = 1, simY = margin, simFirst = true;
  const startPageOf = [];
  function simNearestSafeCut(cuts, maxAllowed, minAllowed){
    if (!cuts || !cuts.length) return maxAllowed;
    let best = null;
    for (const c of cuts){
      if (c <= maxAllowed && c >= minAllowed) best = c;
      else if (c > maxAllowed) break;
    }
    return best !== null ? best : maxAllowed;
  }
  blocks.forEach(({ H, safeCuts }) => {
    if (H > usableH){
      if (!simFirst) simPage++;
      let drawnPt = 0, pageCount = 0, firstSlice = true;
      const sliceGap = 20, pad = 12;
      while (drawnPt < H - 0.5){
        const maxContentH = firstSlice ? (PAGE_H - margin - simY - sliceGap - pad*2) : (PAGE_H - margin*2 - sliceGap*2 - pad*2);
        const idealEndAbs = drawnPt + Math.min(maxContentH, H - drawnPt);
        const isLastChunk = (H - drawnPt) <= maxContentH + 0.5;
        const safeEndAbs = isLastChunk ? idealEndAbs : simNearestSafeCut(safeCuts, idealEndAbs, drawnPt + 20);
        const contentH = Math.max(20, safeEndAbs - drawnPt);
        drawnPt += contentH;
        pageCount++; firstSlice = false;
      }
      startPageOf.push(simPage);
      simPage += pageCount;
      simY = margin;
    } else {
      if (simY + H > PAGE_H - margin){ simPage++; simY = margin; }
      else if (!simFirst){ simY += gap; }
      startPageOf.push(simPage);
      simY += H;
    }
    simFirst = false;
  });

  // ---------- المرحلة 2: صفحة/صفحات الغلاف والفهرس أولًا (بأرقام صفحات صحيحة من أول مرة) ----------
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  const dateStr = new Date().toLocaleDateString("ar-SA-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" });
  // نحسب عدد صفحات الفهرس مسبقًا (بلا رسم فعلي) — يعتمد فقط على عدد الأسماء،
  // فنعرف الإزاحة الصحيحة لأرقام الصفحات قبل رسم الفهرس مرة واحدة فقط بالنهاية.
  const INDEX_ROW_H = 22, INDEX_HEADER_H = 86;
  const indexH = INDEX_HEADER_H + filled.length * INDEX_ROW_H + 16;
  const indexUsableFirst = PAGE_H - margin - margin - 20;
  let indexPagesUsed = 1;
  if (indexH > indexUsableFirst){
    let remaining = indexH, pageCount = 0, firstSlice = true;
    while (remaining > 0.5){
      const maxSlice = firstSlice ? indexUsableFirst : (PAGE_H - margin*2 - 40);
      remaining -= Math.min(maxSlice, remaining);
      pageCount++; firstSlice = false;
    }
    indexPagesUsed = pageCount;
  }
  const finalEntries = filled.map((f, i) => ({ name: chainNames(f.node).slice(0, 4).join(" "), page: startPageOf[i] + indexPagesUsed }));
  await addIndexPages(pdf, finalEntries, dateStr, PAGE_W, PAGE_H, margin);

  // ---------- المرحلة 3: المحتوى الفعلي بعد صفحات الفهرس ----------
  pdf.addPage();
  let y = margin, firstBlock = true;
  for (let i = 0; i < blocks.length; i++){
    const { imgData, W, H, safeCuts } = blocks[i];
    if (H > usableH){
      if (!firstBlock){ pdf.addPage(); y = margin; }
      await addTallImagePaginated(pdf, imgData, margin, y, W, H, PAGE_H, margin, null, safeCuts);
      pdf.addPage(); y = margin;
    } else {
      if (!firstBlock){
        if (y + H > PAGE_H - margin){ pdf.addPage(); y = margin; }
        else y += gap;
      }
      pdf.addImage(imgData, "PNG", margin, y, W, H);
      y += H;
    }
    firstBlock = false;
  }

  addPdfFooterToAllPages(pdf, PAGE_W, PAGE_H, margin);
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
  exportOne: "تصدير فرد", exportAll: "تصدير الكل",
  myCard: "بطاقة معلوماتي", myNode: "بطاقة عقدتي", all: "جميع البطاقات"
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
    // ===== QR/SHARE FEATURE: صفحة "share" ليس لها view/edit/delete، فقط 3 مستويات
    // هرمية (myCard/myNode/all) — تُعرَض كصفوف extras فقط، بلا صف الأعمدة الفارغ =====
    if (page === "share"){
      const shareTitle = document.createElement("div");
      shareTitle.className = "perms-row";
      const shareLabel = document.createElement("span");
      shareLabel.className = "perms-row-label";
      shareLabel.textContent = cfg.label;
      shareTitle.appendChild(shareLabel);
      shareTitle.appendChild(document.createElement("span"));
      shareTitle.appendChild(document.createElement("span"));
      shareTitle.appendChild(document.createElement("span"));
      grid.appendChild(shareTitle);

      const shareOrder = ["myCard", "myNode", "all"];
      const shareCheckboxes = {};
      shareOrder.forEach(action => {
        const erow = document.createElement("div");
        erow.className = "perms-row";
        erow.style.paddingRight = "18px";
        const elabel = document.createElement("span");
        elabel.className = "perms-row-label";
        elabel.style.color = "#6a5c42"; elabel.style.fontSize = "14.5px"; elabel.style.fontWeight = "700";
        elabel.textContent = "↳ " + ACTION_LABELS[action];
        erow.appendChild(elabel);
        const cell = document.createElement("span");
        cell.className = "perms-cell";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!(editingPerms.share && editingPerms.share[action]);
        shareCheckboxes[action] = cb;
        cb.onchange = () => {
          editingPerms.share = editingPerms.share || {};
          editingPerms.share[action] = cb.checked;
          // هرمية تصاعدية: تفعيل "all" يفعّل "myNode" و"myCard"؛ تفعيل "myNode" يفعّل "myCard"
          if (cb.checked){
            const idx = shareOrder.indexOf(action);
            for (let i = 0; i < idx; i++){
              editingPerms.share[shareOrder[i]] = true;
              shareCheckboxes[shareOrder[i]].checked = true;
            }
          } else {
            // إلغاء مستوى يُلغي كل ما هو أعلى منه أيضًا (لا معنى لـ"all" بلا "myNode" مثلًا)
            const idx = shareOrder.indexOf(action);
            for (let i = idx + 1; i < shareOrder.length; i++){
              editingPerms.share[shareOrder[i]] = false;
              shareCheckboxes[shareOrder[i]].checked = false;
            }
          }
        };
        cell.appendChild(cb);
        erow.appendChild(cell);
        erow.appendChild(document.createElement("span"));
        erow.appendChild(document.createElement("span"));
        grid.appendChild(erow);
      });
      continue; // تخطَّ منطق الأعمدة الثلاثة العادي بالكامل لهذه الصفحة
    }
    // ===== END QR/SHARE FEATURE special-case =====

    const row = document.createElement("div");
    row.className = "perms-row";
    const isSub = cfg.label.trim().startsWith("↳");
    if (isSub) row.classList.add("perms-row-sub");

    const label = document.createElement("span");
    label.className = "perms-row-label";
    label.textContent = cfg.label;
    if (isSub){ label.style.paddingRight = "18px"; label.style.color = "#6a5636"; label.style.fontSize = "13px"; }
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

// ===== NOTIFICATION BADGES START (معزول تمامًا — احذف بأمان لإلغاء الميزة) =====
async function refreshAdminNotificationBadges(){
  if (!isAdminUser()) return;
  const usersBadge = document.getElementById("usersPendingBadge");
  const newsBadge = document.getElementById("newsPendingBadge");
  try{
    const usersSnap = await db.collection("users").where("status", "==", "pending").get();
    const count = usersSnap.size;
    if (usersBadge){
      usersBadge.textContent = count > 99 ? "99+" : String(count);
      usersBadge.style.display = count > 0 ? "flex" : "none";
    }
  }catch(e){ console.warn("تعذّر تحديث شارة المستخدمين المعلّقين:", e); }
  try{
    const newsSnap = await db.collection("posts").where("status", "==", "pending").get();
    const count = newsSnap.size;
    if (newsBadge){
      newsBadge.textContent = count > 99 ? "99+" : String(count);
      newsBadge.style.display = count > 0 ? "flex" : "none";
    }
  }catch(e){ console.warn("تعذّر تحديث شارة الأخبار المعلّقة:", e); }
}
// ===== NOTIFICATION BADGES END =====

async function refreshUsersAndPendingLists(){
  // يُسمح بالتحميل للأدمن أو للموثوق (trustedUsers.edit) — الموثوق يرى القائمة ويحظر/يفعّل فقط
  const _canManageUsers = isAdminUser() || can("trustedUsers", "edit");
  if (!_canManageUsers) return;
  if (isAdminUser()) refreshAdminNotificationBadges();

  // ===== QR SCAN RELATION FEATURE: مفتاح التفعيل العام (أدمن فقط) =====
  const qrToggleRow = document.getElementById("qrScanToggleRow");
  if (qrToggleRow){
    if (isAdminUser()){
      qrToggleRow.style.display = "flex";
      const qrCheckbox = document.getElementById("qrScanToggleCheckbox");
      try{
        const snap = await db.collection("meta").doc("siteSettings").get();
        qrCheckbox.checked = !!(snap.exists && snap.data().qrScanEnabled === true);
      }catch(e){ console.warn("تعذّر تحميل حالة مفتاح مسح QR:", e); }
      qrCheckbox.onchange = async () => {
        try{
          await db.collection("meta").doc("siteSettings").set({ qrScanEnabled: qrCheckbox.checked }, { merge: true });
          if (typeof refreshQrScanButtonVisibility === "function") refreshQrScanButtonVisibility();
        }catch(e){
          customAlert("تعذّر حفظ الإعداد: " + (e.message || e.code));
          qrCheckbox.checked = !qrCheckbox.checked; // تراجع بصري عند فشل الحفظ
        }
      };
    } else {
      qrToggleRow.style.display = "none";
    }
  }
  // ===== END QR SCAN RELATION FEATURE TOGGLE =====

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
              ${u.phone ? `<div class="user-card-sub">📱 ${escapeHtml(u.phone)}</div>` : ""}
              ${u.birthDate ? `<div class="user-card-sub">🎂 ${escapeHtml(u.birthDate)}</div>` : ""}
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
              // ===== نقل سنة الميلاد من التسجيل الذاتي لملف العقدة عند التفعيل (معزول، آمن) =====
              // فقط لو: يوجد نطاق مرتبط + يوجد تاريخ ميلاد بالتسجيل + العقدة ما عندها سنة محفوظة مسبقًا
              try{
                if (u.scopePersonId && u.birthDate){
                  const yearMatch = String(u.birthDate).match(/(\d{3,4})\s*هـ/);
                  if (yearMatch){
                    const hijriYear = yearMatch[1];
                    const infoRef = db.collection("personInfo").doc(firestorePersonInfoId(u.scopePersonId));
                    const infoSnap = await infoRef.get();
                    const existingYear = infoSnap.exists ? infoSnap.data().birthYear : "";
                    if (!existingYear){
                      await infoRef.set({ birthYear: hijriYear }, { merge: true });
                    }
                  }
                }
              }catch(e){ console.warn("تعذّر نقل سنة الميلاد لملف العقدة:", e); }
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

          // الصلاحيات — أدمن فقط (يُخفى عن الموثوق)
          if (isAdminUser()){
            const pb = document.createElement("button");
            pb.textContent = "🔑 الصلاحيات";
            pb.style.cssText = "background:#FFF3D6; color:#A67C00; border-color:#C9A227;";
            pb.onclick = () => openPermsEditor(uid, u);
            actions.appendChild(pb);
          }
        }

        // حذف — أدمن فقط (يُخفى عن الموثوق)
        if (isAdminUser()){
          const db_ = document.createElement("button");
          db_.textContent = "🗑️ حذف";
          db_.style.cssText = "background:#FDE7E7; color:#B3261E; border-color:#B3261E;";
          db_.onclick = async () => {
            if (!confirm(`حذف المستخدم "${u.displayName}"؟\nهذا يمنعه من الدخول، ولا يحذف إضافاته السابقة.`)) return;
            await db.collection("users").doc(uid).delete();
            refreshUsersAndPendingLists();
          };
          actions.appendChild(db_);
        }

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
    .translate(w/2 - sx(root)*initScale, (h - 50) - sy(root)*initScale)
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

  // فلتر بصري فقط: عقد "الأم" (female + wifeId) تبقى في البيانات (root) للجميع،
  // لكنها لا تُرسم لغير الأدمن (حجب الرسم لا البيانات). الأدمن يرى كل شيء.
  const _isAdminDraw = (typeof isAdminUser === "function") && isAdminUser();
  const _isDrawable = (n) => _isAdminDraw || !(n.data.type === "female" && n.data.wifeId);
  const drawNodes = root.descendants().filter(_isDrawable);
  const drawLinks = root.links().filter(l => _isDrawable(l.target) && _isDrawable(l.source));

  // روابط بخطوط قائمة الزوايا (مثل مخططات النسب التقليدية) — كل رابط عنصر مستقل مربوط ببياناته
  busYByParent = new Map();
  drawLinks.forEach(l => {
    if (!busYByParent.has(l.source)) {
      busYByParent.set(l.source, (sy(l.source) + sy(l.target)) / 2);
    }
  });

  g.selectAll("path.link")
    .data(drawLinks)
    .join("path")
    .attr("class", l => "link" + (l.target.data.type === "female" ? " to-female" : ""))
    .attr("d", l => {
      const px_ = sx(l.source), py = sy(l.source);
      const cx = sx(l.target), cy = sy(l.target);
      const busY = busYByParent.get(l.source);
      return `M${px_},${py} L${px_},${busY} L${cx},${busY} L${cx},${cy}`;
    });

  node = g.selectAll("g.node")
    .data(drawNodes)
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
  // ويُعامل الاختيار كضغطة بمساحة فاضية => تُغلق اللوحة وتُمسح بياناتها (يمنع إكمال خيوط النسب).
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

// علاقة b بصاحب الملف a، مختصرة إلى إحدى 6 كلمات فقط (لا تتجاوزها إطلاقًا):
// أخ / أخ لأم / عم / خال / ابن عم / ابن خال — أو نص فارغ إن لم تنطبق أي منها.
async function shortKinshipLabel(a, b){
  if (!b || a === b) return "";
  if (a.parent && b.parent){
    if (a.parent === b.parent) return "أخ";
    if (a.parent.parent && a.parent.parent === b.parent) return "عم";
    if (a.parent.parent && b.parent.parent && a.parent !== b.parent && a.parent.parent === b.parent.parent) return "ابن عم";
  }
  const infoA = await findMotherInfo(a);
  const infoB = await findMotherInfo(b);
  if (infoA && infoB && infoA.wifeId && infoB.wifeId && infoA.wifeId === infoB.wifeId && a.parent !== b.parent) return "أخ لأم";
  if (infoA && infoA.grandfatherNode && b.parent === infoA.grandfatherNode) return "خال";
  if (infoA && infoA.grandfatherNode && b.parent && b.parent.parent === infoA.grandfatherNode) return "ابن خال";
  return "";
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
  document.getElementById("panelsBackdrop")?.classList.remove("show");
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
    let uncleNamesForShare = [];
    if (data.mother && data.mother.fatherId){
      const mgf = root.descendants().find(n => personId(n) === data.mother.fatherId);
      if (mgf){
        const uncles = (mgf.children || []).filter(c => c.data.type !== "female");
        uncleNamesForShare = uncles.map(c => c.data.name);
        if (uncles.length) unclesHtml = `<div class="ip-row"><span class="ip-label">الأخوال</span><span class="ip-value">${uncles.map(c => nameChip(c.data.name, c)).join("، ")}</span></div>`;
      }
    }
    // الأعمام: إخوة الأب — بنفس منطق الأخوال تمامًا لكن بجهة الوالد
    let paternalUnclesHtml = "";
    let pUncleNamesForShare = [];
    if (d.parent && d.parent.parent){
      const pUncles = (d.parent.parent.children || []).filter(c => c.data.type !== "female" && c !== d.parent);
      pUncleNamesForShare = pUncles.map(c => c.data.name);
      if (pUncles.length) paternalUnclesHtml = `<div class="ip-row"><span class="ip-label">الأعمام</span><span class="ip-value">${pUncles.map(c => nameChip(c.data.name, c)).join("، ")}</span></div>`;
    }
    // زر تبديل بين "الأخوال" و"الأعمام" — يظهر فقط إن وُجد كلاهما فعليًا
    let unclesToggleHtml = "";
    if (unclesHtml && paternalUnclesHtml){
      unclesToggleHtml = `<div class="ip-uncles-toggle" id="ip-unclesToggle" data-mode="maternal">
          <button type="button" class="ip-uncles-opt active" data-choose="maternal">الأخوال</button>
          <button type="button" class="ip-uncles-opt" data-choose="paternal">الأعمام</button>
        </div>` +
        `<div id="ip-unclesMaternal">${unclesHtml}</div>` +
        `<div id="ip-unclesPaternal" style="display:none;">${paternalUnclesHtml}</div>`;
      unclesHtml = unclesToggleHtml; // يحل محل ما كان سيُدرَج مباشرة أدناه
      paternalUnclesHtml = ""; // مدمج أصلًا بالأعلى
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
    const multipleWives = insideWives.length > 1; // الترقيم يظهر فقط عند تعدد الزوجات
    const arNum = (n) => ["", "١","٢","٣","٤","٥","٦","٧","٨","٩","١٠"][n] || String(n);
    // اسم صاحب الملف — نبني سلسلتيه بالمقياسين (الكامل للجذر + المقصور عند join point)
    // حتى تُطابق أيًّا كان مقياس الطرف الآخر (زوج الأخت يُخزَّن بمقياس modalTitleChain المقصور).
    const ownFullChain = chainNames(d).join(" ");
    const ownShortChain = modalTitleChain(d).join(" ");
    const ownName = d.data.name;
    // فحص موحّد لمنع تكرار العديل من أي مصدر (يقارن الاسم بعد التطبيع)
    const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
    const adeelSeen = new Set();
    // "العديل لنفسه": يُطابق إذا ساوى الاسمَ المفرد، أو إحدى سلسلتيه، أو كان إحداهما بادئةً للآخر
    // (يغطي اختلاف طول السلسلة بين المقياس الكامل والمقصور).
    const isSelf = (name) => {
      const nm = norm(name);
      if (!nm) return false;
      const cands = [norm(ownName), norm(ownFullChain), norm(ownShortChain)];
      if (cands.includes(nm)) return true;
      // مقارنة بادئة: إن بدأت إحدى السلسلتين بالأخرى (بحدود كلمة) فهما لنفس الشخص
      return cands.some(c => c && (nm.startsWith(c + " ") || c.startsWith(nm + " ")));
    };
    const pushAdeel = (name, node) => {
      const nm = norm(name);
      if (!nm || isSelf(name) || adeelSeen.has(nm)) return; // لا العديل لنفسه، ولا تكرار
      adeelSeen.add(nm);
      sadahaList.push({ label: "النسيب(العديل)", name, node: node || null });
    };
    let wifeIdx = 0;
    for (const w of insideWives){
      wifeIdx++;
      const suffix = multipleWives ? " " + arNum(wifeIdx) : "";
      const wifeFatherNode = root.descendants().find(n => personId(n) === w.fatherId);
      if (!wifeFatherNode) continue;
      if (w.fatherName) sadahaList.push({ label: "والد الزوجة" + suffix, name: w.fatherChain || w.fatherName, node: wifeFatherNode });
      (wifeFatherNode.children || []).filter(c => c.data.type !== "female").forEach(b => {
        sadahaList.push({ label: "أخ زوجة" + suffix, name: chainNames(b).slice(0, 3).join(" بن "), node: b });
      });
      const sisters = (wifeFatherNode.children || []).filter(c => c.data.type === "female");
      for (const sis of sisters){
        const sisData = await loadPersonData(personId(sis));
        if (sisData.husband && !sisData.husbandDivorced){
          const sisHusbandNode = sisData.husbandId ? root.descendants().find(n => personId(n) === sisData.husbandId) : null;
          pushAdeel(sisData.husbandChain || sisData.husband, sisHusbandNode);
        }
      }
    }

    // النوع الخامس: العديل من زوجة خارج القبيلة — يُشتق من العدلاء المعتمدين (w.inlaws).
    const outsideWives = (data.wives || []).filter(w => w.type === "outside");
    for (const w of outsideWives){
      for (const inlaw of (w.inlaws || [])){
        if (!inlaw.confirmed || inlaw.divorced) continue;
        const inlawNode = root.descendants().find(n => personId(n) === inlaw.notaryId) || null;
        pushAdeel(inlaw.notaryChain || inlaw.notaryName, inlawNode);
      }
    }

    // النوع السادس: العديل المعكوس — رجل من القبيلة أضافك أنت كعديل له.
    for (const w of (data.wives || [])){
      if (!w.linkedOutsideWifeId || !w.sisterOfPersonId || w.divorced) continue;
      const srcNode = root.descendants().find(n => personId(n) === w.sisterOfPersonId) || null;
      const nm = srcNode ? chainNames(srcNode).slice(0, 3).join(" بن ") : w.sisterOfPersonName;
      pushAdeel(nm, srcNode);
    }

    for (const s of sadahaList){
      if (s.node){
        const rel = await shortKinshipLabel(d, s.node);
        if (rel) s.relSuffix = " / " + rel;
      }
    }
    const sadahaHtml = sadahaList.length
      ? `<div class="ip-row"><span class="ip-label">الأصهار</span></div>` +
        `<div class="ip-sadaha">${sadahaList.map(s => `<div class="ip-sadaha-item"><b>${s.label}:</b> ${nameChip(s.name, s.node)}${s.relSuffix ? `<span class="ip-rel-suffix">${escapeHtml(s.relSuffix)}</span>` : ""}</div>`).join("")}</div>`
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
    const sonNamesForCard = (d.children || []).filter(c => c.data.type !== "female").map(c => escapeHtml(c.data.name));
    if (sonNamesForCard.length){
      html += `<div class="ip-row"><span class="ip-label">أسماء الأبناء</span><span class="ip-value">${sonNamesForCard.join("، ")}</span></div>`;
    }
    html += unclesHtml;
    html += paternalUnclesHtml;
    html += samMotherHtml;
    html += sadahaHtml;

    // بطاقة الزوجة: زوجها وأبناؤها — مولّدة تلقائيًا من ملف الزوج (لا تُدخل يدويًا)
    if (d.data.type === "female"){
      if (data.husbandChain || data.husband){
        const hLabel = data.husbandDivorced ? "طليقها" : "زوجها";
        const hName = escapeHtml(data.husbandChain || data.husband);
        const hValue = data.husbandId
          ? `<span class="husband-link" data-husband-id="${escapeHtml(data.husbandId)}">${hName}</span>`
          : hName;
        html += `<div class="ip-row"><span class="ip-label">${hLabel}</span><span class="ip-value">${hValue}</span></div>`;
      }
      if (data.sons && data.sons.length){
        html += `<div class="ip-row"><span class="ip-label">أبناؤها</span></div>`;
        html += `<div class="ip-sadaha">${data.sons.map(s => `<div class="ip-sadaha-item">${escapeHtml(s)}</div>`).join("")}</div>`;
      }
    }
    if (data.bio) html += `<div class="ip-bio">${escapeHtml(data.bio).replace(/\n/g, "<br>")}</div>`;

    // ===== QR FEATURE START (معزول — احذف بأمان لإلغاء كل ميزات QR) =====
    window._shareCardData = {
      node: d, data, sonNames: sonNamesForCard, uncleNames: uncleNamesForShare,
      pUncleNames: pUncleNamesForShare, sadahaList, bio: data.bio || "", photo: data.photo || ""
    };
    if (canShareThisCard(d)){
      html += `<div class="ip-share-row">
          <button type="button" class="ip-share-btn" id="ip-qrBtn" title="QR">▦</button>
          <button type="button" class="ip-share-btn ip-share-btn--wa" id="ip-waBtn" title="مشاركة">📱</button>
        </div>`;
    }
    // ===== QR FEATURE END =====

    card.innerHTML = html;
  });
}

const nameTooltip = document.getElementById("nameTooltip");
document.getElementById("ip-card").addEventListener("click", (e) => {
  const qrBtn = e.target.closest("#ip-qrBtn");
  if (qrBtn){ e.stopPropagation(); openQrViewModal(window._shareCardData && window._shareCardData.node); return; }
  const waBtn = e.target.closest("#ip-waBtn");
  if (waBtn){ e.stopPropagation(); shareCardViaWhatsapp(); return; }
  const husbandLink = e.target.closest(".husband-link");
  if (husbandLink){
    e.stopPropagation();
    const hId = husbandLink.dataset.husbandId;
    const hNode = hId ? root.descendants().find(n => personId(n) === hId) : null;
    if (hNode) openInfoModal(hNode);
    return;
  }
  const toggleOpt = e.target.closest(".ip-uncles-opt");
  if (toggleOpt){
    e.stopPropagation();
    const wrap = document.getElementById("ip-unclesToggle");
    const maternalEl = document.getElementById("ip-unclesMaternal");
    const paternalEl = document.getElementById("ip-unclesPaternal");
    const choice = toggleOpt.dataset.choose;
    wrap.dataset.mode = choice;
    wrap.querySelectorAll(".ip-uncles-opt").forEach(b => b.classList.toggle("active", b.dataset.choose === choice));
    maternalEl.style.display = choice === "maternal" ? "" : "none";
    paternalEl.style.display = choice === "paternal" ? "" : "none";
    return;
  }
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

// ===== UNIFIED PANEL CLOSE BUTTON START (معزول — احذف هذا البلوك بأمان لإلغاء الميزة) =====
// يحقن زر ✕ إغلاق موحّد أعلى كل لوحة منبثقة، فبدل الاعتماد على الضغط على الأيقونة ثانيةً،
// يقدر المستخدم يغلق أي لوحة مباشرة. الزر بموضع ثابت أعلى يسار اللوحة.
// المحتوى الأصلي يُنقل لغلاف داخلي (.panel-scroll-inner) هو من يتمرّر، فيبقى الزر ثابتًا
// بزاويته دائمًا حتى لو ظهر شريط تمرير داخلي بالمحتوى الطويل.
bottomPanels.forEach(panel => {
  if (!panel || panel.querySelector(".panel-close-x")) return;
  const inner = document.createElement("div");
  inner.className = "panel-scroll-inner";
  while (panel.firstChild) inner.appendChild(panel.firstChild);
  panel.appendChild(inner);

  const x = document.createElement("button");
  x.className = "panel-close-x";
  x.type = "button";
  x.setAttribute("title", "إغلاق");
  x.textContent = "✕";
  x.onclick = (e) => {
    e.stopPropagation();
    panel.classList.remove("show");
    if (typeof clearPanelInputs === "function") clearPanelInputs(panel);
    const panelsBackdrop = document.getElementById("panelsBackdrop");
    if (panelsBackdrop) panelsBackdrop.classList.remove("show");
  };
  panel.insertBefore(x, panel.firstChild);
});
// ===== UNIFIED PANEL CLOSE BUTTON END =====

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
  // تعتيم الخلفية عند فتح أي من هذه اللوحات تحديدًا (يُستثنى: البحث، شجرتي، خيوط النسب)
  const panelsBackdrop = document.getElementById("panelsBackdrop");
  if (panelsBackdrop){
    const DIM_PANELS = ["ioPanel", "attachmentsPanel", "usersPanel", "recordsPanel", "designPanel", "bgPanel", "aiChatPanel"];
    panelsBackdrop.classList.toggle("show", willOpen && DIM_PANELS.includes(panel.id));
  }
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

// ---------- خيوط النسب ----------
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
usersToggle.onclick = () => {
  // الأدمن: كامل الصلاحيات · الموثوق (trustedUsers.edit): يشاهد المستخدمين + حظر/تفعيل فقط
  const isTrustedUsers = !isAdminUser() && can("trustedUsers", "edit");
  if (!isAdminUser() && !isTrustedUsers){ guard("users"); return; }
  openOnlyPanel(usersPanel);
  document.body.classList.toggle("trusted-users-mode", isTrustedUsers); // يخفي أدوات الأدمن الحصرية عبر CSS
  // إخفاء عناوين الأقسام الإدارية النصية (بلا id/for) في وضع الموثوق
  try{
    const panel = document.getElementById("usersPanel");
    panel.querySelectorAll("label.f-label").forEach(lb => {
      const t = (lb.textContent || "").trim();
      const adminLabel = t.includes("بانتظار الاعتماد") || t.includes("فحص بيانات");
      if (isTrustedUsers && adminLabel) lb.style.display = "none";
      else if (!isTrustedUsers) lb.style.display = "";
    });
  }catch(e){}
  refreshUsersAndPendingLists();
  if (isAdminUser()) loadInviteCodeUI();
};

// ===== SELF-REGISTER START (المرحلة 5) — إدارة رمز الدعوة من لوحة الأدمن =====
async function loadInviteCodeUI(){
  const input = document.getElementById("inviteCodeInput");
  const statusEl = document.getElementById("inviteCodeStatus");
  if (!input) return;
  try{
    const snap = await db.collection("meta").doc("registrationSettings").get();
    input.value = snap.exists ? (snap.data().inviteCode || "") : "";
  }catch(e){
    statusEl.textContent = "تعذّر تحميل الرمز الحالي";
  }
}
const inviteCodeSaveBtn = document.getElementById("inviteCodeSaveBtn");
if (inviteCodeSaveBtn){
  inviteCodeSaveBtn.onclick = async function(){
    const input = document.getElementById("inviteCodeInput");
    const statusEl = document.getElementById("inviteCodeStatus");
    const code = input.value.trim();
    if (!code){ statusEl.textContent = "أدخل رمزًا صحيحًا"; return; }
    statusEl.textContent = "جارِ الحفظ…";
    try{
      await db.collection("meta").doc("registrationSettings").set({ inviteCode: code }, { merge: true });
      statusEl.textContent = "تم الحفظ ✓";
    }catch(e){
      statusEl.textContent = "تعذّر الحفظ: " + (e.message || e.code);
    }
  };
}

// ===== WHATSAPP INVITE START (معزول تمامًا — احذف بأمان لإلغاء الميزة) =====
const inviteWhatsappBtn = document.getElementById("inviteWhatsappBtn");
if (inviteWhatsappBtn){
  inviteWhatsappBtn.onclick = async function(){
    const statusEl = document.getElementById("inviteCodeStatus");
    try{
      const snap = await db.collection("meta").doc("registrationSettings").get();
      const code = snap.exists ? (snap.data().inviteCode || "") : "";
      if (!code){ statusEl.textContent = "لا يوجد رمز دعوة محفوظ حاليًا"; return; }
      const siteUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, "");
      const msg = `🌳 دعوة للانضمام لشجرة بني أسمل الحكمي\n\n`
                + `سجّل حسابك من الرابط:\n${siteUrl}\n\n`
                + `رمز الدعوة: ${code}`;
      window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
    }catch(e){
      statusEl.textContent = "تعذّر تجهيز الدعوة: " + (e.message || e.code);
    }
  };
}
// ===== WHATSAPP INVITE END =====
// ===== SELF-REGISTER END =====

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
  // ai.edit = يكتب ويدردش · بلا edit (مشاهدة فقط) = يرى المحادثة والحقل معطّل
  const canChat = isAdminUser() || can("ai", "edit");
  aiChatInput.disabled = !canChat;
  aiChatSend.disabled = !canChat;
  aiChatInput.placeholder = canChat
    ? "اسأل عن أي شخص أو علاقة في الشجرة..."
    : "المشاهدة فقط — لا تملك صلاحية الكتابة والدردشة";
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

// ===== QR SCAN RELATION FEATURE START (معزول — احذف بأمان لإلغاء الميزة) =====
// يجمع قوائم أقارب شخص (أبناء/أعمام/أخوال/أصهار مبسَّطة) لاستخدامها باكتشاف الأسماء المشتركة
// يجمع قوائم أقارب شخص (أبناء/أعمام/أخوال/أصهار) + خريطة تسمية كل صهر (لاستخدامها
// حين لا توجد علاقة دم محسوبة، بدل الاكتفاء بكلمة "قريب" العامة).
async function gatherRelativesForCompare(node){
  const sons = (node.children || []).filter(c => c.data.type !== "female");
  let uncles = [];
  const data = await loadPersonData(personId(node));
  if (data.mother && data.mother.fatherId){
    const mgf = root.descendants().find(n => personId(n) === data.mother.fatherId);
    if (mgf) uncles = (mgf.children || []).filter(c => c.data.type !== "female");
  }
  let pUncles = [];
  if (node.parent && node.parent.parent){
    pUncles = (node.parent.parent.children || []).filter(c => c.data.type !== "female" && c !== node.parent);
  }
  const sadaha = [];
  const sadahaLabels = new Map(); // node -> "والد الزوجة" | "أخ زوجة" | "النسيب"
  const insideWives = (data.wives || []).filter(w => w.type === "inside" && w.fatherId);
  for (const w of insideWives){
    const wifeFatherNode = root.descendants().find(n => personId(n) === w.fatherId);
    if (!wifeFatherNode) continue;
    sadaha.push(wifeFatherNode); sadahaLabels.set(wifeFatherNode, "والد الزوجة");
    (wifeFatherNode.children || []).filter(c => c.data.type !== "female").forEach(b => {
      sadaha.push(b); sadahaLabels.set(b, "أخ زوجة");
    });
  }
  return { sons, uncles, pUncles, sadaha, sadahaLabels };
}

// يحوّل كلمة القرابة المختصرة (أو تسمية الصهر) لصيغة عربية صحيحة:
// mode="you" → صيغة المخاطَب ("عمك")، أو اسم — صيغة الغائب مضافة لاسمه ("عم فلان")
function kinshipPhrase(word, mode){
  const bloodMap = {
    "أخ":        { you: "أخوك",        other: (n) => `أخو ${n}` },
    "أخ لأم":    { you: "أخوك لأمك",   other: (n) => `أخو ${n} لأمه` },
    "عم":        { you: "عمك",         other: (n) => `عم ${n}` },
    "خال":       { you: "خالك",        other: (n) => `خال ${n}` },
    "ابن عم":    { you: "ابن عمك",     other: (n) => `ابن عم ${n}` },
    "ابن خال":   { you: "ابن خالك",    other: (n) => `ابن خال ${n}` },
    "والد الزوجة": { you: "والد زوجتك", other: (n) => `والد زوجة ${n}` },
    "أخ زوجة":   { you: "أخو زوجتك",   other: (n) => `أخو زوجة ${n}` }
  };
  const entry = bloodMap[word];
  if (!entry) return "";
  return mode === "you" ? entry.you : entry.other(mode);
}

// يقارن قوائم أقارب شخصين، ويستخرج الأسماء المشتركة (بنفس العقدة الحقيقية) مع
// علاقة كل منهما بالطرفين — يفحص علاقات الدم أولًا، ثم الأصهار كاحتياط.
async function findSharedNames(nodeA, nodeB){
  const [ra, rb] = await Promise.all([gatherRelativesForCompare(nodeA), gatherRelativesForCompare(nodeB)]);
  const allA = [...ra.sons, ...ra.uncles, ...ra.pUncles, ...ra.sadaha];
  const allB = [...rb.sons, ...rb.uncles, ...rb.pUncles, ...rb.sadaha];
  const setB = new Set(allB);
  const shared = allA.filter(n => setB.has(n) && n !== nodeA && n !== nodeB);
  const uniqueShared = [...new Set(shared)];
  const bName = chainNames(nodeB).slice(0, 2).join(" ");
  const out = [];
  for (const n of uniqueShared){
    const bloodA = await shortKinshipLabel(nodeA, n);
    const bloodB = await shortKinshipLabel(nodeB, n);
    const wordA = bloodA || ra.sadahaLabels.get(n) || "";
    const wordB = bloodB || rb.sadahaLabels.get(n) || "";
    const phraseA = wordA ? kinshipPhrase(wordA, "you") : "";
    const phraseB = wordB ? kinshipPhrase(wordB, bName) : "";
    out.push({ name: chainNames(n).slice(0, 3).join(" بن "), phraseA, phraseB });
  }
  return out;
}

// فتح الكاميرا وقراءة رمز QR، ثم حساب القرابة بينه وبين عقدة المستخدم الحالي
async function openQrScanForRelation(){
  if (typeof jsQR !== "function"){
    customAlert("تعذّر تحميل مكتبة قراءة QR (jsQR) — تحقّق من اتصالك بالإنترنت وأعد المحاولة.");
    return;
  }
  const u = window.authUser;
  if (!u || !u.scopePersonId){ customAlert("يجب أن يكون حسابك مرتبطًا بعقدة بالشجرة لاستخدام هذه الميزة."); return; }
  const myNode = root.descendants().find(n => n.data.id === u.scopePersonId);
  if (!myNode){ customAlert("تعذّر تحديد عقدتك بالشجرة."); return; }

  let modal = document.getElementById("qrScanModal");
  if (!modal){
    modal = document.createElement("div");
    modal.id = "qrScanModal";
    modal.style.cssText = "position:fixed; inset:0; z-index:9700; background:rgba(0,0,0,.85); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; padding:16px;";
    modal.innerHTML = `<video id="qrScanVideo" style="width:min(320px,88vw); border-radius:14px;" playsinline muted></video>
        <div style="color:#fff; font-family:'Tajawal',sans-serif; font-size:13px;">وجّه الكاميرا لرمز QR الخاص بالشخص</div>
        <div style="display:flex; gap:10px;">
          <button id="qrScanCloseBtn" style="background:#8B1E1E; color:#fff; border:none; padding:9px 22px; border-radius:12px; font-family:'Tajawal',sans-serif; font-size:13px; cursor:pointer;">إلغاء</button>
          <label id="qrScanGalleryBtn" style="background:#F1E9D8; color:#3a3020; border:none; padding:9px 22px; border-radius:12px; font-family:'Tajawal',sans-serif; font-size:13px; cursor:pointer;">
            📁 اختر من المعرض
            <input type="file" accept="image/*" id="qrScanFileInput" style="display:none;">
          </label>
        </div>
        <div id="qrScanFileError" style="color:#ffb3b3; font-family:'Tajawal',sans-serif; font-size:12px; display:none;">لم يُعثَر على رمز QR واضح بالصورة — جرّب صورة أخرى أو أقرب.</div>`;
    document.body.appendChild(modal);
  }
  modal.style.display = "flex";
  document.getElementById("qrScanFileError").style.display = "none";
  const video = document.getElementById("qrScanVideo");
  video.style.display = "";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let stream = null, stopped = false;

  function stopScan(){
    stopped = true;
    if (stream) stream.getTracks().forEach(t => t.stop());
    modal.style.display = "none";
  }
  document.getElementById("qrScanCloseBtn").onclick = stopScan;

  // بديل: اختيار صورة جاهزة من المعرض بدل الاعتماد على الكاميرا الحية فقط
  const fileInput = document.getElementById("qrScanFileInput");
  fileInput.value = "";
  fileInput.onchange = () => {
    const file = fileInput.files[0];
    if (!file) return;
    const errEl = document.getElementById("qrScanFileError");
    errEl.style.display = "none";
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const cctx = c.getContext("2d");
      cctx.drawImage(img, 0, 0);
      const imageData = cctx.getImageData(0, 0, c.width, c.height);
      const code = typeof jsQR === "function" ? jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" }) : null;
      URL.revokeObjectURL(img.src);
      if (code && code.data){
        stopScan();
        handleScannedQrData(code.data, myNode);
      } else {
        errEl.style.display = "block";
      }
    };
    img.src = URL.createObjectURL(file);
  };

  try{
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  }catch(e){
    customAlert("تعذّر تشغيل الكاميرا: " + (e.message || e.name) + " — يمكنك استخدام \"اختر من المعرض\" بدلًا من ذلك.");
    video.style.display = "none";
    return;
  }
  video.srcObject = stream;
  await video.play();

  function tick(){
    if (stopped) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA){
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = typeof jsQR === "function" ? jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" }) : null;
      if (code && code.data){
        stopScan();
        handleScannedQrData(code.data, myNode);
        return;
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

async function handleScannedQrData(text, myNode){
  let scannedId = null;
  try{
    const u = new URL(text);
    scannedId = u.searchParams.get("viewInfo") || u.searchParams.get("openInfo");
  }catch(e){ /* ليس رابطًا صالحًا */ }
  if (!scannedId){ customAlert("الرمز الممسوح ليس رمز شخص صالحًا بهذا الموقع."); return; }
  const pb = root.descendants().find(n => n.data.id === scannedId);
  if (!pb){ customAlert("تعذّر إيجاد هذا الشخص بالشجرة الحالية."); return; }

  document.getElementById("relA").value = chainNames(myNode).join(" ");
  document.getElementById("relB").value = chainNames(pb).join(" ");
  const resultBox = document.getElementById("relResult");

  const notes = myNode !== pb ? await extraRelationNotes(myNode, pb) : [];
  const notesHtml = notes.map(n => `<div class="rel-title" style="margin-top:8px">${escapeHtml(n)}</div>`).join("");
  const rep = buildReport(myNode, pb);
  let baseHtml;
  if (!rep){
    baseHtml = notes.length ? notesHtml : `<div class="rel-note">لا توجد علاقة نسب مشتركة بينكما بالشجرة الحالية.</div>`;
  } else if (rep.same){
    baseHtml = `<div class="rel-title">نفس الشخص</div>`;
  } else {
    baseHtml = renderChainGrid(rep) + renderSimpleRelation(rep) + notesHtml;
  }

  const shared = await findSharedNames(myNode, pb);
  let sharedHtml = "";
  if (shared.length){
    sharedHtml = `<div class="rel-title" style="margin-top:16px; font-size:15px;">🔗 أسماء مشتركة بينكما</div>` +
      shared.map(s => {
        const partA = s.phraseA ? `<span class="rel-shared-badge">${escapeHtml(s.phraseA)}</span>` : "";
        const partB = s.phraseB ? `<span class="rel-shared-badge">${escapeHtml(s.phraseB)}</span>` : "";
        const sep = (partA && partB) ? " و" : "";
        return `<div class="rel-shared-item"><b>${escapeHtml(s.name)}</b> هو ${partA}${sep}${partB}.</div>`;
      }).join("");
  }

  resultBox.innerHTML = baseHtml + sharedHtml;
  if (rep && !rep.same) highlightPath(myNode, pb);
}

// إظهار/إخفاء زر المسح حسب المفتاح العام (أدمن) + استبعاد الضيوف دومًا
async function refreshQrScanButtonVisibility(){
  const btn = document.getElementById("relQrScanBtn");
  if (!btn) return;
  if (!window.authUser || window.authUser.isGuest){ btn.style.display = "none"; return; }
  try{
    const snap = await db.collection("meta").doc("siteSettings").get();
    const enabled = snap.exists && snap.data().qrScanEnabled === true;
    btn.style.display = enabled ? "block" : "none";
  }catch(e){ btn.style.display = "none"; }
}
document.getElementById("relQrScanBtn").onclick = openQrScanForRelation;
// ===== QR SCAN RELATION FEATURE END =====

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
      document.getElementById("f-photoRemove").style.display = "inline-block";
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});
document.getElementById("f-photoRemove").onclick = () => {
  photoDataUrl = "";
  document.getElementById("photoPreviewWrap").innerHTML = "";
  document.getElementById("f-photo").value = "";
  document.getElementById("f-photoRemove").style.display = "none";
};

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
  document.getElementById("panelsBackdrop")?.classList.remove("show");
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
  document.getElementById("f-photoRemove").style.display = photoDataUrl ? "inline-block" : "none";
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
    const canDeleteThis = k.data.manuallyAdded && isAdminUser();
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
   وجميع تصاميم الموقع القائمة (الافتراضي والمستقبلي) بشكل متناسب.
   يُحفظ الاختيار بمتصفح كل مستخدم (localStorage).

   الآلية: transform:scale() على #appScaleWrapper (بدل body.style.zoom القديمة).
   هذا لا يُغيّر صناديق التخطيط ولا حسابات vh/dvh/position:fixed إطلاقًا —
   فقط "يرسم" الواجهة بحجم مختلف بصريًا، فتبقى كل اللوحات والشجرة بمكانها
   الصحيح تمامًا مهما تغيّر مستوى التكبير.
   ===================================================================== */
(function(){
  const MIN_SCALE = 0.8, MAX_SCALE = 1.6, STEP = 0.2;
  let uiScale = parseFloat(localStorage.getItem("uiScale") || "1");
  if (isNaN(uiScale)) uiScale = 1;

  function applyUiScale(){
    const wrapper = document.getElementById("appScaleWrapper");
    if (wrapper) wrapper.style.transform = (uiScale === 1) ? "" : `scale(${uiScale})`;
    localStorage.setItem("uiScale", String(uiScale));
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
