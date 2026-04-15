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
auth.signInAnonymously().catch(e => console.error("Auth failed:", e));

const TENANTS = [
  "Barbería", "Royal Lab", "Sakura", "SuperCakes", "Dentista",
  "Mexcal", "Laboratorio", "Medikos", "Butcher's", "Bendecidos",
  "T Shirt", "Dra. Karla Amaral", "Therapy Lab", "My Look", "Optica",
  "Artesano", "Leaf Lab", "Sorrel", "Buenacoop"
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


// Set default date to today
const dateInput = document.getElementById("filterDate");
dateInput.value = new Date().toISOString().split("T")[0];

// Real-time listener
function fetchData(dateStr) {
  document.getElementById("infractionsList").innerHTML = '<p class="empty">Cargando...</p>';

  db.collection("infractions")
    .get()
    .then(snapshot => {
      allInfractions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(inf => {
          if (!inf.date) return false;
          const d = inf.date.split("T")[0];
          return d === dateStr;
        });
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

  let filtered = allInfractions;

  if (statusFilter === "moved") filtered = filtered.filter(i => i.vehicleStatus === "moved");
  else if (statusFilter === "stayed") filtered = filtered.filter(i => i.vehicleStatus === "stayed" || i.vehicleStatus === "not-moved");
  else if (statusFilter === "") {
    const val = document.getElementById("filterStatus").selectedOptions[0].textContent;
    if (val.includes("Pendiente")) filtered = filtered.filter(i => !i.vehicleStatus);
  }

  if (spaceFilter) filtered = filtered.filter(i => {
    const s = i.space || (i.tenant ? parseInt(i.tenant) : null);
    return s == spaceFilter;
  });
  if (plateFilter) filtered = filtered.filter(i => i.plate && i.plate.toLowerCase().includes(plateFilter));

  renderList(filtered);
  updateStats();
}

function updateStats() {
  const total = allInfractions.length;
  const moved = allInfractions.filter(i => i.vehicleStatus === "moved").length;
  const stayed = allInfractions.filter(i => i.vehicleStatus === "stayed" || i.vehicleStatus === "not-moved").length;
  const pending = total - moved - stayed;

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statMoved").textContent = moved;
  document.getElementById("statStayed").textContent = stayed;
  document.getElementById("statPending").textContent = pending;
}

function renderList(infractions) {
  const list = document.getElementById("infractionsList");

  if (infractions.length === 0) {
    list.innerHTML = '<p class="empty">Sin infracciones para esta fecha</p>';
    return;
  }

  list.innerHTML = infractions.map(inf => {
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

    return `
      <div class="infraction-card">
        <div class="field space-num">Espacio ${spaceNum} — ${tenantName}</div>
        <div class="field"><span class="status-badge ${statusClass}">${statusText}</span></div>
        <div class="field"><span>Placa:</span> <strong>${inf.plate || "—"}</strong></div>
        <div class="field"><span>Vehículo:</span> <strong>${inf.vehicle || "—"}</strong></div>
        <div class="field"><span>Tipo:</span> <strong>${inf.type || "—"}</strong></div>
        <div class="field"><span>Fecha:</span> <strong>${date}</strong></div>
        <div class="field"><span>Hora:</span> <strong>${time}</strong></div>
        <div class="field"><span>Oficial:</span> <strong>${officerName}</strong></div>
        <div class="field"><span>Notas:</span> <strong>${inf.notes || "—"}</strong></div>
      </div>
    `;
  }).join("");
}

// Event listeners
dateInput.addEventListener("change", () => fetchData(dateInput.value));
document.getElementById("btnToday").addEventListener("click", () => {
  dateInput.value = new Date().toISOString().split("T")[0];
  fetchData(dateInput.value);
});
document.getElementById("btnRefresh").addEventListener("click", () => fetchData(dateInput.value));
document.getElementById("filterStatus").addEventListener("change", applyFilters);
document.getElementById("filterSpace").addEventListener("change", applyFilters);
document.getElementById("filterPlate").addEventListener("input", applyFilters);

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
  a.download = `delrio-infractions-${dateInput.value}.csv`;
  a.click();
});

// --- Export PDF (HTML) ---
document.getElementById("exportPDF").addEventListener("click", () => {
  if (allInfractions.length === 0) return alert("No hay datos");
  let html = `<html><head><title>Del Rio - Infracciones</title><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #333;padding:6px 8px;font-size:11px}th{background:#e94560;color:#fff}h1{color:#e94560}</style></head><body>`;
  html += `<h1>Del Rio Shopping Center - Infracciones</h1><p>Fecha: ${dateInput.value} | Total: ${allInfractions.length}</p>`;
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

// Start
fetchData(dateInput.value);
