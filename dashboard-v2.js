// Del Rio Parking Dashboard

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

// Anonymous auth
auth.signInAnonymously()
  .then(() => { console.log("Dashboard auth ready"); fetchData(dateInput.value); })
  .catch(e => console.error("Auth failed:", e));

const TENANTS = [
  "Barbería", "Royal Lab", "Sakura", "SuperCakes", "Dentista",
  "Mexcal", "Laboratorio", "Medikos", "Butcher's", "Bendecidos",
  "T Shirt", "Dra. Karla Amaral", "Therapy Lab", "My Look", "Optica",
  "Artesano", "Leaf Lab", "Sorrel", "Buenacoop"
];

const OFFICERS = [
  "Héctor J. Prieto Pacheco",
  "Nashalee Ojeda Ocasio",
  "Felix E. Aponte Sanchez",
  "Jose R. Cintrón Meléndez",
  "Jorge D. Moyett Dávila",
  "Andy J. Aponte Sánchez"
];

// Populate space filter
const spaceSelect = document.getElementById("filterSpace");
for (let i = 1; i <= 19; i++) {
  const opt = document.createElement("option");
  opt.value = i;
  opt.textContent = `Espacio ${i} — ${TENANTS[i-1]}`;
  spaceSelect.appendChild(opt);
}

let allInfractions = [];
let allIncidents = [];
let allItems = [];


// Date range picker
const dateInput = document.getElementById("filterDate");
const dateEndInput = document.getElementById("filterDateEnd");
dateInput.value = new Date().toISOString().split("T")[0];
if (dateEndInput) dateEndInput.value = new Date().toISOString().split("T")[0];

// Date range mode toggle
let dateRangeMode = false;
const rangeToggle = document.getElementById("rangeToggle");
if (rangeToggle) {
  rangeToggle.addEventListener("click", () => {
    dateRangeMode = !dateRangeMode;
    rangeToggle.textContent = dateRangeMode ? "📅 Range" : "📅 Day";
    rangeToggle.classList.toggle("active", dateRangeMode);
    const endGroup = document.getElementById("endDateGroup");
    if (endGroup) endGroup.style.display = dateRangeMode ? "inline-block" : "none";
    fetchData(dateInput.value);
  });
}

// Real-time listener
function fetchData(dateStr) {
  const endDate = dateEndInput && dateRangeMode ? dateEndInput.value : dateStr;
  document.getElementById("infractionsList").innerHTML = '<p class="empty">Cargando...</p>';

  // Fetch both infractions and incidents in parallel
  Promise.all([
    db.collection("infractions").get(),
    db.collection("incidents").get()
  ])
    .then(([infSnapshot, incSnapshot]) => {
      allInfractions = infSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), _type: "infraction" }))
        .filter(inf => {
          if (!inf.date) return false;
          const d = inf.date.split("T")[0];
          return dateRangeMode ? (d >= dateStr && d <= endDate) : d === dateStr;
        });

      allIncidents = incSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), _type: "incident" }))
        .filter(inc => {
          if (!inc.date) return false;
          const d = inc.date.split("T")[0];
          return d >= dateStr && d <= endDate;
        });

      // Merge and sort by date descending
      allItems = [...allInfractions, ...allIncidents].sort((a, b) => new Date(b.created || b.date) - new Date(a.created || a.date));
      applyFilters();
    })
    .catch(err => {
      console.error("Firestore error:", err);
      document.getElementById("infractionsList").innerHTML =
        '<p class="empty">Error: ' + err.message + '</p>';
    });
}

function applyFilters() {
  const statusFilter = document.getElementById("filterStatus").value;
  const spaceFilter = document.getElementById("filterSpace").value;
  const plateFilter = document.getElementById("filterPlate").value.toLowerCase();

  let filtered = allItems;

  if (statusFilter === "moved") filtered = filtered.filter(i => i._type === "infraction" && i.vehicleStatus === "moved");
  else if (statusFilter === "stayed") filtered = filtered.filter(i => i._type === "infraction" && (i.vehicleStatus === "stayed" || i.vehicleStatus === "not-moved"));
  else if (statusFilter === "") {
    const val = document.getElementById("filterStatus").selectedOptions[0].textContent;
    if (val.includes("Pendiente")) filtered = filtered.filter(i => i._type === "infraction" && !i.vehicleStatus);
  }

  if (spaceFilter) filtered = filtered.filter(i => {
    if (i._type === "incident") return false;
    const s = i.space || (i.tenant ? parseInt(i.tenant) : null);
    return s == spaceFilter;
  });
  if (plateFilter) filtered = filtered.filter(i => i._type === "infraction" && i.plate && i.plate.toLowerCase().includes(plateFilter));

  renderList(filtered);
  updateStats();
}

