// ============================================
// Del Rio PWA — Incidents Module (Non-Vehicle)
// ============================================

const INCIDENTS_DB_NAME = "DelRioParking";
const INCIDENTS_DB_VERSION = 3; // Bumped from 2 (infractions)
const INCIDENTS_STORE = "incidents";
const FIRESTORE_INCIDENTS = "incidents";

// --- IndexedDB for Incidents ---
function openIncidentsDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(INCIDENTS_DB_NAME, INCIDENTS_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // Infractions store (keep existing)
      if (!db.objectStoreNames.contains("infractions")) {
        const store = db.createObjectStore("infractions", { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
        store.createIndex("tenant", "tenant", { unique: false });
        store.createIndex("type", "type", { unique: false });
      }
      // Incidents store (new)
      if (!db.objectStoreNames.contains(INCIDENTS_STORE)) {
        const store = db.createObjectStore(INCIDENTS_STORE, { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
        store.createIndex("category", "category", { unique: false });
        store.createIndex("priority", "priority", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function incDbAdd(data) {
  return openIncidentsDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(INCIDENTS_STORE, "readwrite");
    tx.objectStore(INCIDENTS_STORE).add(data);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}

function incDbPut(data) {
  return openIncidentsDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(INCIDENTS_STORE, "readwrite");
    tx.objectStore(INCIDENTS_STORE).put(data);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}

function incDbGetAll() {
  return openIncidentsDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(INCIDENTS_STORE, "readonly");
    const req = tx.objectStore(INCIDENTS_STORE).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
}

function incDbDelete(id) {
  return openIncidentsDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(INCIDENTS_STORE, "readwrite");
    tx.objectStore(INCIDENTS_STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}

// --- Sync Queue for Incidents ---
function getIncidentSyncQueue() {
  try { return JSON.parse(localStorage.getItem("incidentSyncQueue") || "[]"); } catch { return []; }
}
function queueIncidentSync(id) {
  const q = getIncidentSyncQueue();
  if (!q.includes(id)) { q.push(id); localStorage.setItem("incidentSyncQueue", JSON.stringify(q)); }
}
function removeFromIncidentSyncQueue(id) {
  const q = getIncidentSyncQueue().filter(x => x !== id);
  localStorage.setItem("incidentSyncQueue", JSON.stringify(q));
}

async function processIncidentSyncQueue() {
  if (!authReady || !navigator.onLine) return;
  const q = getIncidentSyncQueue();
  if (q.length === 0) return;
  console.log(`Processing ${q.length} pending incident syncs...`);
  for (const id of q) {
    try {
      const all = await incDbGetAll();
      const inc = all.find(i => i.id === id);
      if (inc) {
        const syncData = { ...inc };
        delete syncData.photos;
        await db.collection(FIRESTORE_INCIDENTS).doc(id).set(syncData);
      }
      removeFromIncidentSyncQueue(id);
    } catch (e) { console.error(`Incident sync failed for ${id}:`, e); }
  }
}

async function fullSyncIncidentsToFirestore() {
  if (!authReady || !navigator.onLine) return;
  try {
    const local = await incDbGetAll();
    let remoteMap = new Map();
    try {
      const snapshot = await db.collection(FIRESTORE_INCIDENTS).get();
      snapshot.docs.forEach(doc => remoteMap.set(doc.id, doc.data()));
    } catch (e) { console.error("Incident full sync: remote fetch failed", e); return; }

    for (const inc of local) {
      try {
        const remote = remoteMap.get(inc.id);
        if (remote) {
          const rTime = new Date(remote.updatedAt || remote.created || 0).getTime();
          const lTime = new Date(inc.updatedAt || inc.created || 0).getTime();
          if (rTime > lTime) {
            await incDbPut({ id: inc.id, ...remote });
            continue;
          }
          if (lTime <= rTime) continue;
        }
        const syncData = { ...inc };
        delete syncData.photos;
        await db.collection(FIRESTORE_INCIDENTS).doc(inc.id).set(syncData, { merge: true });
      } catch (e) { console.error(`Incident full sync failed for ${inc.id}:`, e); }
    }
    localStorage.setItem("incidentSyncQueue", JSON.stringify([]));
    console.log(`Incident full sync complete: ${local.length} items`);
  } catch (e) { console.error("Incident full sync error:", e); }
}

// --- Incident State ---
let currentIncidents = [];
let currentIncidentPhotos = [];
let selectedCategory = null;
let selectedPriority = "medium";
let currentIncidentDetailId = null;
let incidentViewMode = "report"; // report | list

// --- Categories ---
const INCIDENT_CATEGORIES = {
  security:    { icon: "🔒", label: "Security", color: "#2563eb" },
  maintenance: { icon: "🔧", label: "Maintenance", color: "#f59e0b" },
  emergency:   { icon: "🚨", label: "Emergency", color: "#ef4444" },
  noise:       { icon: "🔊", label: "Noise", color: "#8b5cf6" },
  other:       { icon: "📌", label: "Other", color: "#64748b" }
};

const PRIORITIES = {
  low:      { icon: "🟢", label: "Low" },
  medium:   { icon: "🟡", label: "Medium" },
  high:     { icon: "🟠", label: "High" },
  critical: { icon: "🔴", label: "Critical" }
};

const INCIDENT_STATUSES = {
  "open":        { icon: "🟡", label: "Open" },
  "in-progress": { icon: "🔵", label: "In Progress" },
  "resolved":    { icon: "🟢", label: "Resolved" },
  "closed":      { icon: "⚪", label: "Closed" }
};

// --- Init Incidents Tab ---
function initIncidentsTab() {
  // Category selection
  document.querySelectorAll("#tab-incidents .category-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll("#tab-incidents .category-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      selectedCategory = card.dataset.category;
    });
  });

  // Priority selection
  document.querySelectorAll("#tab-incidents .priority-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#tab-incidents .priority-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedPriority = btn.dataset.priority;
    });
  });

  // Photo capture for incidents
  document.getElementById("incidentCameraBtn").addEventListener("click", () => {
    const input = document.getElementById("incidentPhotoInput");
    input.setAttribute("capture", "environment");
    input.click();
  });

  document.getElementById("incidentUploadBtn").addEventListener("click", () => {
    const input = document.getElementById("incidentPhotoInput");
    input.removeAttribute("capture");
    input.click();
  });

  document.getElementById("incidentPhotoInput").addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
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
        currentIncidentPhotos.push(dataUrl);
        renderIncidentPhotoPreview();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    this.value = "";
  });

  // GPS button
  document.getElementById("incidentGpsBtn").addEventListener("click", async () => {
    const gps = await getGPS();
    if (gps) {
      document.getElementById("incidentLocationInput").value = `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}`;
    } else {
      alert("Could not get GPS location. Check permissions.");
    }
  });

  // Submit incident form
  document.getElementById("incidentForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    if (!selectedCategory) {
      alert("Please select a category.");
      return;
    }

    const gps = await getGPS();
    const companyKey = document.getElementById("companySelect")?.value;
    const companyName = companyKey && typeof OFFICER_GROUPS !== "undefined" && OFFICER_GROUPS[companyKey] ? OFFICER_GROUPS[companyKey].name : null;
    const officerSelect = document.getElementById("officerSelect");
    
    // Auto-set current date/time
    const nowInc = new Date();
    const offsetInc = nowInc.getTimezoneOffset();
    const localInc = new Date(nowInc.getTime() - offsetInc * 60000);
    const incidentDate = localInc.toISOString().slice(0, 10) + "T" + localInc.toISOString().slice(11, 16);

    const incident = {
      id: "inc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      category: selectedCategory,
      priority: selectedPriority,
      title: document.getElementById("incidentDescInput").value.trim().substring(0, 80),
      description: document.getElementById("incidentDescInput").value.trim(),
      location: document.getElementById("incidentLocationInput").value.trim(),
      date: incidentDate,
      status: "open",
      photos: currentIncidentPhotos.slice(),
      gps: gps,
      officer: { name: officerSelect ? officerSelect.value : "" },
      officerCompany: companyName,
      created: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await incDbAdd(incident);
      // Sync to Firestore
      const doSync = async () => {
        try {
          const syncData = { ...incident };
          delete syncData.photos;
          await db.collection(FIRESTORE_INCIDENTS).doc(incident.id).set(syncData);
        } catch (e) {
          console.error("Firestore incident sync failed, queuing:", e);
          queueIncidentSync(incident.id);
        }
      };
      if (authReady) doSync();
      else queueIncidentSync(incident.id);

      // Reset form
      document.getElementById("incidentForm").reset();
      currentIncidentPhotos = [];
      renderIncidentPhotoPreview();
      setDefaultIncidentDate();
      selectedCategory = null;
      selectedPriority = "medium";
      document.querySelectorAll("#tab-incidents .category-card").forEach(c => c.classList.remove("selected"));
      document.querySelectorAll("#tab-incidents .priority-btn").forEach(b => b.classList.remove("selected"));
      // Re-select medium
      document.querySelector('#tab-incidents .priority-btn[data-priority="medium"]')?.classList.add("selected");

      alert("✅ Incident reported!");
    } catch (err) {
      console.error(err);
      alert("Error saving incident: " + err.message);
    }
  });

  // View toggle (Report | History)
  document.querySelectorAll("#tab-incidents .toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#tab-incidents .toggle-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      incidentViewMode = btn.dataset.view;
      document.getElementById("incidentReportView").style.display = incidentViewMode === "report" ? "block" : "none";
      document.getElementById("incidentListView").style.display = incidentViewMode === "list" ? "block" : "none";
      if (incidentViewMode === "list") loadIncidentHistory();
    });
  });

  // Incident history filters
  document.getElementById("incidentSearchInput").addEventListener("input", renderIncidentHistory);
  document.getElementById("incidentFilterCategory").addEventListener("change", renderIncidentHistory);
  document.getElementById("incidentFilterPriority").addEventListener("change", renderIncidentHistory);
  document.getElementById("incidentFilterStatus").addEventListener("change", renderIncidentHistory);
  document.getElementById("incidentFilterDate").addEventListener("change", renderIncidentHistory);
  document.getElementById("incidentClearFilters").addEventListener("click", () => {
    document.getElementById("incidentSearchInput").value = "";
    document.getElementById("incidentFilterCategory").value = "";
    document.getElementById("incidentFilterPriority").value = "";
    document.getElementById("incidentFilterStatus").value = "";
    document.getElementById("incidentFilterDate").value = "";
    renderIncidentHistory();
  });

  // Export incidents
  document.getElementById("exportIncidentCSV").addEventListener("click", exportIncidentsCSV);
  document.getElementById("exportIncidentPDF").addEventListener("click", exportIncidentsPDF);

  // Incident modal buttons
  document.getElementById("incidentModalClose").addEventListener("click", closeIncidentModal);
  document.getElementById("incidentModalClose2").addEventListener("click", closeIncidentModal);
  document.getElementById("incidentModalDelete").addEventListener("click", deleteIncident);

  // Auto-date
  setDefaultIncidentDate();

  // Auto-sync intervals
  setInterval(() => {
    const q = getIncidentSyncQueue();
    if (q.length > 0 && navigator.onLine) processIncidentSyncQueue();
  }, 30000);

  setInterval(() => { fullSyncIncidentsToFirestore(); }, 120000);

  if (typeof authReady !== "undefined" && authReady) {
    setTimeout(fullSyncIncidentsToFirestore, 3000);
  }
}

function setDefaultIncidentDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  const dateEl = document.getElementById("incidentDateInput");
  const timeEl = document.getElementById("incidentTimeInput");
  if (dateEl) dateEl.value = local.toISOString().slice(0, 10);
  if (timeEl) timeEl.value = local.toISOString().slice(11, 16);
}

function renderIncidentPhotoPreview() {
  const container = document.getElementById("incidentPhotoPreview");
  if (!container) return;
  container.innerHTML = "";
  currentIncidentPhotos.forEach((src, i) => {
    const img = document.createElement("img");
    img.src = src;
    img.title = "Click to remove";
    img.style.cssText = "width:80px;height:80px;object-fit:cover;border-radius:8px;border:2px solid #e2e8f0;cursor:pointer;";
    img.addEventListener("click", () => {
      currentIncidentPhotos.splice(i, 1);
      renderIncidentPhotoPreview();
    });
    container.appendChild(img);
  });
}

// --- Load Incident History ---
async function loadIncidentHistory() {
  let local = await incDbGetAll();
  
  // Merge with Firestore if online
  if (authReady && navigator.onLine) {
    try {
      const snapshot = await db.collection(FIRESTORE_INCIDENTS).get();
      const remote = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const localMap = new Map(local.map(l => [l.id, l]));
      
      for (const inc of remote) {
        const existing = localMap.get(inc.id);
        if (!existing) {
          await incDbAdd(inc);
          local.push(inc);
        } else {
          const rTime = new Date(inc.updatedAt || inc.created || 0).getTime();
          const lTime = new Date(existing.updatedAt || existing.created || 0).getTime();
          if (rTime > lTime) {
            await incDbPut(inc);
            const idx = local.findIndex(l => l.id === inc.id);
            local[idx] = inc;
          }
        }
      }
      
      const remoteIds = new Set(remote.map(r => r.id));
      for (const l of [...local]) {
        if (!remoteIds.has(l.id)) {
          await incDbDelete(l.id);
          local = local.filter(x => x.id !== l.id);
        }
      }
    } catch (e) { console.error("Incident Firestore load error:", e); }
  }
  
  currentIncidents = local;
  currentIncidents.sort((a, b) => new Date(b.created) - new Date(a.created));
  renderIncidentHistory();
  updateIncidentStats();
}

