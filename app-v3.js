// ============================================
// Del Rio Parking Enforcement PWA - v2.0
// ============================================

// --- Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyAo8THlHjdaA-B5DoZgAg4xUySy85MYzOo",
  authDomain: "del-rio-parking.firebaseapp.com",
  projectId: "del-rio-parking",
  storageBucket: "del-rio-parking.firebasestorage.app",
  messagingSenderId: "32189559016",
  appId: "1:32189559016:web:758d96678f68715c64595d"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const FIRESTORE_COLLECTION = "infractions";

// Anonymous auth
// Wait for auth before any Firestore ops
let authReady = false;
auth.signInAnonymously()
  .then(() => { authReady = true; console.log("Auth ready"); processSyncQueue(); })
  .catch(e => console.error("Auth failed:", e));
auth.onAuthStateChanged(user => {
  if (user) { authReady = true; processSyncQueue(); }
});

// --- IndexedDB Setup ---
const DB_NAME = "DelRioParking";
const DB_VERSION = 1;
const STORE_NAME = "infractions";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
        store.createIndex("tenant", "tenant", { unique: false });
        store.createIndex("type", "type", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbAdd(data) {
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(data);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}

function dbGetAll() {
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
}

function dbDelete(id) {
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}

function dbClear() {
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}

function dbUpdate(data) {
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(data);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}

// --- Tenants ---
const DEFAULT_TENANTS = [
  { space: 1, name: "Barbería" },
  { space: 2, name: "Royal Lab" },
  { space: 3, name: "Sakura" },
  { space: 4, name: "SuperCakes" },
  { space: 5, name: "Dentista" },
  { space: 6, name: "Mexcal" },
  { space: 7, name: "Laboratorio" },
  { space: 8, name: "Medikos" },
  { space: 9, name: "Butcher's" },
  { space: 10, name: "Bendecidos" },
  { space: 11, name: "T Shirt" },
  { space: 12, name: "Dra. Karla Amaral" },
  { space: 13, name: "Therapy Lab" },
  { space: 14, name: "My Look" },
  { space: 15, name: "Optica" },
  { space: 16, name: "Artesano" },
  { space: 17, name: "Leaf Lab" },
  { space: 18, name: "Sorrel" },
  { space: 19, name: "Buenacoop" },
];

function getTenants() {
  const stored = localStorage.getItem("delrio_tenants");
  return stored ? JSON.parse(stored) : DEFAULT_TENANTS;
}

function saveTenants(tenants) {
  localStorage.setItem("delrio_tenants", JSON.stringify(tenants));
}

function populateTenantSelect() {
  const sel = document.getElementById("tenantSelect");
  const tenants = getTenants();
  sel.innerHTML = '<option value="">— Select Space —</option>';
  tenants.forEach(t => {
    const opt = document.createElement("option");
    opt.value = `${t.space}: ${t.name}`;
    opt.textContent = `Space ${t.space} — ${t.name}`;
    sel.appendChild(opt);
  });
}

function populateOfficerSelect() {
  const sel = document.getElementById("officerSelect");
  sel.innerHTML = '<option value="">— Clock In —</option>';
  OFFICERS.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
  // Restore today's officer
  const saved = JSON.parse(localStorage.getItem("delrio_today_officer") || "{}");
  const today = new Date().toISOString().slice(0, 10);
  if (saved.date === today) {
    sel.value = saved.name;
  }
}

document.getElementById("officerSelect").addEventListener("change", function () {
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem("delrio_today_officer", JSON.stringify({ date: today, name: this.value }));
});

// --- Officers ---
const OFFICERS = [
  "Héctor J. Prieto Pacheco",
  "Nashalee Ojeda Ocasio",
  "Felix E. Aponte Sanchez",
  "Jose R. Cintrón Meléndez",
  "Jorge D. Moyett Dávila",
  "Andy J. Aponte Sánchez"
];

function getOfficer() {
  return JSON.parse(localStorage.getItem("delrio_officer") || "{}");
}

function saveOfficer(info) {
  localStorage.setItem("delrio_officer", JSON.stringify(info));
}

// --- Service Worker ---
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw-v3.js")
    .then(reg => {
      console.log("SW registered");
      // Force immediate update check on load
      reg.update();
      // Auto-update: check every 30 seconds
      setInterval(() => reg.update(), 30000);
      // When new SW activates, reload automatically
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "activated") {
            window.location.reload();
          }
        });
      });
    })
    .catch(err => console.error("SW error", err));
}

