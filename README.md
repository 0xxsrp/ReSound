# ReSound 🎧

Desktop soundboard for Discord — play audio through speakers while routing it to a virtual cable for voice chat.

ساوندبورد سطح مكتب لديسكورد — شغّل الصوت على السماعات وحوّله لكابل افتراضي للشات الصوتي.

---

## Features / المميزات

- **Dual Audio Output** — Play through speakers + virtual cable simultaneously / مخرجين صوت في نفس الوقت
- **Hotkeys** — Assign global keyboard shortcuts / اختصارات لوحة مفاتيح عالمية
- **Queue** — Build a playlist and auto-play / قائمة تشغيل تلقائية
- **Favorites** — Star your most-used sounds / نجمة للأصوات المفضلة
- **Multi-select** — Batch play, delete, move, clear hotkeys / تحديد متعدد
- **Categories** — Organize sounds into folders / تنظيم الأصوات في مجلدات
- **Drag & Drop** — Upload files or move between categories / سحب وإفلات
- **Dark/Light theme** / ثيم داكن وثيم فاتح
- **Auto-update** — Checks GitHub for new releases / تحديث تلقائي
- **Tray** — Minimize to system tray / تصغير للصينية

## Install / التثبيت

Download the latest setup from **[Releases](https://github.com/0xxsrp/ReSound/releases)**.

حمّل النسخة الأخيرة من صفحة الإصدارات.

### Requirements / المتطلبات

- Windows 10+
- [VB-Cable](https://vb-audio.com/Cable/) (or any virtual audio cable) for mic routing

## Development / التطوير

```bash
npm install
npm run start     # Launch / تشغيل
npm run build     # Package / بناء
npm run publish   # Build + upload to GitHub / بناء ورفع
```

## Tech Stack / التقنيات

- **Electron** — Desktop framework
- **Web Audio API** — Dual playback contexts
- **electron-updater** — Auto updates
- **electron-builder** — Packaging & distribution
