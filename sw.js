// Service Worker بسيط جدًا — فقط لتحقيق شرط "قابل للتثبيت" (installability) لمتصفحات PWA/أندرويد.
// عمدًا بلا أي تخزين مؤقت (cache) للملفات، تفاديًا لأي تعقيد قد يعرض تحديثات الموقع
// المستقبلية لخطر ظهور نسخة قديمة مخزَّنة عند المستخدمين. يمكن تطوير التخزين المؤقت لاحقًا
// إذا احتجنا عمل الموقع بدون إنترنت (Offline)، لكن هذا ليس مطلوبًا حاليًا.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// بلا حدث "fetch" — يعني كل الطلبات تذهب للشبكة مباشرة كالمعتاد، بلا أي تدخل من Service Worker.