// --- Sync Queue ---
function getSyncQueue() {
  try { return JSON.parse(localStorage.getItem("syncQueue") || "[]"); } catch { return []; }
}
function queueSync(id) {
  const q = getSyncQueue();
  if (!q.includes(id)) { q.push(id); localStorage.setItem("syncQueue", JSON.stringify(q)); }
}
function removeFromSyncQueue(id) {
  const q = getSyncQueue().filter(x => x !== id);
  localStorage.setItem("syncQueue", JSON.stringify(q));
}
async function processSyncQueue() {
  const q = getSyncQueue();
  if (q.length === 0) return;
  console.log(`Processing ${q.length} pending syncs...`);
  for (const id of q) {
    try {
      const all = await dbGetAll();
      const inf = all.find(i => i.id === id);
      if (inf) {
        const syncData = { ...inf };
        delete syncData.photos;
        await db.collection(FIRESTORE_COLLECTION).doc(id).set(syncData);
      }
      removeFromSyncQueue(id);
    } catch (e) { console.error(`Sync failed for ${id}:`, e); }
  }
  console.log("Sync queue processed");
}

// Auto-sync when online
window.addEventListener("online", () => {
  console.log("Back online, processing sync queue...");
  processSyncQueue();
});
// Also try on load if online
if (navigator.onLine) processSyncQueue();

// --- Full Sync: push ALL local items to Firestore ---
async function fullSyncToFirestore() {
  if (!authReady || !navigator.onLine) return;
  try {
    const local = await dbGetAll();
    for (const inf of local) {
      try {
        const syncData = { ...inf };
        delete syncData.photos;
        await db.collection(FIRESTORE_COLLECTION).doc(inf.id).set(syncData, { merge: true });
      } catch (e) { console.error(`Full sync failed for ${inf.id}:`, e); }
    }
    // Clear sync queue since everything is synced now
    localStorage.setItem("syncQueue", JSON.stringify([]));
    console.log(`Full sync complete: ${local.length} items pushed`);
  } catch (e) { console.error("Full sync error:", e); }
}

// Retry pending syncs every 30 seconds
setInterval(() => {
  const q = getSyncQueue();
  if (q.length > 0 && navigator.onLine) processSyncQueue();
}, 30000);

// Full sync every 2 minutes
setInterval(() => { fullSyncToFirestore(); }, 120000);

// Full sync on load after auth is ready
auth.onAuthStateChanged(() => { setTimeout(fullSyncToFirestore, 3000); });

// --- State ---
let currentPhotos = [];
let currentInfractions = [];
let currentDetailId = null;

// --- Tabs ---
document.querySelectorAll("nav .tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav .tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "history") loadHistory();
    if (btn.dataset.tab === "status") loadStatusTab();
    if (btn.dataset.tab === "settings") { if (settingsUnlocked) loadSettings(); }
  });
});

// --- Date/Time Auto Fill ---
function setDefaultDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  document.getElementById("dateInputDate").value = local.toISOString().slice(0, 10);
  document.getElementById("dateInputTime").value = local.toISOString().slice(11, 16);
}
setDefaultDate();

// --- License Plate Uppercase ---
document.getElementById("plateInput").addEventListener("input", function () {
  this.value = this.value.toUpperCase();
});

// --- Photo Capture ---
document.getElementById("cameraBtn").addEventListener("click", () => {
  const input = document.getElementById("photoInput");
  input.setAttribute("capture", "environment");
  input.click();
});

