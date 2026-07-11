/* Our Journey — 提醒排程（GitHub Actions 版）
   由 GitHub Actions 每 5 分鐘跑一次：
   (1) 手動提醒 reminders：到時間就發
   (2) 行程景點：有填時間的，開始前 15 分鐘發（依 reminder_tz / 每個旅程 tz 當地時區換算）
   對象：所有已開啟通知的成員（pushtoken:* 的所有 token）
   已發過的記在 reminder_log，避免重複。
*/
const admin = require("firebase-admin");
const { DateTime } = require("luxon");

const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

const COL = "familydata";
const LEAD_MIN = 15;                 // 景點提前幾分鐘
const GRACE_MS = 60 * 60 * 1000;     // 超過 60 分鐘沒發的就不補（避免延遲後狂補）

async function getVal(id) {
  const s = await db.collection(COL).doc(id).get();
  if (s.exists && s.data() && s.data().value != null) {
    try { return JSON.parse(s.data().value); } catch (e) { return null; }
  }
  return null;
}

(async () => {
  const now = Date.now();
  const sent = (await getVal("reminder_log")) || {};
  const tzSnap = await db.collection(COL).doc("reminder_tz").get();
  const tz = (tzSnap.exists && tzSnap.data() && tzSnap.data().value) ? tzSnap.data().value : "Asia/Taipei";

  const toSend = [];
  const newlySent = {};

  // (1) 手動提醒（絕對時間 ms）
  const reminders = (await getVal("reminders")) || [];
  for (const r of reminders) {
    if (!r || r.done || !r.at) continue;
    const key = "m:" + r.id;
    if (sent[key]) continue;
    if (now >= r.at && now - r.at < GRACE_MS) {
      toSend.push({ title: "⏰ " + (r.title || "提醒"), body: DateTime.fromMillis(r.at).setZone(tz).toFormat("MM/dd HH:mm") });
      newlySent[key] = now;
    }
  }

  // (2) 行程景點：開始前 15 分鐘
  const trips = (await getVal("trips")) || [];
  for (const trip of trips) {
    if (!trip) continue;
    const tripTz = trip.tz || tz;
    const dayDate = {};
    (trip.days || []).forEach((d) => { if (d && d.n != null) dayDate[d.n] = d.date; });
    for (const st of (trip.stops || [])) {
      if (!st || !st.time || !st.dayN) continue;
      const date = dayDate[st.dayN];
      if (!date) continue;
      const dt = DateTime.fromISO(date + "T" + st.time, { zone: tripTz });
      if (!dt.isValid) continue;
      const startMs = dt.toMillis();
      const fireMs = startMs - LEAD_MIN * 60 * 1000;
      const key = "s:" + trip.id + ":" + st.id;
      if (sent[key]) continue;
      if (now >= fireMs && now < startMs && now - fireMs < GRACE_MS) {
        toSend.push({ title: "📍 " + LEAD_MIN + " 分鐘後：" + (st.name || "行程"), body: (trip.name || "") + " · " + st.time });
        newlySent[key] = now;
      }
    }
  }

  if (!toSend.length) { console.log("目前沒有到期的提醒"); return; }

  // 收集所有 token
  const tokSnap = await db.collection(COL)
    .where("key", ">=", "pushtoken:")
    .where("key", "<", "pushtoken:\uf8ff")
    .get();
  let tokens = [];
  tokSnap.forEach((d) => {
    const v = d.data() && d.data().value;
    if (!v) return;
    try { const o = JSON.parse(v); (o.tokens || []).forEach((t) => tokens.push(t)); } catch (e) {}
  });
  tokens = Array.from(new Set(tokens));

  if (tokens.length) {
    for (const msg of toSend) {
      try {
        const res = await admin.messaging().sendEachForMulticast({
          tokens,
          notification: { title: msg.title, body: msg.body },
          webpush: { fcmOptions: { link: "/" } },
        });
        console.log("已發送:", msg.title, "成功", res.successCount, "失敗", res.failureCount);
      } catch (e) { console.error("send error", e); }
    }
  } else {
    console.log("尚無任何推播 token（還沒有人開啟通知）");
  }

  // 更新已發紀錄（保留 7 天內）
  Object.assign(sent, newlySent);
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  for (const k of Object.keys(sent)) if (sent[k] < cutoff) delete sent[k];
  await db.collection(COL).doc("reminder_log").set({ key: "reminder_log", value: JSON.stringify(sent) });
  console.log("完成，新發送", Object.keys(newlySent).length, "則");
})().catch((e) => { console.error(e); process.exit(1); });
