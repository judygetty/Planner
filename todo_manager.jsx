import { useState, useEffect } from "react";

const TYPES = {
  task: { label: "Task", icon: "⬡", color: "#F59E0B", bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)" },
  meeting: { label: "Meeting", icon: "◈", color: "#60A5FA", bg: "rgba(96,165,250,0.15)", border: "rgba(96,165,250,0.4)" },
  reminder: { label: "Reminder", icon: "◉", color: "#F472B6", bg: "rgba(244,114,182,0.15)", border: "rgba(244,114,182,0.4)" },
};

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

function isToday(dateStr) {
  return dateStr === getTodayStr();
}

function formatDateTime(date, time) {
  if (!date) return null;
  const d = new Date(date + "T00:00:00");
  const dateLabel = isToday(date)
    ? "Today"
    : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return time ? `${dateLabel} · ${time}` : dateLabel;
}

function addHour(time) {
  const [h, m] = time.split(":").map(Number);
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const emptyForm = { title: "", type: "task", date: "", time: "", priority: "normal", notes: "" };

export default function TodoManager() {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [calStatus, setCalStatus] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [editId, setEditId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("todox_items");
        if (r) setItems(JSON.parse(r.value));
      } catch {}
      setLoaded(true);
    })();
  }, []);

  async function persist(next) {
    setItems(next);
    try { await window.storage.set("todox_items", JSON.stringify(next)); } catch {}
  }

  function handleAdd() {
    if (!form.title.trim()) return;
    if (editId) {
      persist(items.map(i => i.id === editId ? { ...i, ...form } : i));
      setEditId(null);
    } else {
      persist([...items, { id: Date.now().toString(), ...form, completed: false, createdAt: Date.now() }]);
    }
    setForm(emptyForm);
    setShowForm(false);
  }

  function startEdit(item) {
    setForm({ title: item.title, type: item.type, date: item.date, time: item.time, priority: item.priority, notes: item.notes || "" });
    setEditId(item.id);
    setShowForm(true);
  }

  function toggleComplete(id) {
    persist(items.map(i => i.id === id ? { ...i, completed: !i.completed } : i));
  }

  function deleteItem(id) {
    persist(items.filter(i => i.id !== id));
    setDeleteConfirm(null);
  }

  async function pushToCalendar(item) {
    setCalStatus(s => ({ ...s, [item.id]: "loading" }));
    try {
      const start = item.date
        ? (item.time ? `${item.date}T${item.time}:00` : `${item.date}T09:00:00`)
        : new Date().toISOString();
      const end = item.date
        ? (item.time ? `${item.date}T${addHour(item.time)}:00` : `${item.date}T10:00:00`)
        : new Date(Date.now() + 3600000).toISOString();

      const prompt = `Create a Google Calendar event:
- Title: ${item.title}
- Type: ${item.type}
- Start: ${start}
- End: ${end}
- Priority: ${item.priority}
${item.notes ? `- Notes: ${item.notes}` : ""}
Add it to my primary calendar now.`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
          mcp_servers: [{ type: "url", url: "https://calendarmcp.googleapis.com/mcp/v1", name: "google-calendar" }],
        }),
      });

      setCalStatus(s => ({ ...s, [item.id]: res.ok ? "ok" : "err" }));
      setTimeout(() => setCalStatus(s => { const n = { ...s }; delete n[item.id]; return n; }), 3000);
    } catch {
      setCalStatus(s => ({ ...s, [item.id]: "err" }));
      setTimeout(() => setCalStatus(s => { const n = { ...s }; delete n[item.id]; return n; }), 3000);
    }
  }

  const incomplete = items.filter(i => !i.completed);
  const todayItems = incomplete.filter(i => isToday(i.date));
  const sorted = [...items].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.priority !== b.priority) {
      if (a.priority === "high") return -1;
      if (b.priority === "high") return 1;
    }
    return a.createdAt - b.createdAt;
  });

  const summaryText = todayItems.length > 0
    ? `${todayItems.length} ${todayItems.length === 1 ? "item" : "items"} remaining for today`
    : incomplete.length > 0
    ? `${incomplete.length} ${incomplete.length === 1 ? "item" : "items"} pending`
    : items.length > 0 ? "All tasks complete ✓" : "Your list is empty";

  if (!loaded) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0F1117", color: "#666", fontFamily: "monospace" }}>
      Loading…
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0F1117", color: "#E8E6E0", fontFamily: "'DM Sans', sans-serif", padding: "0" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
        .item-row { transition: all 0.25s ease; }
        .item-row:hover .item-actions { opacity: 1; }
        .item-actions { opacity: 0; transition: opacity 0.2s; }
        .cal-btn { position: relative; cursor: pointer; }
        .add-btn:hover { background: #F59E0B !important; color: #0F1117 !important; }
        .type-pill { font-size: 11px; font-weight: 600; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 20px; }
        input, textarea, select { outline: none; }
        input::placeholder, textarea::placeholder { color: #444; }
        .check-box { cursor: pointer; flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; border: 2px solid #333; background: transparent; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .check-box:hover { border-color: #F59E0B; }
        .check-box.done { background: #2a2a2a; border-color: #2a2a2a; }
        .priority-high { border-left: 3px solid #EF4444 !important; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(4px); }
        .form-input { background: #1A1C24; border: 1px solid #2A2C34; border-radius: 8px; color: #E8E6E0; padding: 10px 14px; width: 100%; font-family: 'DM Sans', sans-serif; font-size: 14px; transition: border-color 0.2s; }
        .form-input:focus { border-color: #F59E0B; }
        .seg-btn { padding: 7px 14px; border: 1px solid #2A2C34; background: transparent; color: #888; font-size: 13px; font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all 0.15s; border-radius: 6px; }
        .seg-btn.active { background: #F59E0B; color: #0F1117; border-color: #F59E0B; font-weight: 600; }
        .seg-btn:hover:not(.active) { border-color: #444; color: #ccc; }
      `}</style>

      {/* Header */}
      <div style={{ background: "#13151E", borderBottom: "1px solid #1E2030", padding: "28px 40px 24px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, letterSpacing: "-0.5px", lineHeight: 1.1 }}>
                My Planner
              </div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 4, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              </div>
            </div>
            <button
              className="add-btn"
              onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm); }}
              style={{ background: "transparent", border: "1.5px solid #F59E0B", color: "#F59E0B", borderRadius: 8, padding: "9px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Add Item
            </button>
          </div>

          {/* Summary bar */}
          <div style={{ background: "#0F1117", border: "1px solid #1E2030", borderRadius: 10, padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: incomplete.length > 0 ? "#F59E0B" : "#22C55E", flexShrink: 0 }} />
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 15, color: incomplete.length > 0 ? "#E8E6E0" : "#22C55E", fontStyle: "italic" }}>
              {summaryText}
            </span>
            {items.length > 0 && (
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>
                {items.filter(i => i.completed).length}/{items.length} done
              </span>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 40px 80px" }}>
        {sorted.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#333" }}>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, fontStyle: "italic", marginBottom: 8 }}>Nothing here yet</div>
            <div style={{ fontSize: 13 }}>Add your first task, meeting, or reminder</div>
          </div>
        )}

        {sorted.map((item, idx) => {
          const t = TYPES[item.type];
          const isHigh = item.priority === "high";
          const dt = formatDateTime(item.date, item.time);
          const cs = calStatus[item.id];

          return (
            <div
              key={item.id}
              className={`item-row ${isHigh && !item.completed ? "priority-high" : ""}`}
              style={{
                background: "#13151E",
                border: "1px solid #1E2030",
                borderRadius: 10,
                padding: "14px 16px",
                marginBottom: 8,
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                opacity: item.completed ? 0.45 : 1,
                transition: "opacity 0.3s, transform 0.2s",
              }}
            >
              {/* Checkbox */}
              <div
                className={`check-box ${item.completed ? "done" : ""}`}
                onClick={() => toggleComplete(item.id)}
                style={{ marginTop: 2 }}
              >
                {item.completed && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="#555" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  {/* Type pill */}
                  <span className="type-pill" style={{ color: t.color, background: t.bg, border: `1px solid ${t.border}` }}>
                    {t.icon} {t.label}
                  </span>
                  {/* Priority */}
                  {isHigh && (
                    <span className="type-pill" style={{ color: "#EF4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}>
                      ↑ High Priority
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: 15,
                  fontWeight: 500,
                  color: item.completed ? "#555" : "#E8E6E0",
                  textDecoration: item.completed ? "line-through" : "none",
                  lineHeight: 1.3,
                  marginBottom: dt || item.notes ? 4 : 0,
                  wordBreak: "break-word",
                }}>
                  {item.title}
                </div>
                {item.notes && (
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 2, fontStyle: "italic" }}>{item.notes}</div>
                )}
                {dt && (
                  <div style={{ fontSize: 12, color: "#F59E0B", opacity: item.completed ? 0.5 : 0.8, display: "flex", alignItems: "center", gap: 4 }}>
                    <span>◷</span> {dt}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="item-actions" style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {/* Calendar */}
                {!item.completed && (
                  <button
                    className="cal-btn"
                    onClick={() => pushToCalendar(item)}
                    disabled={cs === "loading"}
                    title="Push to Google Calendar"
                    style={{
                      background: cs === "ok" ? "rgba(34,197,94,0.15)" : cs === "err" ? "rgba(239,68,68,0.15)" : "#1A1C24",
                      border: `1px solid ${cs === "ok" ? "rgba(34,197,94,0.4)" : cs === "err" ? "rgba(239,68,68,0.4)" : "#2A2C34"}`,
                      borderRadius: 6,
                      color: cs === "ok" ? "#22C55E" : cs === "err" ? "#EF4444" : "#888",
                      fontSize: 13,
                      padding: "6px 10px",
                      cursor: cs === "loading" ? "wait" : "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                      whiteSpace: "nowrap",
                      transition: "all 0.2s",
                    }}
                  >
                    {cs === "loading" ? "⟳" : cs === "ok" ? "✓ Added" : cs === "err" ? "✗ Failed" : "📅"}
                  </button>
                )}
                {/* Edit */}
                <button
                  onClick={() => startEdit(item)}
                  style={{ background: "#1A1C24", border: "1px solid #2A2C34", borderRadius: 6, color: "#888", fontSize: 13, padding: "6px 10px", cursor: "pointer" }}
                  title="Edit"
                >✎</button>
                {/* Delete */}
                {deleteConfirm === item.id ? (
                  <button
                    onClick={() => deleteItem(item.id)}
                    style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 6, color: "#EF4444", fontSize: 12, padding: "6px 10px", cursor: "pointer" }}
                  >Sure?</button>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(item.id)}
                    onBlur={() => setTimeout(() => setDeleteConfirm(null), 200)}
                    style={{ background: "#1A1C24", border: "1px solid #2A2C34", borderRadius: 6, color: "#888", fontSize: 13, padding: "6px 10px", cursor: "pointer" }}
                    title="Delete"
                  >✕</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowForm(false); setEditId(null); } }}>
          <div style={{ background: "#13151E", border: "1px solid #2A2C34", borderRadius: 16, padding: "28px", width: "100%", maxWidth: 480, boxShadow: "0 25px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, marginBottom: 22, fontStyle: "italic" }}>
              {editId ? "Edit Item" : "New Item"}
            </div>

            {/* Title */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: "#666", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Title</label>
              <input
                className="form-input"
                placeholder="What needs to be done?"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                autoFocus
              />
            </div>

            {/* Type */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: "#666", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Type</label>
              <div style={{ display: "flex", gap: 6 }}>
                {Object.entries(TYPES).map(([k, v]) => (
                  <button key={k} className={`seg-btn ${form.type === k ? "active" : ""}`} onClick={() => setForm(f => ({ ...f, type: k }))}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: "#666", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Priority</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[["normal", "↔ Normal"], ["high", "↑ High"]].map(([k, label]) => (
                  <button key={k} className={`seg-btn ${form.priority === k ? "active" : ""}`}
                    style={form.priority === k && k === "high" ? { background: "#EF4444", borderColor: "#EF4444", color: "#fff" } : {}}
                    onClick={() => setForm(f => ({ ...f, priority: k }))}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date & Time */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: "#666", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Date</label>
                <input type="date" className="form-input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  style={{ colorScheme: "dark" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#666", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Time</label>
                <input type="time" className="form-input" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                  style={{ colorScheme: "dark" }} />
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ fontSize: 11, color: "#666", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Notes</label>
              <textarea
                className="form-input"
                placeholder="Optional notes…"
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                style={{ resize: "none" }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm); }}
                style={{ background: "transparent", border: "1px solid #2A2C34", color: "#888", borderRadius: 8, padding: "10px 20px", fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
              >Cancel</button>
              <button
                onClick={handleAdd}
                disabled={!form.title.trim()}
                style={{ background: form.title.trim() ? "#F59E0B" : "#2A2C34", color: form.title.trim() ? "#0F1117" : "#555", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: form.title.trim() ? "pointer" : "default", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}
              >
                {editId ? "Save Changes" : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