function updateStats() {
  const infs = allItems.filter(i => i._type === "infraction");
  const incs = allItems.filter(i => i._type === "incident");
  const total = allItems.length;
  const moved = infs.filter(i => i.vehicleStatus === "moved").length;
  const stayed = infs.filter(i => i.vehicleStatus === "stayed" || i.vehicleStatus === "not-moved").length;
  const pending = infs.length - moved - stayed;

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statMoved").textContent = moved;
  document.getElementById("statStayed").textContent = stayed;
  document.getElementById("statPending").textContent = pending;
  document.getElementById("statIncidents").textContent = incs.length;
}

function renderList(items) {
  const list = document.getElementById("infractionsList");

  if (items.length === 0) {
    list.innerHTML = '<p class="empty">Sin registros para esta fecha</p>';
    return;
  }

  list.innerHTML = items.map(item => {
    if (item._type === "incident") {
      return renderIncidentCard(item);
    } else {
      return renderInfractionCard(item);
    }
  }).join("");
}

function renderIncidentCard(inc) {
  const cat = CAT_ICONS[inc.category] || "📌";
  const catLabel = CAT_LABELS[inc.category] || inc.category;
  const priColor = PRI_COLORS[inc.priority] || "#94a3b8";
  const statusLabel = STATUS_LABELS[inc.status] || "🟡 Abierto";
  const officerName = inc.officer && typeof inc.officer === "object" ? (inc.officer.name || "—") : (inc.officer || "—");
  const time = inc.date ? inc.date.split("T")[1] || "" : "";
  const date = inc.date ? inc.date.split("T")[0] || "" : "";
  const eid = inc.id;
  return `
    <div class="infraction-card" id="card-${eid}" style="border-left:4px solid ${priColor}">
      <div class="card-header">
        <span class="field space-num">${cat} ${inc.description ? inc.description.substring(0, 60) + (inc.description.length > 60 ? '...' : '') : 'Sin descripción'}</span>
        <span class="status-badge" style="background:${priColor}20;color:${priColor}">${inc.priority}</span>
      </div>
      <div class="card-fields">
        <div class="field"><span>Categoría:</span> <strong>${catLabel}</strong></div>
        <div class="field"><span>Estado:</span> <strong>${statusLabel}</strong></div>
        <div class="field"><span>Fecha:</span> <strong>${date}</strong></div>
        <div class="field"><span>Hora:</span> <strong>${time}</strong></div>
        <div class="field"><span>Oficial:</span> <strong>${officerName}${inc.officerCompany ? ' — ' + inc.officerCompany : ''}</strong></div>
        <div class="field"><span>Notas:</span> <strong>${inc.description || '—'}</strong></div>
      </div>
    </div>
  `;
}

