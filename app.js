(() => {
  const $ = (id) => document.getElementById(id);
  let records = [];
  let filtered = [];
  let page = 1;
  const pageSize = 25;
  let columns = [];
  let toastTimer;

  const preferredColumns = [
    ["asset", ["asset", "item", "name", "device", "equipment", "description", "model"]],
    ["serial", ["serial", "serial number", "sn"]],
    ["category", ["category", "type", "classification"]],
    ["company / site", ["company", "site", "location", "department", "branch", "owner"]],
    ["IP address", ["ip", "ip address", "ipv4"]],
    ["MAC address", ["mac", "mac address"]],
    ["status", ["status", "condition", "state"]]
  ];

  function keyName(s) { return String(s).toLowerCase().replace(/[_-]+/g, " ").trim(); }
  function firstValue(obj, aliases) {
    const entries = Object.entries(obj || {});
    for (const alias of aliases) {
      const found = entries.find(([k, v]) => keyName(k) === alias && v !== null && v !== undefined && String(v).trim() !== "");
      if (found) return found[1];
    }
    for (const alias of aliases) {
      const found = entries.find(([k, v]) => keyName(k).includes(alias) && v !== null && v !== undefined && String(v).trim() !== "");
      if (found) return found[1];
    }
    return "";
  }
  function flatten(input) {
    if (Array.isArray(input)) return input;
    if (input && typeof input === "object") {
      for (const k of ["items", "assets", "data", "records", "all_items", "inventory"]) {
        if (Array.isArray(input[k])) return input[k];
      }
      const arrays = Object.values(input).filter(Array.isArray);
      if (arrays.length === 1) return arrays[0];
      const values = Object.values(input);
      if (values.length && values.every(v => v && typeof v === "object" && !Array.isArray(v))) return values;
    }
    throw new Error("Could not find an asset list. Expected a JSON array or an object containing items/assets/data/records.");
  }
  function normalizeRows(arr) {
    return arr.map((item, index) => {
      if (item === null || typeof item !== "object") return { Asset: String(item ?? ""), _sourceIndex: index };
      return { ...item, _sourceIndex: index };
    });
  }
  function getDisplayColumns() {
    if (!records.length) return [];
    const allKeys = [...new Set(records.flatMap(r => Object.keys(r).filter(k => !k.startsWith("_"))))];
    const selected = [];
    for (const [label, aliases] of preferredColumns) {
      const found = allKeys.find(k => aliases.some(a => keyName(k) === a) || aliases.some(a => keyName(k).includes(a)));
      if (found && !selected.includes(found)) selected.push(found);
    }
    for (const k of allKeys) if (!selected.includes(k) && selected.length < 9) selected.push(k);
    return selected.slice(0, 9);
  }
  function val(record, key) {
    const value = record[key];
    if (value === null || value === undefined || typeof value === "object") return value == null ? "" : JSON.stringify(value);
    return String(value);
  }
  function uniqueFor(aliases) {
    const vals = new Set();
    records.forEach(r => { const v = firstValue(r, aliases); if (String(v).trim()) vals.add(String(v).trim()); });
    return [...vals].sort((a,b) => a.localeCompare(b));
  }
  function setOptions(select, values, label) {
    const current = select.value;
    select.innerHTML = "";
    const opt = document.createElement("option"); opt.value = ""; opt.textContent = label; select.appendChild(opt);
    values.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; select.appendChild(o); });
    if (values.includes(current)) select.value = current;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }
  function showToast(message) {
    const el = $("toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }
  function updateStats() {
    const cats = uniqueFor(["category", "type", "classification"]);
    const companies = uniqueFor(["company", "site", "location", "department", "branch", "owner"]);
    const serials = records.filter(r => String(firstValue(r, ["serial", "serial number", "sn"])).trim()).length;
    $("total-assets").textContent = records.length.toLocaleString();
    $("total-categories").textContent = cats.length.toLocaleString();
    $("total-companies").textContent = companies.length.toLocaleString();
    $("serial-count").textContent = serials.toLocaleString();
    const catCounts = new Map();
    records.forEach(r => { const c = String(firstValue(r, ["category", "type", "classification"]) || "Uncategorized"); catCounts.set(c, (catCounts.get(c)||0)+1); });
    const sorted = [...catCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 7);
    const overview = $("category-overview");
    if (!records.length) {
      overview.innerHTML = '<div class="empty-state"><div class="empty-icon">↥</div><strong>No inventory loaded yet</strong><p>Use <b>Import JSON</b> to load your <code>all_items.json</code> file.</p></div>';
    } else if (!sorted.length) {
      overview.innerHTML = '<div class="empty-small">No category field found in the imported data.</div>';
    } else {
      const max = sorted[0][1] || 1;
      overview.innerHTML = sorted.map(([name,count]) => `<div style="margin:14px 0"><div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;margin-bottom:7px"><span>${esc(name)}</span><strong>${count.toLocaleString()}</strong></div><div style="height:6px;background:#eef1f7;border-radius:8px;overflow:hidden"><div style="height:100%;width:${Math.max(2,count/max*100)}%;background:#5273e5;border-radius:8px"></div></div></div>`).join("");
    }
    const recent = $("recent-preview");
    if (!records.length) recent.innerHTML = '<div class="empty-small">Import an inventory file to see records here.</div>';
    else recent.innerHTML = records.slice(0,5).map(r => {
      const title = firstValue(r, ["asset", "item", "name", "device", "equipment", "description", "model"]) || "Untitled asset";
      const sub = firstValue(r, ["serial", "serial number", "sn", "ip", "ip address"]) || firstValue(r, ["company", "site", "location", "department"]) || "No serial / location details";
      const cat = firstValue(r, ["category", "type", "classification"]) || "Asset";
      return `<div class="recent-item"><div><strong>${esc(title)}</strong><small>${esc(sub)}</small></div><span class="pill">${esc(cat)}</span></div>`;
    }).join("");
  }
  function applyFilters() {
    const q = $("search-input").value.toLowerCase().trim();
    const cat = $("category-filter").value;
    const company = $("company-filter").value;
    filtered = records.filter(r => {
      const category = String(firstValue(r, ["category", "type", "classification"]) || "");
      const co = String(firstValue(r, ["company", "site", "location", "department", "branch", "owner"]) || "");
      const text = Object.entries(r).filter(([k]) => !k.startsWith("_")).map(([k,v]) => `${k} ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" ").toLowerCase();
      return (!q || text.includes(q)) && (!cat || category === cat) && (!company || co === company);
    });
    page = 1; renderTable();
  }
  function renderTable() {
    columns = getDisplayColumns();
    $("table-head").innerHTML = columns.map(k => `<th>${esc(k.replace(/[_-]+/g," "))}</th>`).join("");
    const totalPages = Math.max(1, Math.ceil(filtered.length/pageSize));
    page = Math.min(page,totalPages);
    const start = (page-1)*pageSize;
    const visible = filtered.slice(start,start+pageSize);
    $("table-body").innerHTML = visible.length ? visible.map(r => `<tr>${columns.map(k => `<td title="${esc(val(r,k))}">${esc(val(r,k) || "—")}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${Math.max(columns.length,1)}" style="text-align:center;padding:45px;color:#929aab">${records.length ? "No records match your filters." : "Import a JSON inventory file to get started."}</td></tr>`;
    $("result-count").textContent = `${filtered.length.toLocaleString()} record${filtered.length===1?"":"s"}`;
    $("page-summary").textContent = filtered.length ? `Showing ${start+1}–${Math.min(start+pageSize,filtered.length)} of ${filtered.length.toLocaleString()}` : "No records";
    $("prev-page").disabled = page <= 1;
    $("next-page").disabled = page >= totalPages;
  }
  function loadData(json, filename) {
    const arr = normalizeRows(flatten(json));
    records = arr;
    filtered = [...records];
    $("search-input").value = "";
    setOptions($("category-filter"), uniqueFor(["category","type","classification"]), "All categories");
    setOptions($("company-filter"), uniqueFor(["company","site","location","department","branch","owner"]), "All companies / sites");
    $("file-status").textContent = filename || "Imported JSON";
    updateStats(); applyFilters();
    showToast(`Loaded ${records.length.toLocaleString()} asset records.`);
  }
  function exportCsv() {
    if (!filtered.length) { showToast("No records to export. Import data or adjust your filters."); return; }
    const keys = [...new Set(filtered.flatMap(r => Object.keys(r).filter(k => !k.startsWith("_"))))];
    const quote = value => `"${String(value ?? "").replace(/"/g,'""')}"`;
    const csv = [keys.map(quote).join(","), ...filtered.map(r => keys.map(k => quote(typeof r[k] === "object" && r[k] !== null ? JSON.stringify(r[k]) : r[k])).join(","))].join("\r\n");
    const blob = new Blob(["\ufeff",csv], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "mirokti_inventory_export.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast(`Exported ${filtered.length.toLocaleString()} records to CSV.`);
  }
  function showView(view) {
    const dashboard = view === "dashboard";
    $("dashboard-view").hidden = !dashboard; $("inventory-view").hidden = dashboard;
    $("page-title").textContent = dashboard ? "Dashboard" : "Inventory";
    document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  }
  $("json-file").addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    try { loadData(JSON.parse(await file.text()), file.name); showView("dashboard"); }
    catch (err) { showToast(`Import failed: ${err.message || "Invalid JSON file"}`); }
    e.target.value = "";
  });
  $("export-csv").addEventListener("click", exportCsv);
  $("search-input").addEventListener("input", applyFilters);
  $("category-filter").addEventListener("change", applyFilters);
  $("company-filter").addEventListener("change", applyFilters);
  $("clear-filters").addEventListener("click", () => { $("search-input").value=""; $("category-filter").value=""; $("company-filter").value=""; applyFilters(); });
  $("prev-page").addEventListener("click", () => { if(page>1){page--;renderTable();} });
  $("next-page").addEventListener("click", () => { if(page<Math.ceil(filtered.length/pageSize)){page++;renderTable();} });
  document.querySelectorAll(".nav-item").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
  document.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => showView(b.dataset.goto)));
  updateStats(); renderTable();
})();