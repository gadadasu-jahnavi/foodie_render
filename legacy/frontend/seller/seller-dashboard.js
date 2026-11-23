const TOKEN = "foodie.seller.token";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let me = null;

function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), 2400); }
function logout() { localStorage.removeItem(TOKEN); location.href = "seller-account.html"; }

async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem(TOKEN) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) logout();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

const approved = () => me && me.status === "Approved";

function banner() {
  const b = $("#banner");
  if (approved()) { b.hidden = true; return; }
  b.hidden = false;
  b.className = "banner" + (me.status === "Rejected" ? " bad" : "");
  b.innerHTML = me.status === "Rejected"
    ? `<b>Registration rejected.</b> Reason: ${esc(me.reject_reason || "not given")}.`
    : `<b>Waiting for admin approval.</b> Your registration ID is <b>${esc(me.registration_id)}</b>. Orders and the menu unlock once the admin approves you.`;
}

async function loadOrders() {
  if (!approved()) { $("#orders").innerHTML = '<div class="card empty">Orders will appear here after approval.</div>'; return; }
  const list = await api("GET", "/api/seller/orders");
  $("#oCount").textContent = list.filter((o) => ["Pending", "Accepted", "Preparing"].includes(o.status)).length;
  $("#orders").innerHTML = list.length ? list.map((o) => `
    <div class="card">
      <div class="oh"><div><b>${esc(o.code)}</b> <span class="meta">· ${new Date(o.created_at).toLocaleString("en-IN")}</span>
        <div class="meta">${esc(o.customer)}${o.phone ? " · " + esc(o.phone) : ""}<br>Deliver to: ${esc(o.address)}</div></div>
        <span class="tag ${o.status.replace(/ /g, "")}">${esc(o.status)}</span></div>
      <div class="items">${o.items.map((i) => `${esc(i.emoji)} ${i.qty} × ${esc(i.name)}`).join("<br>")}</div>
      <div class="oh"><b>₹${o.total}</b>${o.rider ? `<span class="meta">Rider: ${esc(o.rider)}</span>` : ""}</div>
      ${o.next.length ? `<div class="acts">${o.next.map((n) => `<button class="act ${n === "Cancelled" ? "no" : ""}" data-id="${o.id}" data-s="${n}">${n === "Accepted" ? "Accept" : n === "Cancelled" ? "Reject" : "Start preparing"}</button>`).join("")}</div>` : ""}
      ${o.review ? `<div class="meta" style="margin-top:8px">Customer rating: ${"★".repeat(o.review.rating)}${"☆".repeat(5 - o.review.rating)} ${esc(o.review.comment)}</div>` : ""}
    </div>`).join("") : '<div class="card empty">No orders yet. They will show up here the moment a customer orders.</div>';
}

async function loadMenu() {
  const list = await api("GET", "/api/seller/menu");
  $("#menu").innerHTML = list.length ? list.map((m) => `
    <div class="card menu-row ${m.available ? "" : "off"}"><span style="font-size:26px">${esc(m.emoji)}</span><span class="n">${esc(m.name)}</span><b>₹${m.price}</b>
      <button class="act" data-toggle="${m.id}" data-av="${m.available}">${m.available ? "Mark sold out" : "Make available"}</button>
      <button class="act no" data-del="${m.id}">Delete</button></div>`).join("") : '<div class="card empty">Add your first dish above so customers can order.</div>';
}

document.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
  $("#tab-orders").hidden = b.dataset.tab !== "orders"; $("#tab-menu").hidden = b.dataset.tab !== "menu";
});

$("#orders").onclick = async (e) => {
  const b = e.target.closest("[data-s]"); if (!b) return;
  try { await api("PATCH", `/api/seller/orders/${b.dataset.id}/status`, { status: b.dataset.s }); toast("Order updated"); loadOrders(); } catch (er) { toast(er.message); }
};
$("#menu").onclick = async (e) => {
  try {
    const t = e.target.closest("[data-toggle]"), d = e.target.closest("[data-del]");
    if (t) await api("PATCH", `/api/seller/menu/${t.dataset.toggle}`, { available: t.dataset.av !== "true" });
    else if (d) { if (!confirm("Delete this dish?")) return; await api("DELETE", `/api/seller/menu/${d.dataset.del}`); }
    else return;
    loadMenu();
  } catch (er) { toast(er.message); }
};
$("#dishForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("POST", "/api/seller/menu", { name: $("#dName").value, emoji: $("#dEmoji").value || "🍽️", price: $("#dPrice").value });
    e.target.reset(); toast("Dish added"); loadMenu();
  } catch (er) { toast(er.message); }
};
$("#logout").onclick = logout;

(async function init() {
  if (!localStorage.getItem(TOKEN)) return logout();
  try {
    me = await api("GET", "/api/seller/me");
    $("#who").textContent = me.restaurant + " · " + me.owner;
    banner(); await loadOrders(); await loadMenu();
    setInterval(async () => { try { me = await api("GET", "/api/seller/me"); banner(); await loadOrders(); } catch (e) {} }, 8000);   // new orders + approval status
  } catch (e) { toast(e.message); }
})();