document.getElementById("uploadBtn").addEventListener("click", () => {
  const input = document.getElementById("photoInput");
  input.removeAttribute("capture");
  input.click();
});

document.getElementById("photoInput").addEventListener("change", function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    // Resize image to save space
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX = 800;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = (h / w) * MAX; w = MAX; }
        else { w = (w / h) * MAX; h = MAX; }
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      currentPhotos.push(dataUrl);
      renderPhotoPreview();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  this.value = "";
});

function renderPhotoPreview() {
  const container = document.getElementById("photoPreview");
  container.innerHTML = "";
  currentPhotos.forEach((src, i) => {
    const img = document.createElement("img");
    img.src = src;
    img.title = "Click to remove";
    img.addEventListener("click", () => {
      currentPhotos.splice(i, 1);
      renderPhotoPreview();
    });
    container.appendChild(img);
  });
}

// --- GPS ---
let currentGPS = null;
function getGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}

// --- Submit Infraction ---
document.getElementById("infractionForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const gps = await getGPS();
  const infraction = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    tenant: document.getElementById("tenantSelect").value,
    plate: document.getElementById("plateInput").value.trim(),
    type: document.getElementById("infractionSelect").value,
    vehicle: document.getElementById("vehicleInput").value.trim(),
    vehicleStatus: document.getElementById("vehicleStatusSelect").value,
    date: document.getElementById("dateInputDate").value + "T" + document.getElementById("dateInputTime").value,
    notes: document.getElementById("notesInput").value.trim(),
    photos: currentPhotos.slice(),
    gps: gps,
    officer: { name: document.getElementById("officerSelect").value },
    created: new Date().toISOString()
  };

  try {
    await dbAdd(infraction);
    // Sync to Firestore (wait for auth)
    const doSync = async () => {
      try {
        const syncData = { ...infraction };
        delete syncData.photos;
        await db.collection(FIRESTORE_COLLECTION).doc(infraction.id).set(syncData);
      } catch (e) {
        console.error("Firestore sync failed, queuing:", e);
        queueSync(infraction.id);
      }
    };
    // Sync to Firestore (non-blocking)
    if (authReady) {
      doSync(); // fire and forget
    } else {
      queueSync(infraction.id);
    }
    document.getElementById("infractionForm").reset();
    currentPhotos = [];
    renderPhotoPreview();
    setDefaultDate();
    alert("✅ Infraction saved!");
  } catch (err) {
    console.error(err);
    alert("Error saving: " + err.message);
  }
});

// --- History Tab ---
async function loadHistory() {
  // Load from IndexedDB first
  let local = await dbGetAll();
  
  // If online and auth ready, also fetch from Firestore
  if (authReady && navigator.onLine) {
    try {
      const snapshot = await db.collection(FIRESTORE_COLLECTION).get();
      const remote = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Merge: remote items not in local get added to local IndexedDB
      for (const inf of remote) {
        if (!local.find(l => l.id === inf.id)) {
          await dbAdd(inf); // save to local
          local.push(inf);
        }
      }
    } catch (e) { console.error("Firestore load error:", e); }
  }
  
  currentInfractions = local;
  currentInfractions.sort((a, b) => new Date(b.created) - new Date(a.created));
  renderHistory();
  updateStats();
}