function renderInfractionCard(inf) {
    // Normalize vehicle status
    const vs = inf.vehicleStatus === "not-moved" ? "stayed" : (inf.vehicleStatus || "");
    const statusClass = vs === "moved" ? "status-moved"
      : vs === "stayed" ? "status-stayed" : "status-pending";
    const statusText = vs === "moved" ? "✅ Se Movió"
      : vs === "stayed" ? "🚫 Se Quedó" : "⏳ Pendiente";

    // Get space and tenant
    const spaceNum = inf.space || (inf.tenant ? inf.tenant.split(":")[0].trim() : "—");
    const tenantName = inf.tenant || (inf.space ? TENANTS[inf.space - 1] : "—");
    const time = inf.date ? inf.date.split("T")[1] || "" : "";
    const date = inf.date ? inf.date.split("T")[0] || "" : "";
    const officerName = inf.officer && typeof inf.officer === "object" ? (inf.officer.name || "—") : (inf.officer || "—");

    const eid = inf.id;
    return `
      <div class="infraction-card" id="card-${eid}">
        <div class="card-header">
          <span class="field space-num">Espacio ${spaceNum} — ${tenantName}</span>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="card-fields" id="fields-${eid}">
          <div class="field"><span>Placa:</span> <strong>${inf.plate || "—"}</strong></div>
          <div class="field"><span>Vehículo:</span> <strong>${inf.vehicle || "—"}</strong></div>
          <div class="field"><span>Tipo:</span> <strong>${inf.type || "—"}</strong></div>
          <div class="field"><span>Fecha:</span> <strong>${date}</strong></div>
          <div class="field"><span>Hora:</span> <strong>${time}</strong></div>
          <div class="field"><span>Oficial:</span> <strong>${officerName}</strong></div>
          <div class="field"><span>Notas:</span> <strong>${inf.notes || "—"}</strong></div>
        </div>
        <div class="card-edit" id="edit-${eid}" style="display:none">
          <div class="field edit-row">
            <label>Local:</label>
            <select id="e-tenant-${eid}">
              ${TENANTS.map((t, i) => `<option value="${i+1}: ${t}" ${spaceNum == i+1 ? 'selected' : ''}>Espacio ${i+1} — ${t}</option>`).join('')}
            </select>
          </div>
          <div class="field edit-row">
            <label>Estado:</label>
            <select id="e-status-${eid}">
              <option value="" ${!vs ? 'selected' : ''}>⏳ Pendiente</option>
              <option value="moved" ${vs==='moved' ? 'selected' : ''}>✅ Se Movió</option>
              <option value="stayed" ${vs==='stayed' ? 'selected' : ''}>🚫 Se Quedó</option>
            </select>
          </div>
          <div class="field edit-row"><label>Placa:</label><input id="e-plate-${eid}" value="${inf.plate || ''}"></div>
          <div class="field edit-row"><label>Vehículo:</label><input id="e-vehicle-${eid}" value="${inf.vehicle || ''}"></div>
          <div class="field edit-row"><label>Tipo:</label><input id="e-type-${eid}" value="${inf.type || ''}"></div>
          <div class="field edit-row"><label>Oficial:</label><select id="e-officer-${eid}"><option value="">— Sin oficial —</option>${OFFICERS.map(o => `<option value="${o}" ${officerName === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="field edit-row"><label>Notas:</label><input id="e-notes-${eid}" value="${inf.notes || ''}"></div>
        </div>
        <div class="card-actions">
          <button onclick="toggleEdit('${eid}')" class="edit-btn" id="editbtn-${eid}">✏️ Editar</button>
          <button onclick="saveEdit('${eid}')" class="save-btn" id="savebtn-${eid}" style="display:none">💾 Guardar</button>
          <button onclick="cancelEdit('${eid}')" class="cancel-btn" id="cancelbtn-${eid}" style="display:none">Cancelar</button>
          <button onclick="deleteInf('${eid}')" class="delete-btn">🗑</button>
        </div>
      </div>
    `;
}

// Event listeners
dateInput.addEventListener("change", () => fetchData(dateInput.value));
if (dateEndInput) dateEndInput.addEventListener("change", () => fetchData(dateInput.value));
document.getElementById("btnToday").addEventListener("click", () => {
  dateInput.value = new Date().toISOString().split("T")[0];
  fetchData(dateInput.value);
});
document.getElementById("btnRefresh").addEventListener("click", () => fetchData(dateInput.value));
document.getElementById("filterStatus").addEventListener("change", applyFilters);
document.getElementById("filterSpace").addEventListener("change", applyFilters);
document.getElementById("filterPlate").addEventListener("input", applyFilters);

// --- Edit Functions ---
window.toggleEdit = function(id) {
  document.getElementById('fields-' + id).style.display = 'none';
  document.getElementById('edit-' + id).style.display = 'block';
  document.getElementById('editbtn-' + id).style.display = 'none';
  document.getElementById('savebtn-' + id).style.display = 'inline-block';
  document.getElementById('cancelbtn-' + id).style.display = 'inline-block';
};

window.cancelEdit = function(id) {
  document.getElementById('fields-' + id).style.display = 'grid';
  document.getElementById('edit-' + id).style.display = 'none';
  document.getElementById('editbtn-' + id).style.display = 'inline-block';
  document.getElementById('savebtn-' + id).style.display = 'none';
  document.getElementById('cancelbtn-' + id).style.display = 'none';
};

window.saveEdit = async function(id) {
  const tenant = document.getElementById('e-tenant-' + id).value;
  const spaceNum = parseInt(tenant.split(':')[0].trim());
  const status = document.getElementById('e-status-' + id).value;
  const updates = {
    tenant: tenant,
    space: spaceNum,
    plate: document.getElementById('e-plate-' + id).value,
    vehicle: document.getElementById('e-vehicle-' + id).value,
    type: document.getElementById('e-type-' + id).value,
    officer: document.getElementById('e-officer-' + id).value,
    notes: document.getElementById('e-notes-' + id).value,
    updatedAt: new Date().toISOString()
  };
  if (status) updates.vehicleStatus = status;
  else updates.vehicleStatus = firebase.firestore.FieldValue.delete();

  try {
    await db.collection('infractions').doc(id).update(updates);
    fetchData(dateInput.value);
  } catch(e) { alert('Error: ' + e.message); }
};

// --- Delete Infraction ---
window.deleteInf = async function(id) {
  const pwd = prompt("Password para eliminar:");
  if (pwd !== "DelRio") { alert("Password incorrecto"); return; }
  try {
    await db.collection("infractions").doc(id).delete();
    fetchData(dateInput.value);
  } catch(e) { alert("Error: " + e.message); }
};

// --- Export CSV ---
document.getElementById("exportCSV").addEventListener("click", () => {
  if (allInfractions.length === 0) return alert("No hay datos");
  const headers = ["Espacio","Tenant","Placa","Vehículo","Tipo","Fecha","Hora","Oficial","Estado","Notas"];
  const rows = allInfractions.map(inf => {
    const spaceNum = inf.space || (inf.tenant ? inf.tenant.split(":")[0].trim() : "");
    const tenantName = inf.tenant || "";
    const vs = inf.vehicleStatus === "not-moved" ? "Se Quedó" : (inf.vehicleStatus === "moved" ? "Se Movió" : "Pendiente");
    const officerName = inf.officer && typeof inf.officer === "object" ? (inf.officer.name || "") : (inf.officer || "");
    const time = inf.date ? inf.date.split("T")[1] || "" : "";
    const date = inf.date ? inf.date.split("T")[0] || "" : "";
    return [spaceNum, tenantName, inf.plate||"", inf.vehicle||"", inf.type||"", date, time, officerName, vs, inf.notes||""].map(v => `"${v}"`).join(",");
  });
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], {type: "text/csv"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `delrio-infractions-${dateInput.value}${dateRangeMode && dateEndInput ? '-to-' + dateEndInput.value : ''}.csv`;
  a.click();
});

// --- Export PDF (HTML) ---
document.getElementById("exportPDF").addEventListener("click", () => {
  if (allInfractions.length === 0) return alert("No hay datos");
  let html = `<html><head><title>Del Rio - Infracciones</title><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #333;padding:6px 8px;font-size:11px}th{background:#e94560;color:#fff}h1{color:#e94560}</style></head><body>`;
  html += `<h1>Del Rio Shopping Center - Infracciones</h1><p>Fecha: ${dateInput.value}${dateRangeMode && dateEndInput ? ' a ' + dateEndInput.value : ''} | Total: ${allInfractions.length}</p>`;
  html += `<table><tr><th>Espacio</th><th>Tenant</th><th>Placa</th><th>Vehículo</th><th>Tipo</th><th>Hora</th><th>Oficial</th><th>Estado</th><th>Notas</th></tr>`;
  allInfractions.forEach(inf => {
    const spaceNum = inf.space || (inf.tenant ? inf.tenant.split(":")[0].trim() : "");
    const vs = inf.vehicleStatus === "not-moved" ? "Se Quedó" : (inf.vehicleStatus === "moved" ? "Se Movió" : "Pendiente");
    const officerName = inf.officer && typeof inf.officer === "object" ? (inf.officer.name || "") : (inf.officer || "");
    const time = inf.date ? inf.date.split("T")[1] || "" : "";
    html += `<tr><td>${spaceNum}</td><td>${inf.tenant||""}</td><td>${inf.plate||""}</td><td>${inf.vehicle||""}</td><td>${inf.type||""}</td><td>${time}</td><td>${officerName}</td><td>${vs}</td><td>${inf.notes||""}</td></tr>`;
  });
  html += `</table></body></html>`;
  const blob = new Blob([html], {type: "text/html"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `delrio-infractions-${dateInput.value}.html`;
  a.click();
});

// --- Incident constants (shared with renderIncidentCard) ---
const CAT_ICONS = { security: "🔒", maintenance: "🔧", emergency: "🚨", noise: "🔊", other: "📌" };
const CAT_LABELS = { security: "Seguridad", maintenance: "Mantenimiento", emergency: "Emergencia", noise: "Ruido", other: "Otro" };
const PRI_COLORS = { low: "#22c55e", medium: "#f59e0b", high: "#f97316", critical: "#ef4444" };
const STATUS_LABELS = { open: "🟡 Abierto", "in-progress": "🔵 En Progreso", resolved: "🟢 Resuelto", closed: "⚪ Cerrado" };

// Start — fetchData is called after auth is ready (see auth.signInAnonymously .then)

// Auto-refresh every 2 minutes
setInterval(() => fetchData(dateInput.value), 120000);
