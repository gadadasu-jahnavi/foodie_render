const TOKEN_KEY = "foodie.customer.token";
const USER_KEY = "foodie.customer.user";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let user = null; try { user = JSON.parse(localStorage.getItem(USER_KEY)); } catch {}
let cart = { sellerId: null, name: "", lines: {} };   // lines: menuItemId -> {id,name,emoji,price,qty}
let view = "restaurants", ratingDraft = {};

function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), 2400); }
function logout() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); location.replace("login.html"); }

async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem(TOKEN_KEY) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || (res.status === 403 && /deactivated/.test(data.error || ""))) { logout(); }
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

if (!localStorage.getItem(TOKEN_KEY)) logout();
$("#welcome").textContent = "Welcome, " + (user ? user.name : "") + "!";
$("#logout").onclick = logout;

const cartCount = () => Object.values(cart.lines).reduce((t, l) => t + l.qty, 0);
const cartTotal = () => Object.values(cart.lines).reduce((t, l) => t + l.qty * l.price, 0);
const updateCartBadge = () => { $("#cartCount").textContent = cartCount(); };

function show(v) {
  view = v;
  ["restaurants", "cart", "orders"].forEach((x) => { $("#v-" + x).hidden = x !== v; });
  document.querySelectorAll(".app-nav button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  if (v === "restaurants") loadRestaurants();
  if (v === "cart") renderCart();
  if (v === "orders") loadOrders();
}
document.querySelectorAll(".app-nav button").forEach((b) => b.onclick = () => show(b.dataset.view));

// ---------------- restaurants + menu
async function loadRestaurants() {
  $("#menuBox").hidden = true; $("#restList").hidden = false;
  try {
    const list = await api("GET", "/api/customer/restaurants");
    $("#restList").innerHTML = list.length ? list.map((r) => `
      <button class="r-card" data-id="${r.id}"><span class="r-emoji">${esc(r.emoji)}</span><b>${esc(r.name)}</b>
        <small>${esc(r.cuisine || "")}${r.city ? " · " + esc(r.city) : ""}</small>
        <small>${r.rating ? "★ " + r.rating + " (" + r.reviews + ")" : "New"}${r.price_for_two ? " · ₹" + r.price_for_two + " for two" : ""}</small></button>`).join("")
      : '<p class="sub">No restaurants are open yet. Check back soon!</p>';
  } catch (e) { toast(e.message); }
}
$("#restList").onclick = async (e) => {
  const c = e.target.closest(".r-card"); if (!c) return;
  try {
    const m = await api("GET", `/api/customer/restaurants/${c.dataset.id}/menu`);
    $("#restList").hidden = true; $("#menuBox").hidden = false; $("#menuTitle").textContent = m.restaurant;
    $("#menuList").innerHTML = m.items.length ? m.items.map((i) => `
      <div class="m-row"><span class="r-emoji">${esc(i.emoji)}</span><span class="m-n">${esc(i.name)}</span><b>₹${i.price}</b>
        <button class="btn-sm" data-add='${esc(JSON.stringify({ id: i.id, name: i.name, emoji: i.emoji, price: i.price }))}' data-seller="${c.dataset.id}" data-rest="${esc(m.restaurant)}">Add</button></div>`).join("")
      : '<p class="sub">This restaurant has not added dishes yet.</p>';
  } catch (er) { toast(er.message); }
};
$("#backRest").onclick = loadRestaurants;
$("#menuList").onclick = (e) => {
  const b = e.target.closest("[data-add]"); if (!b) return;
  const item = JSON.parse(b.dataset.add), sid = +b.dataset.seller;
  if (cart.sellerId && cart.sellerId !== sid && cartCount() && !confirm("Your cart has items from another restaurant. Start a new cart?")) return;
  if (cart.sellerId !== sid) cart = { sellerId: sid, name: b.dataset.rest, lines: {} };
  (cart.lines[item.id] ??= { ...item, qty: 0 }).qty++;
  updateCartBadge(); toast(item.name + " added");
};

// ---------------- cart + checkout
function renderCart() {
  const lines = Object.values(cart.lines).filter((l) => l.qty > 0);
  if (!lines.length) { $("#cartBox").innerHTML = '<p class="sub">Your cart is empty. Pick something tasty!</p>'; return; }
  $("#cartBox").innerHTML = `<p class="sub">From <b>${esc(cart.name)}</b></p>` + lines.map((l) => `
    <div class="m-row"><span class="r-emoji">${esc(l.emoji)}</span><span class="m-n">${esc(l.name)}</span>
      <span class="qty"><button data-q="-1" data-id="${l.id}">−</button>${l.qty}<button data-q="1" data-id="${l.id}">+</button></span><b>₹${l.qty * l.price}</b></div>`).join("") + `
    <div class="total"><span>Total</span><b>₹${cartTotal()}</b></div>
    <div class="field"><label for="addr">Delivery address</label><input id="addr" placeholder="House no, street, area, city" maxlength="300"></div>
    <button class="btn" id="place" type="button">Place order</button>`;
}
$("#cartBox").onclick = async (e) => {
  const q = e.target.closest("[data-q]");
  if (q) { const l = cart.lines[q.dataset.id]; l.qty += +q.dataset.q; if (l.qty <= 0) delete cart.lines[q.dataset.id]; updateCartBadge(); return renderCart(); }
  if (!e.target.closest("#place")) return;
  const btn = e.target.closest("#place"); btn.disabled = true;
  try {
    await api("POST", "/api/customer/orders", { seller_id: cart.sellerId, address: $("#addr").value, items: Object.values(cart.lines).map((l) => ({ menu_item_id: l.id, qty: l.qty })) });
    cart = { sellerId: null, name: "", lines: {} }; updateCartBadge(); toast("Order placed!"); show("orders");
  } catch (er) { toast(er.message); btn.disabled = false; }
};

// ---------------- orders + rating
async function loadOrders() {
  try {
    const list = await api("GET", "/api/customer/orders");
    $("#orderList").innerHTML = list.length ? list.map((o) => `
      <div class="o-card"><div class="o-h"><div><b>${esc(o.code)}</b> · ${esc(o.restaurant)}<small>${new Date(o.created_at).toLocaleString("en-IN")}</small></div><span class="tag t-${o.status.replace(/ /g, "")}">${esc(o.status)}</span></div>
        <div class="o-items">${o.items.map((i) => `${esc(i.emoji)} ${i.qty} × ${esc(i.name)}`).join("<br>")}</div>
        <div class="o-h"><b>₹${o.total}</b>${o.rider ? `<small>Rider: ${esc(o.rider)}</small>` : ""}</div>
        ${o.status === "Pending" ? `<button class="btn-sm no" data-cancel="${o.id}">Cancel order</button>` : ""}
        ${o.status === "Delivered" ? (o.review ? `<div class="stars">${"★".repeat(o.review.rating)}${"☆".repeat(5 - o.review.rating)} <small>${esc(o.review.comment)}</small></div>` : `
          <div class="rate" data-oid="${o.id}"><div class="stars pick">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" class="${(ratingDraft[o.id] || 0) >= n ? "on" : ""}">★</button>`).join("")}</div>
          <input class="rc" placeholder="Tell us about the food (optional)" maxlength="500"><button class="btn-sm" data-rate="${o.id}">Submit rating</button></div>`) : ""}
      </div>`).join("") : '<p class="sub">No orders yet.</p>';
  } catch (e) { toast(e.message); }
}
$("#orderList").onclick = async (e) => {
  const s = e.target.closest("[data-star]"), r = e.target.closest("[data-rate]"), c = e.target.closest("[data-cancel]");
  try {
    if (s) { const oid = s.closest(".rate").dataset.oid; ratingDraft[oid] = +s.dataset.star; s.closest(".pick").querySelectorAll("button").forEach((b) => b.classList.toggle("on", +b.dataset.star <= ratingDraft[oid])); }
    else if (r) {
      const oid = r.dataset.rate; if (!ratingDraft[oid]) return toast("Tap a star rating first");
      await api("POST", `/api/customer/orders/${oid}/review`, { rating: ratingDraft[oid], comment: r.closest(".rate").querySelector(".rc").value });
      toast("Thanks for your rating!"); loadOrders();
    } else if (c) { if (!confirm("Cancel this order?")) return; await api("POST", `/api/customer/orders/${c.dataset.cancel}/cancel`); toast("Order cancelled"); loadOrders(); }
  } catch (er) { toast(er.message); }
};
setInterval(() => { if (view === "orders" && !document.activeElement.matches("input")) loadOrders(); }, 8000);   // live status updates

show("restaurants");