function renderIncidentHistory() {
  const list = document.getElementById("incidentList");
  const empty = document.getElementById("incidentEmptyState");
  if (!list) return;

  const search = document.getElementById("incidentSearchInput").value.toLowerCase();
  const catFilter = document.getElementById("incidentFilterCategory").value;
  const priFilter = document.getElementById("incidentFilterPriority").value;
  const statusFilter = document.getElementById("incidentFilterStatus").value;
  const dateFilter = document.getElementById("incidentFilterDate").value;

  let filtered = currentIncidents.filter(inc => {
    if (search && !`${inc.description} ${inc.location} ${inc.category} ${inc.officer?.name || ""}`.toLowerCase().includes(search)) return false;
    if (catFilter && inc.category !== catFilter) return false;
    if (priFilter && inc.priority !== priFilter) return false;
    if (statusFilter && inc.status !== statusFilter) return false;
    if (dateFilter && !inc.date?.startsWith(dateFilter)) return false;
    return true;
  });

  list.innerHTML = "";
  if (filtered.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  filtered.forEach(inc => {
    const li = document.createElement("li");
    li.className = `incident-card cat-${inc.category}`;
    const cat = INCIDENT_CATEGORIES[inc.category] || INCIDENT_CATEGORIES.other;
    const statusInfo = INCIDENT_STATUSES[inc.status] || INCIDENT_STATUSES["open"];

    li.innerHTML = `
      <div class="incident-header">
        <span class="incident-title">${cat.icon} ${escHtml(inc.description ? inc.description.substring(0, 60) + (inc.description.length > 60 ? "..." : "") : "No description")}</span>
      </div>
      <div class="incident-meta">
        <span class="badge badge-cat-${inc.category}">${cat.label}</span>
        <span class="badge badge-priority-${inc.priority}">${PRIORITIES[inc.priority]?.icon || ""} ${PRIORITIES[inc.priority]?.label || inc.priority}</span>
        <span class="badge badge-status-${inc.status}">${statusInfo.icon} ${statusInfo.label}</span>
      </div>
      ${inc.description ? `<div style="font-size:0.8rem;color:#64748b;margin-top:0.3rem">${escHtml(inc.description.substring(0, 100))}${inc.description.length > 100 ? "..." : ""}</div>` : ""}
      <div class="date" style="margin-top:0.25rem">${formatDate(inc.date)}</div>
      ${inc.photos && inc.photos.length ? `<img class="photo-thumb" src="${inc.photos[0]}" />` : ""}
    `;
    li.addEventListener("click", () => showIncidentDetail(inc.id));
    list.appendChild(li);
  });
}

function updateIncidentStats() {
  const today = new Date().toISOString().slice(0, 10);
  const openCount = currentIncidents.filter(i => i.status === "open").length;
  const todayCount = currentIncidents.filter(i => i.date?.startsWith(today)).length;
  const criticalCount = currentIncidents.filter(i => i.priority === "critical" && i.status !== "closed" && i.status !== "resolved").length;

  const el1 = document.getElementById("incStatOpen");
  const el2 = document.getElementById("incStatToday");
  const el3 = document.getElementById("incStatCritical");
  if (el1) el1.textContent = openCount;
  if (el2) el2.textContent = todayCount;
  if (el3) el3.textContent = criticalCount;
}

// --- Incident Detail Modal ---
function showIncidentDetail(id) {
  currentIncidentDetailId = id;
  const inc = currentIncidents.find(i => i.id === id);
  if (!inc) return;

  const cat = INCIDENT_CATEGORIES[inc.category] || INCIDENT_CATEGORIES.other;
  const statusInfo = INCIDENT_STATUSES[inc.status] || INCIDENT_STATUSES["open"];

  const body = document.getElementById("incidentModalBody");
  body.innerHTML = `
    <div class="detail-row">
      <div class="detail-label">Category</div>
      <div class="detail-value"><span class="badge badge-cat-${inc.category}">${cat.label}</span></div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Priority</div>
      <div class="detail-value"><span class="badge badge-priority-${inc.priority}">${PRIORITIES[inc.priority]?.icon || ""} ${PRIORITIES[inc.priority]?.label || inc.priority}</span></div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Status</div>
      <div class="detail-value">
        <span class="badge badge-status-${inc.status}">${statusInfo.icon} ${statusInfo.label}</span>
      </div>
    </div>
    <div style="margin-top:0.5rem">
      <div class="detail-label">Update Status</div>
      <div class="status-update-grid">
        ${Object.entries(INCIDENT_STATUSES).map(([key, s]) => `
          <button class="status-update-btn ${inc.status === key ? 'active-status' : ''}" data-status="${key}">
            ${s.icon} ${s.label}
          </button>
        `).join("")}
      </div>
    </div>
    <div class="detail-row" style="margin-top:0.75rem">
      <div class="detail-label">Notes</div>
      <div class="detail-value">${escHtml(inc.description || "No notes")}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Location</div>
      <div class="detail-value">${escHtml(inc.location || "Not specified")}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Date / Time</div>
      <div class="detail-value">${formatDate(inc.date)}</div>
    </div>
    ${inc.gps ? `<div class="detail-row"><div class="detail-label">GPS</div><div class="detail-value">${inc.gps.lat.toFixed(6)}, ${inc.gps.lng.toFixed(6)}</div></div>` : ""}
    ${inc.officer?.name ? `<div class="detail-row"><div class="detail-label">Reported By</div><div class="detail-value">${escHtml(inc.officer.name)}${inc.officerCompany ? " — " + escHtml(inc.officerCompany) : ""}</div></div>` : ""}
    ${inc.photos && inc.photos.length ? `<div class="detail-row"><div class="detail-label">Photos</div><div class="incident-detail-photos">${inc.photos.map(p => `<img src="${p}" />`).join("")}</div></div>` : ""}
  `;

  // Status update buttons
  body.querySelectorAll(".status-update-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      inc.status = btn.dataset.status;
      inc.updatedAt = new Date().toISOString();
      await incDbPut(inc);
      try {
        const syncData = { ...inc };
        delete syncData.photos;
        await db.collection(FIRESTORE_INCIDENTS).doc(inc.id).set(syncData);
      } catch (e) { console.error("Firestore incident status sync failed:", e); }
      showIncidentDetail(inc.id);
      loadIncidentHistory();
    });
  });

  document.getElementById("incidentDetailModal").classList.add("active");
}