function renderHistory() {
  const list = document.getElementById("infractionList");
  const empty = document.getElementById("emptyState");
  const search = document.getElementById("searchInput").value.toLowerCase();
  const typeFilter = document.getElementById("filterType").value;
  const dateFilter = document.getElementById("filterDate").value;

  let filtered = currentInfractions.filter(inf => {
    if (search && !`${inf.tenant} ${inf.plate} ${inf.type} ${inf.notes}`.toLowerCase().includes(search)) return false;
    if (typeFilter && inf.type !== typeFilter) return false;
    if (dateFilter && !inf.date.startsWith(dateFilter)) return false;
    return true;
  });

  list.innerHTML = "";
  if (filtered.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  filtered.forEach(inf => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="infraction-header">
        <span class="tenant">${esc(inf.tenant)}</span>
        <span class="plate">${esc(inf.plate)}</span>
      </div>
      <span class="type">${esc(inf.type)}</span>
      ${inf.vehicleStatus ? `<span class="status-badge ${inf.vehicleStatus}">${inf.vehicleStatus === 'moved' ? '✅ Moved' : '🚫 Stayed'}</span>` : ""}
      <div class="date">${formatDate(inf.date)}</div>
      ${inf.vehicle ? `<div class="vehicle">${esc(inf.vehicle)}</div>` : ""}
      ${inf.photos && inf.photos.length ? `<img class="photo-thumb" src="${inf.photos[0]}" />` : ""}
    `;
    li.addEventListener("click", () => showDetail(inf.id));
    list.appendChild(li);
  });
}

function updateStats() {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  document.getElementById("statToday").textContent = currentInfractions.filter(i => i.date && i.date.startsWith(today)).length;
  document.getElementById("statWeek").textContent = currentInfractions.filter(i => i.date && i.date.slice(0, 10) >= weekAgo).length;
  document.getElementById("statTotal").textContent = currentInfractions.length;
}

// Filters
document.getElementById("searchInput").addEventListener("input", renderHistory);
document.getElementById("filterType").addEventListener("change", renderHistory);
document.getElementById("filterDate").addEventListener("change", renderHistory);
document.getElementById("clearFilters").addEventListener("click", () => {
  document.getElementById("searchInput").value = "";
  document.getElementById("filterType").value = "";
  document.getElementById("filterDate").value = "";
  renderHistory();
});

// --- Detail Modal ---
function showDetail(id) {
  currentDetailId = id;
  const inf = currentInfractions.find(i => i.id === id);
  if (!inf) return;

  const body = document.getElementById("modalBody");
  body.innerHTML = `
    <div class="detail-row"><div class="detail-label">Space / Tenant</div><div class="detail-value">${esc(inf.tenant)}</div></div>
    <div class="detail-row"><div class="detail-label">License Plate</div><div class="detail-value" style="font-family:monospace;font-size:1.2rem;font-weight:700">${esc(inf.plate)}</div></div>
    <div class="detail-row"><div class="detail-label">Infraction</div><div class="detail-value">${esc(inf.type)}</div></div>
    ${inf.vehicleStatus ? `<div class="detail-row"><div class="detail-label">Vehicle Status</div><div class="detail-value">${inf.vehicleStatus === 'moved' ? '✅ Vehicle Moved' : '🚫 Vehicle Stayed'}</div></div>` : ""}
    <div class="detail-row"><div class="detail-label">Vehicle</div><div class="detail-value">${esc(inf.vehicle || "N/A")}</div></div>
    <div class="detail-row"><div class="detail-label">Date / Time</div><div class="detail-value">${formatDate(inf.date)}</div></div>
    <div class="detail-row"><div class="detail-label">Notes</div><div class="detail-value">${esc(inf.notes || "None")}</div></div>
    ${inf.gps ? `<div class="detail-row"><div class="detail-label">GPS Location</div><div class="detail-value">${inf.gps.lat.toFixed(6)}, ${inf.gps.lng.toFixed(6)}</div></div>` : ""}
    ${inf.officer && inf.officer.name ? `<div class="detail-row"><div class="detail-label">Officer</div><div class="detail-value">${esc(inf.officer.name)}${inf.officer.badge ? " — " + esc(inf.officer.badge) : ""}</div></div>` : ""}
    ${inf.photos && inf.photos.length ? inf.photos.map(p => `<img class="detail-photo" src="${p}" />`).join("") : ""}
  `;
  document.getElementById("detailModal").classList.add("active");
}

document.getElementById("modalClose").addEventListener("click", closeModal);
document.getElementById("modalClose2").addEventListener("click", closeModal);

function closeModal() {
  document.getElementById("detailModal").classList.remove("active");
  currentDetailId = null;
}

document.getElementById("modalEdit").addEventListener("click", () => {
  if (!currentDetailId) return;
  const inf = currentInfractions.find(i => i.id === currentDetailId);
  if (!inf) return;

  const body = document.getElementById("modalBody");
  const infTypes = ["Handicap Violation","Fire Lane","No Parking Zone","Double Parked","Blocking Entrance","Expired Meter","Unauthorized Vehicle","Other"];
  const statusOpts = ["","moved","not-moved"];

  body.innerHTML = `
    <div class="edit-form">
      <label>Placa</label><input id="editPlate" value="${esc(inf.plate||"")}" />
      <label>Vehículo</label><input id="editVehicle" value="${esc(inf.vehicle||"")}" />
      <label>Tipo</label><select id="editType">${infTypes.map(t=>`<option ${t===inf.type?"selected":""}>${t}</option>`).join("")}</select>
      <label>Notas</label><textarea id="editNotes" rows="3">${esc(inf.notes||"")}</textarea>
      <label>Estado</label><select id="editStatus">${statusOpts.map(s=>`<option value="${s}" ${s===(inf.vehicleStatus||"")?"selected":""}>${s==="moved"?"✅ Se Movió":s==="not-moved"?"🚫 Se Quedó":"⏳ Pendiente"}</option>`).join("")}</select>
      <button id="editSave" class="btn-primary" style="margin-top:12px;width:100%">Save Changes</button>
    </div>
  `;

  document.getElementById("editSave").addEventListener("click", async () => {
    inf.plate = document.getElementById("editPlate").value;
    inf.vehicle = document.getElementById("editVehicle").value;
    inf.type = document.getElementById("editType").value;
    inf.notes = document.getElementById("editNotes").value;
    inf.vehicleStatus = document.getElementById("editStatus").value || null;
    await dbUpdate(inf);
    try {
      const syncData = {...inf}; delete syncData.photos;
      await db.collection(FIRESTORE_COLLECTION).doc(inf.id).set(syncData);
    } catch(e) { console.error("Firestore sync failed:", e); }
    showDetail(inf.id);
    loadHistory();
  });
});

document.getElementById("modalDelete").addEventListener("click", async () => {
  if (!currentDetailId) return;
  const pin = prompt("Admin PIN required to delete:");
  if (pin !== DEFAULT_PIN) return alert("Incorrect PIN. Only admin can delete.");
  if (!confirm("Delete this infraction?")) return;
  await dbDelete(currentDetailId);
  // Sync delete to Firestore
  try {
    await db.collection(FIRESTORE_COLLECTION).doc(currentDetailId).delete();
  } catch (e) { console.error("Firestore delete failed:", e); }
  closeModal();
  loadHistory();
});

// --- Export ---
document.getElementById("exportCSV").addEventListener("click", async () => {
  const data = await getFilteredExport();
  if (!data.length) return alert("No data to export.");

  let csv = "ID,Date,Tenant,Plate,Type,Vehicle Status,Vehicle,Notes,GPS,Officer\n";
  data.forEach(inf => {
    csv += [
      inf.id,
      inf.date,
      `"${(inf.tenant || "").replace(/"/g, '""')}"`,
      inf.plate,
      `"${(inf.type || "").replace(/"/g, '""')}"`,
      inf.vehicleStatus === 'moved' ? 'Moved' : inf.vehicleStatus === 'not-moved' ? 'Stayed' : '',
      `"${(inf.vehicle || "").replace(/"/g, '""')}"`,
      `"${(inf.notes || "").replace(/"/g, '""')}"`,
      inf.gps ? `${inf.gps.lat},${inf.gps.lng}` : "",
      inf.officer ? `${inf.officer.name || ""} ${inf.officer.badge || ""}`.trim() : ""
    ].join(",") + "\n";
  });

  downloadFile(csv, "del-rio-infractions.csv", "text/csv");
});

