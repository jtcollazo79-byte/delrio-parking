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
let unsubscribe = null;

// Set default date to today
const dateInput = document.getElementById("filterDate");
dateInput.value = new Date().toISOString().split("T")[0];

// Real-time listener
function startListening(dateStr) {
  if (unsubscribe) unsubscribe();

  const start = dateStr + "T00:00";
  const end = dateStr + "T23:59";

  unsubscribe = db.collection("infractions")
    .where("date", ">=", start)
    .where("date", "<=", end)
    .orderBy("date", "desc")
    .onSnapshot(snapshot => {
      allInfractions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      applyFilters();
    }, err => {
      console.error("Firestore error:", err);
      document.getElementById("infractionsList").innerHTML =
        '<p class="empty">Error cargando datos. ¿Firestore está en test mode?</p>';
    });
}

function applyFilters() {
  const statusFilter = document.getElementById("filterStatus").value;
  const spaceFilter = document.getElementById("filterSpace").value;
  const plateFilter = document.getElementById("filterPlate").value.toLowerCase();

  let filtered = allInfractions;

  if (statusFilter === "moved") filtered = filtered.filter(i => i.vehicleStatus === "moved");
  else if (statusFilter === "stayed") filtered = filtered.filter(i => i.vehicleStatus === "stayed");
  else if (statusFilter === "") {
    // "pending" means no status set
    const val = document.getElementById("filterStatus").selectedOptions[0].textContent;
    if (val.includes("Pendiente")) filtered = filtered.filter(i => !i.vehicleStatus);
  }

  if (spaceFilter) filtered = filtered.filter(i => i.space == spaceFilter);
  if (plateFilter) filtered = filtered.filter(i => i.plate && i.plate.toLowerCase().includes(plateFilter));

  renderList(filtered);
  updateStats();
}

function updateStats() {
  const total = allInfractions.length;
  const moved = allInfractions.filter(i => i.vehicleStatus === "moved").length;
  const stayed = allInfractions.filter(i => i.vehicleStatus === "stayed").length;
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
    const statusClass = inf.vehicleStatus === "moved" ? "status-moved"
      : inf.vehicleStatus === "stayed" ? "status-stayed" : "status-pending";
    const statusText = inf.vehicleStatus === "moved" ? "✅ Se Movió"
      : inf.vehicleStatus === "stayed" ? "🚫 Se Quedó" : "⏳ Pendiente";
    const tenant = TENANTS[inf.space - 1] || "—";
    const time = inf.date ? inf.date.split("T")[1] || "" : "";
    const date = inf.date ? inf.date.split("T")[0] || "" : "";

    return `
      <div class="infraction-card">
        <div class="field space-num">Espacio ${inf.space} — ${tenant}</div>
        <div class="field"><span class="status-badge ${statusClass}">${statusText}</span></div>
        <div class="field"><span>Placa:</span> <strong>${inf.plate || "—"}</strong></div>
        <div class="field"><span>Tipo:</span> <strong>${inf.type || "—"}</strong></div>
        <div class="field"><span>Fecha:</span> <strong>${date}</strong></div>
        <div class="field"><span>Hora:</span> <strong>${time}</strong></div>
        <div class="field"><span>Oficial:</span> <strong>${inf.officer || "—"}</strong></div>
        <div class="field"><span>Notas:</span> <strong>${inf.notes || "—"}</strong></div>
      </div>
    `;
  }).join("");
}

// Event listeners
dateInput.addEventListener("change", () => startListening(dateInput.value));
document.getElementById("btnToday").addEventListener("click", () => {
  dateInput.value = new Date().toISOString().split("T")[0];
  startListening(dateInput.value);
});
document.getElementById("btnRefresh").addEventListener("click", () => startListening(dateInput.value));
document.getElementById("filterStatus").addEventListener("change", applyFilters);
document.getElementById("filterSpace").addEventListener("change", applyFilters);
document.getElementById("filterPlate").addEventListener("input", applyFilters);

// Start
startListening(dateInput.value);