function closeIncidentModal() {
  document.getElementById("incidentDetailModal").classList.remove("active");
  currentIncidentDetailId = null;
}

async function deleteIncident() {
  if (!currentIncidentDetailId) return;
  const pin = prompt("Admin PIN required to delete:");
  if (typeof DEFAULT_PIN !== "undefined" && pin !== DEFAULT_PIN) return alert("Incorrect PIN.");
  if (!confirm("Delete this incident?")) return;
  await incDbDelete(currentIncidentDetailId);
  try {
    await db.collection(FIRESTORE_INCIDENTS).doc(currentIncidentDetailId).delete();
  } catch (e) { console.error("Firestore incident delete failed:", e); }
  closeIncidentModal();
  loadIncidentHistory();
}

// --- Export Incidents ---
async function getFilteredIncidentsForExport() {
  const all = await incDbGetAll();
  return all.sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function exportIncidentsCSV() {
  const data = await getFilteredIncidentsForExport();
  if (!data.length) return alert("No incidents to export.");

  let csv = "ID,Date,Category,Priority,Status,Location,Description,GPS,Officer,Company\n";
  data.forEach(inc => {
    csv += [
      inc.id,
      inc.date,
      `"${(inc.description || "").replace(/"/g, '""')}"`,
      inc.category,
      inc.priority,
      inc.status,
      `"${(inc.location || "").replace(/"/g, '""')}"`,
      `"${(inc.description || "").replace(/"/g, '""')}"`,
      inc.gps ? `${inc.gps.lat},${inc.gps.lng}` : "",
      inc.officer?.name || "",
      inc.officerCompany || ""
    ].join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "del-rio-incidents.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function exportIncidentsPDF() {
  const data = await getFilteredIncidentsForExport();
  if (!data.length) return alert("No incidents to export.");

  let html = `<!DOCTYPE html><html><head><title>Del Rio Incidents Report</title>
  <style>
    body{font-family:system-ui;max-width:800px;margin:0 auto;padding:20px;color:#0f172a}
    h1{font-size:1.3rem;border-bottom:2px solid #0f172a;padding-bottom:8px}
    table{width:100%;border-collapse:collapse;margin-top:16px;font-size:0.75rem}
    th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left}
    th{background:#0f172a;color:white}
    tr:nth-child(even){background:#f1f5f9}
    .meta{font-size:0.75rem;color:#94a3b8;margin-top:4px}
  </style></head><body>
  <h1>Del Rio Shopping Center — Incident Report</h1>
  <p class="meta">Generated: ${new Date().toLocaleString()}</p>
  <p class="meta">Total Records: ${data.length}</p>
  <table><tr><th>#</th><th>Date</th><th>Category</th><th>Priority</th><th>Status</th><th>Location</th><th>Officer</th></tr>`;

  data.forEach((inc, i) => {
    html += `<tr>
      <td>${i + 1}</td>
      <td>${formatDate(inc.date)}</td>
      <td>${escHtml(inc.description ? inc.description.substring(0, 40) : "")}</td>
      <td>${inc.category}</td>
      <td>${inc.priority}</td>
      <td>${inc.status}</td>
      <td>${escHtml(inc.location || "")}</td>
      <td>${inc.officer?.name || ""}</td>
    </tr>`;
  });

  html += "</table></body></html>";

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "del-rio-incidents-report.html";
  a.click();
  URL.revokeObjectURL(url);
  alert("Report downloaded. Open it and use Cmd+P to print as PDF.");
}

// --- Helper ---
function escHtml(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// Init when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initIncidentsTab);
} else {
  initIncidentsTab();
}