document.getElementById("exportPDF").addEventListener("click", async () => {
  const data = await getFilteredExport();
  if (!data.length) return alert("No data to export.");

  // Simple HTML-to-printable PDF
  let html = `<!DOCTYPE html><html><head><title>Del Rio Infractions Report</title>
  <style>
    body{font-family:system-ui;max-width:800px;margin:0 auto;padding:20px;color:#0f172a}
    h1{font-size:1.3rem;border-bottom:2px solid #0f172a;padding-bottom:8px}
    table{width:100%;border-collapse:collapse;margin-top:16px;font-size:0.8rem}
    th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
    th{background:#0f172a;color:white}
    tr:nth-child(even){background:#f1f5f9}
    .meta{font-size:0.75rem;color:#94a3b8;margin-top:4px}
  </style></head><body>
  <h1>Del Rio Shopping Center — Parking Infractions Report</h1>
  <p class="meta">Generated: ${new Date().toLocaleString()}</p>
  <p class="meta">Total Records: ${data.length}</p>
  <table><tr><th>#</th><th>Date/Time</th><th>Space/Tenant</th><th>Plate</th><th>Infraction</th><th>Vehicle</th><th>Officer</th><th>Notes</th></tr>`;

  data.forEach((inf, i) => {
    html += `<tr>
      <td>${i + 1}</td>
      <td>${formatDate(inf.date)}</td>
      <td>${esc(inf.tenant)}</td>
      <td style="font-family:monospace;font-weight:700">${esc(inf.plate)}</td>
      <td>${esc(inf.type)}</td>
      <td>${esc(inf.vehicle || "")}</td>
      <td>${inf.officer ? esc(inf.officer.name || "") : ""}</td>
      <td>${esc(inf.notes || "")}</td>
    </tr>`;
  });

  html += "</table></body></html>";

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "del-rio-infractions-report.html";
  a.click();
  URL.revokeObjectURL(url);
  alert("Report downloaded. Open it and use Cmd+P to print as PDF.");
});

