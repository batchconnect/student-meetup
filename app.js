const API_URL = "https://script.google.com/macros/s/AKfycby0t9EWHPn17V-KK3mwfzfguMBVlIOMkvvNETn3TIjhtLEwecJpczreboqe64MdzPBf/exec";

const GROUPS = [
  {id:1, name:"Titans", icon:"🛡️"},
  {id:2, name:"Phoenix", icon:"🔥"},
  {id:3, name:"Vanguard", icon:"⚔️"},
  {id:4, name:"Legends", icon:"👑"},
  {id:5, name:"Warriors", icon:"🏆"}
];

function groupInfo(id) {
  return GROUPS.find(g => String(g.id) === String(id)) ||
    {id:id, name:"Unassigned", icon:"•"};
}

let scanner = null;
let scannerRunning = false;
let adminRows = [];
let audioCtx = null;

function api(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callback =
      "cb_" + Date.now() + "_" + Math.random().toString(36).slice(2);

    const script = document.createElement("script");

    const query = new URLSearchParams({
      action,
      callback,
      ...params
    });

    script.src = API_URL + "?" + query.toString();

    window[callback] = data => {
      cleanup();

      if (data && data.ok) {
        resolve(data);
      } else {
        reject(new Error(data?.error || "Request failed"));
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Could not connect to the server."));
    };

    document.body.appendChild(script);

    function cleanup() {
      delete window[callback];
      script.remove();
    }
  });
}

function showView() {
  const id = location.hash.replace("#", "") || "checkin";

  document.querySelectorAll(".view").forEach(v => {
    v.classList.toggle("active", v.id === id);
  });
}

window.addEventListener("hashchange", showView);
showView();

function toast(msg) {
  const el = document.getElementById("toast");

  el.textContent = msg;
  el.classList.add("show");

  setTimeout(() => el.classList.remove("show"), 2200);
}

function successSound() {
  try {
    audioCtx ||= new (window.AudioContext ||
      window.webkitAudioContext)();

    const now = audioCtx.currentTime;

    [880, 1175].forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();

      o.frequency.value = f;
      o.type = "sine";

      g.gain.setValueAtTime(.0001, now + i * .08);
      g.gain.exponentialRampToValueAtTime(
        .16,
        now + i * .08 + .02
      );

      g.gain.exponentialRampToValueAtTime(
        .0001,
        now + i * .08 + .22
      );

      o.connect(g).connect(audioCtx.destination);
      o.start(now + i * .08);
      o.stop(now + i * .08 + .24);
    });
  } catch (e) {}
}

function errorSound() {
  try {
    audioCtx ||= new (window.AudioContext ||
      window.webkitAudioContext)();

    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    const now = audioCtx.currentTime;

    o.type = "sawtooth";
    o.frequency.value = 180;

    g.gain.setValueAtTime(.08, now);
    g.gain.exponentialRampToValueAtTime(.0001, now + .35);

    o.connect(g).connect(audioCtx.destination);

    o.start();
    o.stop(now + .36);
  } catch (e) {}
}

function renderCheckin(data) {
  const el = document.getElementById("checkinResult");

  el.className =
    "result " +
    (data.status === "ALREADY" ? "error" : "success");

  if (data.status === "ALREADY") {
    const g = groupInfo(data.group);

    el.innerHTML = `
      <div>⚠️</div>
      <h2>Already checked in</h2>
      <p><b>${esc(data.name)}</b></p>
      <div class="team">
        ${g.icon} ${esc(g.name)}
      </div>
      <p class="muted">
        Group ${esc(data.group)} ·
        ${esc(data.checkedInAt || "Previously checked in")}
      </p>
    `;

    errorSound();

  } else {

    const g = groupInfo(data.group);

    el.innerHTML = `
      <div>✓</div>
      <h2>Check-in successful</h2>
      <p><b>${esc(data.name)}</b></p>
      <div class="team">
        ${g.icon} ${esc(g.name)}
      </div>
      <p>
        Group ${esc(data.group)} ·
        ${esc(data.registrationId)}
      </p>
    `;

    successSound();
  }

  el.classList.remove("hidden");
}

async function checkin(token) {
  token = (token || "").trim().toUpperCase();

  if (!token) return;

  try {
    renderCheckin(
      await api("checkin", {token})
    );
  } catch (e) {

    const el = document.getElementById("checkinResult");

    el.className = "result error";

    el.innerHTML = `
      <h2>Not found</h2>
      <p>${esc(e.message)}</p>
    `;

    el.classList.remove("hidden");

    errorSound();
  }
}

document.getElementById("manualCheckin").onclick =
  () => checkin(
    document.getElementById("manualToken").value
  );

