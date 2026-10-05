/* ==========================================================
   EV Monitor — โครงหน้าร่วม (Sidebar, Topbar, Icons, Helpers)
   ทุกหน้าในแอปใช้ <body data-page="..." data-title="..." data-sub="...">
   ========================================================== */

const ICON_PATHS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  car: '<path d="M5 17h14M6.5 17v2M17.5 17v2"/><path d="M3 13l2-5.5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5L21 13v4H3z"/><circle cx="7.5" cy="13.5" r="1"/><circle cx="16.5" cy="13.5" r="1"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2"/><path d="M6 10v4M9.5 10v4"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 5.5 5.8"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  wifiOff: '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2-1.5M12 20h.01"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  speed: '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-6 6-9 16-10-1 10-4 16-10 16z"/><path d="M4 21c4-6 8-9 12-11"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5v.7M12 17h.01"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h11"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5V8M12 16v1.5"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  plug: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
};

function icon(name, size = 18, cls = "") {
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;
}

const NAV = [
  { group: "ภาพรวม" },
  { key: "dashboard", label: "แดชบอร์ด",       href: "dashboard.html", icon: "dashboard" },
  { key: "map",       label: "แผนที่สด",        href: "map.html",       icon: "map" },
  { key: "alerts",    label: "การแจ้งเตือน",     href: "alerts.html",    icon: "bell", badge: () => EV.alerts.filter(a => !a.ack).length },
  { group: "ยานพาหนะ" },
  { key: "vehicles",  label: "รถทั้งหมด",        href: "vehicles.html",  icon: "car" },
  { key: "battery",   label: "สถานะแบตเตอรี่",   href: "battery.html",   icon: "battery" },
  { key: "charging",  label: "การชาร์จ",         href: "charging.html",  icon: "bolt" },
  { group: "การจัดการ" },
  { key: "drivers",   label: "พนักงานขับรถ",     href: "drivers.html",   icon: "users" },
  { key: "reports",   label: "รายงาน",           href: "reports.html",   icon: "chart" },
  { key: "settings",  label: "ตั้งค่า",           href: "settings.html",  icon: "settings" },
];

function renderShell() {
  const body = document.body;
  const page = body.dataset.page;
  const sidebar = document.getElementById("sidebar");
  const topbar = document.getElementById("topbar");

  if (sidebar) {
    sidebar.innerHTML = `
      <a class="brand" href="index.html">
        <span class="brand-mark">${icon("bolt", 20)}</span>
        <span class="brand-text"><strong>EV Monitor</strong><small>Fleet Management</small></span>
      </a>
      <nav class="side-nav">
        ${NAV.map(n => n.group
          ? `<p class="side-group">${n.group}</p>`
          : `<a href="${n.href}" class="side-link ${n.key === page ? "active" : ""}">
               ${icon(n.icon)}<span>${n.label}</span>
               ${n.badge && n.badge() ? `<em class="side-badge">${n.badge()}</em>` : ""}
             </a>`).join("")}
      </nav>
      <div class="side-foot">
        <a class="side-help" href="settings.html#support">
          ${icon("help", 20)}
          <span><strong>ต้องการความช่วยเหลือ?</strong><small>ติดต่อทีมซัพพอร์ต 24/7</small></span>
        </a>
        <p class="side-version">EV Monitor v2.0 · ${EV.org.city}</p>
      </div>`;
  }

  if (topbar) {
    const unread = EV.alerts.filter(a => !a.ack).length;
    topbar.innerHTML = `
      <button class="icon-btn menu-btn" aria-label="เมนู" onclick="document.body.classList.toggle('nav-open')">${icon("menu", 20)}</button>
      <div class="top-title">
        ${body.dataset.crumb ? `<p class="crumb">${body.dataset.crumb}</p>` : ""}
        <h1>${body.dataset.title || ""}</h1>
        ${body.dataset.sub ? `<p class="top-sub">${body.dataset.sub}</p>` : ""}
      </div>
      <div class="top-actions">
        <label class="top-search">${icon("search", 16)}<input type="search" placeholder="ค้นหารถ ทะเบียน หรือคนขับ…" onkeydown="if(event.key==='Enter')location.href='vehicles.html?q='+encodeURIComponent(this.value)"></label>
        <a class="icon-btn" href="alerts.html" aria-label="การแจ้งเตือน">${icon("bell", 19)}${unread ? `<span class="dot-count">${unread}</span>` : ""}</a>
        <div class="user-chip" tabindex="0">
          <span class="avatar">AE</span>
          <span class="user-meta"><strong>Admin EV</strong><small>ผู้ดูแลระบบ</small></span>
          <div class="user-menu">
            <a href="settings.html">${icon("settings", 16)} ตั้งค่าบัญชี</a>
            <a href="login.html">${icon("logout", 16)} ออกจากระบบ</a>
          </div>
        </div>
      </div>`;
  }

  const scrim = document.createElement("div");
  scrim.className = "scrim";
  scrim.onclick = () => body.classList.remove("nav-open");
  body.appendChild(scrim);

  document.querySelectorAll("[data-icon]").forEach(el => {
    el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon, +el.dataset.size || 18));
  });
}