async function getFilteredExport() {
  const all = await dbGetAll();
  const from = document.getElementById("exportFrom").value;
  const to = document.getElementById("exportTo").value;
  const type = document.getElementById("exportType").value;

  return all.filter(inf => {
    const d = inf.date ? inf.date.slice(0, 10) : "";
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (type && inf.type !== type) return false;
    return true;
  }).sort((a, b) => new Date(a.date) - new Date(b.date));
}

document.getElementById("clearAllData").addEventListener("click", async () => {
  if (!confirm("⚠️ DELETE ALL infraction data? This cannot be undone.")) return;
  if (!confirm("Are you really sure?")) return;
  await dbClear();
  alert("All data cleared.");
});

// --- Settings Tab ---
function loadSettings() {
  const tenants = getTenants();
  const container = document.getElementById("tenantList");
  container.innerHTML = "";
  tenants.forEach((t, i) => {
    const div = document.createElement("div");
    div.className = "tenant-item";
    div.innerHTML = `
      <span>Space ${t.space}</span>
      <input type="text" value="${esc(t.name)}" data-idx="${i}" />
      <button class="remove-tenant" data-idx="${i}">✕</button>
    `;
    container.appendChild(div);
  });

  // Remove tenant buttons
  container.querySelectorAll(".remove-tenant").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      const tenants = getTenants();
      tenants.splice(idx, 1);
      saveTenants(tenants);
      loadSettings();
    });
  });

  // Officer info
  const officer = getOfficer();
  document.getElementById("officerName").value = officer.name || "";
  document.getElementById("officerBadge").value = officer.badge || "";
}

document.getElementById("addTenantBtn").addEventListener("click", () => {
  const tenants = getTenants();
  const next = tenants.length > 0 ? Math.max(...tenants.map(t => t.space)) + 1 : 1;
  tenants.push({ space: next, name: `Space ${next}` });
  saveTenants(tenants);
  loadSettings();
});