async function startScanner() {

  if (scannerRunning) return;

  scanner ||= new Html5Qrcode("reader");

  try {

    await scanner.start(
      {facingMode:"environment"},
      {
        fps:10,
        qrbox:{width:250,height:250}
      },

      text => {

        scanner.pause(true);

        checkin(text).finally(() => {

          setTimeout(() => {
            try {
              scanner.resume();
            } catch (e) {}
          }, 1800);

        });
      },

      () => {}
    );

    scannerRunning = true;

    document
      .getElementById("startScanner")
      .classList.add("hidden");

    document
      .getElementById("stopScanner")
      .classList.remove("hidden");

  } catch (e) {

    toast(
      "Camera could not start. Use manual ID."
    );
  }
}

async function stopScanner() {

  if (scanner && scannerRunning) {
    await scanner.stop();
    scannerRunning = false;
  }

  document
    .getElementById("startScanner")
    .classList.remove("hidden");

  document
    .getElementById("stopScanner")
    .classList.add("hidden");
}

document.getElementById("startScanner").onclick =
  startScanner;

document.getElementById("stopScanner").onclick =
  stopScanner;

async function participantLookup() {

  const token =
    document
      .getElementById("participantToken")
      .value
      .trim()
      .toUpperCase();

  if (!token) return;

  const el =
    document.getElementById("participantResult");

  try {

    const d =
      await api("participant", {token});

    const g =
      groupInfo(d.group);

    el.className = "result success";

    el.innerHTML = `
      <p class="eyebrow">WELCOME</p>
      <h2>${esc(d.name)}</h2>
      <div class="team">
        ${g.icon} ${esc(g.name)}
      </div>
      <p>
        Group ${esc(d.group)} ·
        ${esc(d.registrationId)}
      </p>
    `;

  } catch (e) {

    el.className = "result error";

    el.innerHTML = `
      <h2>Not found</h2>
      <p>${esc(e.message)}</p>
    `;
  }

  el.classList.remove("hidden");
}

document.getElementById("lookupParticipant").onclick =
  participantLookup;

async function adminLoad() {

  const pin =
    document.getElementById("adminPin").value;

  try {

    const d =
      await api("adminList", {pin});

    adminRows = d.rows;

    document
      .getElementById("adminPanel")
      .classList.remove("hidden");

    renderAdmin();

    toast("Admin loaded");

  } catch (e) {

    toast(e.message);
  }
}

document.getElementById("adminLoad").onclick =
  adminLoad;

function renderAdmin() {

  const q =
    document
      .getElementById("adminSearch")
      .value
      .toLowerCase();

  const body =
    document.getElementById("adminTable");

  body.innerHTML = "";

  adminRows
    .filter(r =>
      (
        r.name + " " +
        r.registrationId + " " +
        groupInfo(r.group).name
      )
      .toLowerCase()
      .includes(q)
    )
    .forEach((r, i) => {

      const tr =
        document.createElement("tr");

      tr.innerHTML = `
        <td>${esc(r.name)}</td>
        <td>${esc(r.registrationId)}</td>

        <td>
          <select
            data-i="${i}"
            class="groupSelect">

            ${GROUPS.map(g => `
              <option
                value="${g.id}"
                ${String(g.id) === String(r.group)
                  ? "selected"
                  : ""}>
                ${g.icon} ${g.name}
              </option>
            `).join("")}

          </select>
        </td>

        <td>
          ${r.checkedIn ? "✓" : "—"}
        </td>
      `;

      body.appendChild(tr);
    });

  body
    .querySelectorAll(".groupSelect")
    .forEach(s => {

      s.onchange = () => {
        adminRows[
          Number(s.dataset.i)
        ].group = Number(s.value);
      };

    });
}

document.getElementById("adminSearch").oninput =
  renderAdmin;

document.getElementById("randomize").onclick = () => {

  const a = [...adminRows];

  for (let i = a.length - 1; i > 0; i--) {

    const j =
      Math.floor(Math.random() * (i + 1));

    [a[i], a[j]] =
      [a[j], a[i]];
  }

  a.forEach((r, i) => {
    r.group =
      GROUPS[i % GROUPS.length].id;
  });

  adminRows = a;

  renderAdmin();

  toast(
    "Groups randomized locally — press Save changes"
  );
};

document.getElementById("saveAll").onclick =
  async () => {

    const pin =
      document.getElementById("adminPin").value;

    try {

      await api("saveGroups", {
        pin,
        rows:JSON.stringify(adminRows)
      });

      toast("Groups saved");

    } catch (e) {

      toast(e.message);
    }
  };

function esc(s) {

  return String(s ?? "").replace(
    /[&<>"']/g,

    m => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#039;"
    }[m])
  );
}