/* ---------- Helpers ---------- */
const STATUS = {
  driving:  { th: "กำลังขับ",     cls: "s-driving"  },
  charging: { th: "กำลังชาร์จ",   cls: "s-charging" },
  parked:   { th: "จอดอยู่",      cls: "s-parked"   },
  low:      { th: "แบตต่ำ",       cls: "s-low"      },
  offline:  { th: "ออฟไลน์",      cls: "s-offline"  },
};
const statusBadge = s => `<span class="badge ${STATUS[s].cls}"><i></i>${STATUS[s].th}</span>`;
const socClass = v => v >= 70 ? "good" : v >= 30 ? "mid" : "bad";
const socBar = (v, w = 64) => `<span class="soc"><span class="soc-track" style="width:${w}px"><span class="soc-fill ${socClass(v)}" style="width:${v}%"></span></span><b>${v}%</b></span>`;
const fmt = (n, d = 0) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });
const qs = k => new URLSearchParams(location.search).get(k);

const COLORS = {
  navy: "#0B2545", blue: "#1F6FEB", green: "#0A9F6E", amber: "#E8A100", red: "#D7263D",
  slate: "#8A97A8", grid: "#E6EBF1", ink: "#0B1B2E", muted: "#5B6B80",
};

/* Chart.js defaults (ถ้ามีการโหลด) */
function chartDefaults() {
  if (!window.Chart) return;
  Chart.defaults.font.family = '"IBM Plex Sans Thai", "Inter", system-ui, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = COLORS.muted;
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.tooltip.backgroundColor = COLORS.ink;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 6;
  Chart.defaults.scale.grid.color = COLORS.grid;
  Chart.defaults.scale.border.display = false;
  Chart.defaults.maintainAspectRatio = false;
}

/* Leaflet map helper */
function makeMap(el, opts = {}) {
  if (!window.L) { el.innerHTML = '<div class="map-fallback">ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อโหลดแผนที่</div>'; return null; }
  const m = L.map(el, { zoomControl: opts.zoom !== false, scrollWheelZoom: opts.scroll !== false, attributionControl: true })
    .setView(opts.center || EV.org.center, opts.level || 11);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: "abcd", maxZoom: 19,
  }).addTo(m);
  return m;
}
function vehicleMarker(v) {
  const html = `<div class="vm ${STATUS[v.status].cls}">${icon(v.status === "charging" ? "bolt" : "car", 14)}</div><div class="vm-label">${v.id}</div>`;
  return L.marker([v.lat, v.lng], { icon: L.divIcon({ html, className: "vm-wrap", iconSize: [30, 30], iconAnchor: [15, 15] }) });
}
function stationMarker(s) {
  const html = `<div class="sm ${s.type}">${icon("plug", 13)}</div>`;
  return L.marker([s.lat, s.lng], { icon: L.divIcon({ html, className: "vm-wrap", iconSize: [24, 24], iconAnchor: [12, 12] }) });
}
function vehiclePopup(v) {
  const d = EV.driverById(v.driver);
  return `<div class="pop"><strong>${v.id}</strong> · ${v.model}<br>${statusBadge(v.status)}
    <dl><dt>แบตเตอรี่</dt><dd>${v.soc}%</dd><dt>ระยะวิ่งคงเหลือ</dt><dd>${v.range} กม.</dd><dt>ความเร็ว</dt><dd>${v.speed} กม./ชม.</dd><dt>คนขับ</dt><dd>${d.name}</dd></dl>
    <a href="vehicle.html?id=${v.id}">ดูรายละเอียด →</a></div>`;
}

/* Tabs / chips generic */
function bindTabs(root = document) {
  root.querySelectorAll("[data-tabs]").forEach(group => {
    const btns = group.querySelectorAll("[data-tab]");
    btns.forEach(b => b.addEventListener("click", () => {
      btns.forEach(x => x.classList.toggle("active", x === b));
      document.querySelectorAll(`[data-panel-of="${group.dataset.tabs}"]`).forEach(p =>
        p.hidden = p.dataset.panel !== b.dataset.tab);
      group.dispatchEvent(new CustomEvent("tabchange", { detail: b.dataset.tab }));
    }));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderShell();
  chartDefaults();
  bindTabs();
  if (typeof init === "function") init();
});