document.getElementById("saveTenantsBtn").addEventListener("click", () => {
  const inputs = document.querySelectorAll("#tenantList .tenant-item input");
  const tenants = getTenants();
  inputs.forEach(inp => {
    const idx = parseInt(inp.dataset.idx);
    if (tenants[idx]) tenants[idx].name = inp.value;
  });
  saveTenants(tenants);
  populateTenantSelect();
  alert("✅ Tenants saved!");
});

document.getElementById("saveOfficerBtn").addEventListener("click", () => {
  saveOfficer({
    name: document.getElementById("officerName").value.trim(),
    badge: document.getElementById("officerBadge").value.trim()
  });
  alert("✅ Officer info saved!");
});

// --- Helpers ---
function esc(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit"
    });
  } catch {
    return dateStr;
  }
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Vehicle Status Tab ---
async function loadStatusTab() {
  const all = await dbGetAll();
  const today = new Date().toISOString().slice(0, 10);
  const todayInf = all.filter(i => i.date && i.date.startsWith(today));
  todayInf.sort((a, b) => new Date(b.created) - new Date(a.created));

  const pending = todayInf.filter(i => !i.vehicleStatus).length;
  const moved = todayInf.filter(i => i.vehicleStatus === "moved").length;
  const notMoved = todayInf.filter(i => i.vehicleStatus === "not-moved").length;

  document.getElementById("statusPending").textContent = pending;
  document.getElementById("statusMoved").textContent = moved;
  document.getElementById("statusNotMoved").textContent = notMoved;

  const list = document.getElementById("statusList");
  const empty = document.getElementById("statusEmpty");
  list.innerHTML = "";

  if (todayInf.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  todayInf.forEach(inf => {
    const li = document.createElement("li");
    li.className = "status-item";
    const status = inf.vehicleStatus || "pending";
    li.innerHTML = `
      <div class="status-info">
        <span class="tenant">${esc(inf.tenant)}</span>
        <span class="plate">${esc(inf.plate)}</span>
        <span class="type">${esc(inf.type)}</span>
      </div>
      <div class="status-actions">
        <button class="status-btn ${status === 'moved' ? 'active-green' : ''}" data-id="${inf.id}" data-status="moved">✅ Moved</button>
        <button class="status-btn ${status === 'not-moved' ? 'active-red' : ''}" data-id="${inf.id}" data-status="not-moved">🚫 Stayed</button>
      </div>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll(".status-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const all = await dbGetAll();
      const inf = all.find(i => i.id === id);
      if (inf) {
        inf.vehicleStatus = btn.dataset.status;
        await dbUpdate(inf);
        // Sync status to Firestore
        try {
          await db.collection(FIRESTORE_COLLECTION).doc(inf.id).update({ vehicleStatus: inf.vehicleStatus });
        } catch (e) { console.error("Firestore sync failed:", e); }
        loadStatusTab();
      }
    });
  });
}

// --- Init ---
populateTenantSelect();
populateOfficerSelect();

// --- Admin PIN for Settings ---
const DEFAULT_PIN = "AdminDelRio";
let settingsUnlocked = false;

document.getElementById("settingsPinBtn").addEventListener("click", () => {
  const pin = document.getElementById("settingsPinInput").value;
  const storedPin = localStorage.getItem("delrio_admin_pin") || DEFAULT_PIN;
  if (pin === storedPin) {
    settingsUnlocked = true;
    document.getElementById("settingsPinGate").style.display = "none";
    document.getElementById("settingsContent").style.display = "block";
    document.getElementById("settingsPinError").style.display = "none";
    loadSettings();
  } else {
    document.getElementById("settingsPinError").style.display = "block";
    document.getElementById("settingsPinInput").value = "";
  }
});

document.getElementById("settingsPinInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("settingsPinBtn").click();
});
