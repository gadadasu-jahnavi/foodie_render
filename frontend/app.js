/**
 * Foodie Platform — Frontend Application v2.1
 * Includes:
 * - High-end UI design preserving warm foodie color palette
 * - In-page notification banner and modal drawers (NO prompt/alert popups)
 * - Free rider dropdown allocation by name and city (NO UUID prompts)
 * - Restaurant menu photo upload & full edit (add, replace, remove photos)
 * - Rider registration restricted to available restaurant locations
 * - Automatic order allocation to free riders in same city with admin fallback
 * - SPA history management preventing back button from returning to signin page
 */

const app = document.getElementById('app');
const noticeEl = document.getElementById('banner-notice');
const modalContainer = document.getElementById('modal-container');
const API = '/api';

let token = localStorage.getItem('foodie_token');
let me = null;
let ws = null;
let noticeTimer = null;

// Safe HTML escape helper
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

// Currency formatter
const formatCurrency = amount => '₹' + Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

// In-Page Notification (NO intrusive popups)
function showNotice(text, type = 'info') {
  if (!noticeEl) return;
  noticeEl.className = 'banner-notice ' + type;
  noticeEl.innerHTML = `<span>✦</span> <span>${esc(text)}</span>`;
  noticeEl.classList.add('show');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    noticeEl.classList.remove('show');
  }, 3200);
}

// API client
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(API + path, { ...opts, headers });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = data.detail ?? data.message ?? 'Request failed';
    const message = Array.isArray(detail)
      ? detail.map(x => `${(x.loc || []).slice(1).join('.') || 'request'}: ${x.msg || 'Invalid value'}`).join(' · ')
      : typeof detail === 'string' ? detail : JSON.stringify(detail);
    throw new Error(message);
  }
  return data;
}

// Upload helper (supports File or base64)
async function uploadPhotoFile(file) {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = async () => {
      try {
        const res = await api('/upload-base64', {
          method: 'POST',
          body: JSON.stringify({ data: reader.result, filename: file.name })
        });
        resolve(res.url);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// History-safe navigation
function go(path, replace = false) {
  if (replace) {
    history.replaceState(null, '', '#' + path);
  } else {
    location.hash = path;
  }
}

// Brand Component
function brand() {
  return `
    <div class="brand" onclick="go(token ? '/dashboard' : '/')" style="cursor:pointer">
      <span class="brand-mark">✦</span>
      <span>foodie<small>GOOD FOOD · GOOD MOOD</small></span>
    </div>
  `;
}

// Landing Page
function landing() {
  // If already authenticated, redirect to dashboard immediately
  if (token) {
    history.replaceState(null, '', '#/dashboard');
    return renderDashboard();
  }

  app.innerHTML = `
    <div class="shell">
      <header class="top">
        ${brand()}
        <a class="top-link" href="#/user">Explore Foodie →</a>
      </header>

      <section class="hero">
        <span class="eyebrow">✦ A Fresh Culinary Journey</span>
        <h1>Good food brings<br><span>everyone together.</span></h1>
        <p>Discover vibrant local kitchens, elevate your restaurant business, or deliver joy with smart location-based order allocation.</p>
      </section>

      <section class="choice-grid">
        <a class="choice admin" href="#/admin">
          <div class="symbol">⌘</div>
          <h2>Admin Portal</h2>
          <p>Secure platform governance, restaurant approvals, user directories, and centralized rider allocation control.</p>
          <span class="go">Enter Admin Portal ↗</span>
        </a>

        <a class="choice" href="#/user">
          <div class="symbol">🍜</div>
          <h2>User Portal</h2>
          <p>One unified gateway for food lovers, passionate restaurant partners, and agile delivery riders.</p>
          <span class="go">Enter User Portal ↗</span>
        </a>
      </section>

      <p class="footnote">© ${new Date().getFullYear()} Foodie Platform · Crafted for exceptional food experiences</p>
    </div>
  `;
}

// User Portal Gateway
function userLanding() {
  if (token) {
    history.replaceState(null, '', '#/dashboard');
    return renderDashboard();
  }

  app.innerHTML = `
    <div class="shell">
      <header class="top">
        ${brand()}
        <a class="top-link" href="#/">← Home</a>
      </header>

      <section class="hero">
        <span class="eyebrow">✦ Choose Your Path</span>
        <h1>How will you<br><span>use Foodie today?</span></h1>
        <p>Pick your persona to enter your custom workspace. Each role is powered by dedicated features.</p>
      </section>

      <section class="role-grid">
        <article class="role-card">
          <span class="emoji">🍽️</span>
          <h3>Customer / Buyer</h3>
          <p>Browse menus from approved kitchens, customize meals, and enjoy instant order placement without popups.</p>
          <div class="row-actions">
            <button class="btn" style="padding:8px 16px; font-size:12.5px" onclick="go('/login/buyer')">Sign In</button>
            <button class="btn ghost" style="padding:8px 16px; font-size:12.5px" onclick="go('/register/buyer')">Register</button>
          </div>
        </article>

        <article class="role-card">
          <span class="emoji">👨‍🍳</span>
          <h3>Restaurant Partner</h3>
          <p>Manage your digital menu with high-res dish photos, live editing, and manage incoming orders seamlessly.</p>
          <div class="row-actions">
            <button class="btn" style="padding:8px 16px; font-size:12.5px" onclick="go('/login/seller')">Sign In</button>
            <button class="btn ghost" style="padding:8px 16px; font-size:12.5px" onclick="go('/register/seller')">Register</button>
          </div>
        </article>

        <article class="role-card">
          <span class="emoji">🛵</span>
          <h3>Delivery Rider</h3>
          <p>Register in active restaurant locations, receive auto-allocated deliveries, and update statuses on the fly.</p>
          <div class="row-actions">
            <button class="btn" style="padding:8px 16px; font-size:12.5px" onclick="go('/login/rider')">Sign In</button>
            <button class="btn ghost" style="padding:8px 16px; font-size:12.5px" onclick="go('/register/rider')">Register</button>
          </div>
        </article>
      </section>

      <p class="footnote">© ${new Date().getFullYear()} Foodie Platform</p>
    </div>
  `;
}

// Sign-In Page
function loginPage(portal) {
  if (token) {
    history.replaceState(null, '', '#/dashboard');
    return renderDashboard();
  }

  const admin = portal === 'admin';
  app.innerHTML = `
    <div class="shell">
      <header class="top">
        ${brand()}
        <a class="top-link" href="#/${admin ? '' : 'user'}">← ${admin ? 'Home' : 'User Roles'}</a>
      </header>

      <section class="panel">
        <a class="back" href="#/${admin ? '' : 'user'}">← ${admin ? 'Choose portal' : 'Choose another role'}</a>
        <h1>${admin ? 'Administrator Access' : 'Welcome Back'}</h1>
        <p class="sub">${admin ? 'Sign in to platform control and admin tools.' : `Sign in to your ${portal.toUpperCase()} account.`}</p>

        <form id="loginForm">
          <div class="field">
            <label>Email Address</label>
            <input name="email" type="email" required autocomplete="username" placeholder="you@example.com">
          </div>
          <div class="field">
            <label>Password</label>
            <input name="password" type="password" required minlength="8" autocomplete="current-password" placeholder="••••••••">
          </div>
          <p class="message" id="msg"></p>
          <button class="btn full" id="submitBtn">Sign In</button>
        </form>

        ${!admin ? `
          <p class="switch">
            Don't have an account yet? 
            <a href="#/register/${portal}">Create a ${portal} account</a>
          </p>
        ` : ''}
      </section>
    </div>
  `;

  document.getElementById('loginForm').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const msg = document.getElementById('msg');
    const submitBtn = document.getElementById('submitBtn');
    msg.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Authenticating…';

    try {
      const d = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: f.get('email'), password: f.get('password'), portal })
      });
      token = d.access_token;
      me = d.user;
      localStorage.setItem('foodie_token', token);
      localStorage.setItem('foodie_user', JSON.stringify(me));
      connectSocket();
      showNotice(`Signed in as ${me.name}`, 'success');
      // Crucial: Use replaceState so back button cannot return to signin page!
      history.replaceState(null, '', '#/dashboard');
      renderDashboard();
    } catch (err) {
      msg.textContent = err.message;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  };
}

// Registration Page (With Dynamic Restaurant Locations for Riders)
async function registerPage(role) {
  if (token) {
    history.replaceState(null, '', '#/dashboard');
    return renderDashboard();
  }

  const roleTitle = {
    buyer: 'Customer / Buyer Account',
    seller: 'Restaurant Partner Account',
    rider: 'Delivery Rider Account'
  }[role] || 'Account';

  // For riders: fetch available restaurant locations
  let locationOptionsHtml = '';
  if (role === 'rider') {
    locationOptionsHtml = `<option value="">Loading restaurant locations…</option>`;
  }

  app.innerHTML = `
    <div class="shell">
      <header class="top">
        ${brand()}
        <a class="top-link" href="#/user">← User Portal</a>
      </header>

      <section class="panel">
        <a class="back" href="#/user">← Choose another role</a>
        <h1>Create ${roleTitle}</h1>
        <p class="sub">Register securely to join the Foodie culinary network.</p>

        <form id="regForm">
          <div class="field">
            <label>Full Name</label>
            <input name="name" required minlength="2" placeholder="e.g. Alex Morgan">
          </div>

          <div class="field">
            <label>Email Address</label>
            <input name="email" type="email" required placeholder="alex@example.com">
          </div>

          <div class="field">
            <label>Phone Number</label>
            <input name="phone" type="tel" placeholder="+91 98765 43210">
          </div>

          ${role === 'rider' ? `
            <div class="field">
              <label>Operating City / Hub (From Restaurant Locations)</label>
              <select name="city" id="riderCitySelect" required>
                ${locationOptionsHtml}
              </select>
              <span class="field-hint">Riders receive auto-allocated deliveries within their chosen restaurant hub.</span>
            </div>
          ` : `
            <div class="field">
              <label>City</label>
              <input name="city" placeholder="e.g. Bengaluru" required>
            </div>
          `}

          ${role === 'seller' ? `
            <div class="field">
              <label>Restaurant / Kitchen Name</label>
              <input name="restaurant_name" required placeholder="e.g. Spice Route Bistro">
            </div>
          ` : ''}

          <div class="field">
            <label>Password (Minimum 8 characters)</label>
            <input name="password" type="password" minlength="8" required placeholder="••••••••">
          </div>

          <p class="message" id="msg"></p>
          <button class="btn full" id="submitBtn">Complete Registration</button>
        </form>

        <p class="switch">
          Already registered? <a href="#/login/${role}">Sign in here</a>
        </p>
      </section>
    </div>
  `;

  // Fetch available restaurant locations for riders
  if (role === 'rider') {
    try {
      const locData = await api('/locations');
      const select = document.getElementById('riderCitySelect');
      if (select && locData.locations) {
        select.innerHTML = `
          <option value="">-- Choose Operating Location --</option>
          ${locData.locations.map(loc => `<option value="${esc(loc)}">${esc(loc)}</option>`).join('')}
        `;
      }
    } catch (e) {
      const select = document.getElementById('riderCitySelect');
      if (select) {
        select.innerHTML = `
          <option value="Bengaluru">Bengaluru</option>
          <option value="Mumbai">Mumbai</option>
          <option value="Delhi NCR">Delhi NCR</option>
          <option value="Hyderabad">Hyderabad</option>
        `;
      }
    }
  }

  document.getElementById('regForm').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = Object.fromEntries(f.entries());
    body.role = role;
    const msg = document.getElementById('msg');
    const submitBtn = document.getElementById('submitBtn');
    msg.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account…';

    try {
      const d = await api('/auth/register', { method: 'POST', body: JSON.stringify(body) });
      showNotice(d.message || 'Account created successfully! Please sign in.', 'success');
      go('/login/' + role, true);
    } catch (err) {
      msg.textContent = err.message;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Complete Registration';
    }
  };
}

// WebSocket Live Updates
function connectSocket() {
  if (!token) return;
  try {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
    ws.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'order_created') {
          showNotice(`New Order #${(d.order_id || '').slice(0, 8)} created in ${d.city || 'your area'}!`, 'info');
          // If on orders view, refresh quietly
          if (location.hash === '#/dashboard/orders') renderOrders();
        } else if (d.type === 'order_status') {
          showNotice(`Order #${(d.order_id || '').slice(0, 8)} status updated to ${d.status}`, 'info');
          if (location.hash === '#/dashboard/orders') renderOrders();
        } else if (d.type === 'rider_assigned') {
          showNotice(`Rider ${d.rider_name || ''} assigned to Order #${(d.order_id || '').slice(0, 8)}`, 'info');
          if (location.hash === '#/dashboard/orders') renderOrders();
        }
      } catch (err) {}
    };
  } catch (e) {}
}

// Dashboard Shell
function dashboardShell(activeTab = 'overview') {
  const role = me?.role || 'buyer';
  const roleIcons = { admin: '👑', buyer: '🍽️', seller: '👨‍🍳', rider: '🛵' };
  const roleLabels = {
    admin: 'Administrator',
    buyer: 'Food Connoisseur',
    seller: 'Kitchen Partner',
    rider: 'Delivery Fleet'
  };

  app.innerHTML = `
    <div class="shell">
      <div class="dashboard">
        <aside class="side">
          ${brand()}

          <div class="role-badge-box">
            <small>Active Workspace</small>
            <strong><span>${roleIcons[role]}</span> ${esc(roleLabels[role])}</strong>
          </div>

          <nav>
            <button class="${activeTab === 'overview' ? 'active' : ''}" onclick="go('/dashboard/overview')">
              <span class="nav-icon">📊</span> Overview
            </button>

            ${role === 'buyer' ? `
              <button class="${activeTab === 'restaurants' ? 'active' : ''}" onclick="go('/dashboard/restaurants')">
                <span class="nav-icon">🍜</span> Browse Menus
              </button>
            ` : ''}

            ${role === 'seller' ? `
              <button class="${activeTab === 'menu' ? 'active' : ''}" onclick="go('/dashboard/menu')">
                <span class="nav-icon">📋</span> Menu & Photos
              </button>
            ` : ''}

            <button class="${activeTab === 'orders' ? 'active' : ''}" onclick="go('/dashboard/orders')">
              <span class="nav-icon">📦</span> Orders
            </button>

            ${role === 'admin' ? `
              <button class="${activeTab === 'users' ? 'active' : ''}" onclick="go('/dashboard/users')">
                <span class="nav-icon">👥</span> Users
              </button>
              <button class="${activeTab === 'restaurants_admin' ? 'active' : ''}" onclick="go('/dashboard/restaurants_admin')">
                <span class="nav-icon">🏪</span> Restaurant Approvals
              </button>
            ` : ''}
          </nav>

          <button class="logout" onclick="logout()">
            <span>🚪</span> Sign Out
          </button>
        </aside>

        <main class="dash-main">
          <header class="dash-head">
            <div>
              <span class="eyebrow" style="padding:4px 10px; font-size:10px; margin-bottom:6px">
                ${esc(role.toUpperCase())} PORTAL
              </span>
              <h1>Welcome, ${esc(me?.name || 'Friend')} 👋</h1>
              <p class="muted" style="margin:4px 0 0">
                ${me?.city ? `Operating in <strong>${esc(me.city)}</strong> · ` : ''}Foodie Connected
              </p>
            </div>
            <div class="status-pill">
              <span class="live-dot"></span> Live Hub
            </div>
          </header>

          <div id="dashContent">
            <div class="loading">
              <div class="spinner"></div>
              <p>Loading your culinary workspace…</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  `;
}

// Ensure Profile Loaded
async function ensureAuth() {
  if (!token) {
    history.replaceState(null, '', '#/');
    landing();
    return false;
  }
  if (!me) {
    try {
      me = JSON.parse(localStorage.getItem('foodie_user') || 'null');
      if (!me) {
        me = await api('/me');
        localStorage.setItem('foodie_user', JSON.stringify(me));
      }
    } catch (e) {
      logout(false);
      return false;
    }
  }
  return true;
}

// Overview Dashboard
async function renderDashboard() {
  return renderOverview();
}

async function renderOverview() {
  if (!await ensureAuth()) return;
  dashboardShell('overview');
  const host = document.getElementById('dashContent');

  try {
    if (me.role === 'admin') {
      const d = await api('/admin/overview');
      host.innerHTML = `
        <div class="stats">
          <div class="stat"><small>Platform Users</small><strong>${d.profiles}</strong></div>
          <div class="stat"><small>Restaurants</small><strong>${d.restaurants}</strong></div>
          <div class="stat"><small>Total Orders</small><strong>${d.orders}</strong></div>
          <div class="stat"><small>Pending Approvals</small><strong style="color:var(--orange)">${d.pending_restaurants}</strong></div>
        </div>

        <div class="content-card">
          <div class="card-header">
            <div>
              <h2>Platform Administration</h2>
              <p class="muted" style="margin:4px 0 0">Real-time oversight of kitchen partners, delivery allocations, and orders.</p>
            </div>
            <div class="row-actions">
              <button class="btn ghost" onclick="go('/dashboard/restaurants_admin')">Review Approvals</button>
              <button class="btn" onclick="go('/dashboard/orders')">Allocate Riders</button>
            </div>
          </div>
          <p style="font-size:13.5px; line-height:1.7; color:var(--muted)">
            Orders placed in active restaurant cities are automatically allocated to free registered riders. If no free rider is available in the city, orders surface immediately under Orders for manual admin assignment via the one-click rider dropdown.
          </p>
        </div>
      `;
    } else if (me.role === 'buyer') {
      const rs = await api('/restaurants');
      const orders = await api('/orders');
      host.innerHTML = `
        <div class="stats">
          <div class="stat"><small>Kitchens in City</small><strong>${rs.length}</strong></div>
          <div class="stat"><small>Your Orders</small><strong>${orders.length}</strong></div>
          <div class="stat"><small>Delivery City</small><strong style="font-size:20px; margin-top:14px">${esc(me.city || 'National')}</strong></div>
          <div class="stat"><small>Delivery Status</small><strong style="color:var(--green); font-size:20px; margin-top:14px">Active</strong></div>
        </div>

        <div class="content-card">
          <div class="card-header">
            <div>
              <h2>Craving something delicious?</h2>
              <p class="muted" style="margin:4px 0 0">Discover freshly made delicacies from approved gourmet restaurants.</p>
            </div>
            <button class="btn" onclick="go('/dashboard/restaurants')">Browse Menus Now →</button>
          </div>
        </div>
      `;
    } else if (me.role === 'seller') {
      const items = await api('/menu?seller_id=' + me.id);
      const orders = await api('/orders');
      const activeOrders = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));

      host.innerHTML = `
        <div class="stats">
          <div class="stat"><small>Menu Dishes</small><strong>${items.length}</strong></div>
          <div class="stat"><small>Active Orders</small><strong style="color:var(--orange)">${activeOrders.length}</strong></div>
          <div class="stat"><small>Total Orders</small><strong>${orders.length}</strong></div>
          <div class="stat"><small>Kitchen City</small><strong style="font-size:20px; margin-top:14px">${esc(me.city || 'Set City')}</strong></div>
        </div>

        <div class="content-card">
          <div class="card-header">
            <div>
              <h2>Kitchen Operations</h2>
              <p class="muted" style="margin:4px 0 0">Upload dish photos, edit prices and descriptions, or process incoming orders.</p>
            </div>
            <div class="row-actions">
              <button class="btn ghost" onclick="go('/dashboard/menu')">Manage Menu & Photos</button>
              <button class="btn" onclick="go('/dashboard/orders')">View Incoming Orders</button>
            </div>
          </div>
        </div>
      `;
    } else {
      // Rider
      const orders = await api('/orders');
      const active = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
      const completed = orders.filter(o => o.status === 'delivered');

      host.innerHTML = `
        <div class="stats">
          <div class="stat"><small>Active Deliveries</small><strong style="color:var(--orange)">${active.length}</strong></div>
          <div class="stat"><small>Delivered Total</small><strong>${completed.length}</strong></div>
          <div class="stat"><small>Fleet Status</small><strong style="color:${active.length === 0 ? 'var(--green)' : 'var(--orange)'}; font-size:20px; margin-top:14px">${active.length === 0 ? '● Free' : '● Busy'}</strong></div>
          <div class="stat"><small>Operating Hub</small><strong style="font-size:20px; margin-top:14px">${esc(me.city || 'Assigned')}</strong></div>
        </div>

        <div class="content-card">
          <div class="card-header">
            <div>
              <h2>Rider Delivery Feed</h2>
              <p class="muted" style="margin:4px 0 0">Orders in ${esc(me.city || 'your area')} are automatically allocated to you when you are free.</p>
            </div>
            <button class="btn" onclick="go('/dashboard/orders')">Open Delivery Queue →</button>
          </div>
        </div>
      `;
    }
  } catch (err) {
    host.innerHTML = `<div class="content-card"><p class="message">${esc(err.message)}</p></div>`;
  }
}

// Buyer: Browse Restaurants with Photo Menus & Inline Checkout (NO PROMPT)
async function renderRestaurants() {
  if (!await ensureAuth()) return;
  dashboardShell('restaurants');
  const host = document.getElementById('dashContent');

  try {
    const rs = await api('/restaurants');
    if (!rs.length) {
      host.innerHTML = `
        <div class="content-card">
          <h2>Approved Kitchens</h2>
          <p class="muted">No restaurants currently approved in the platform. Check back shortly!</p>
        </div>
      `;
      return;
    }

    let cardsHtml = '';
    for (const r of rs) {
      const items = await api('/menu?seller_id=' + r.owner_id);
      cardsHtml += `
        <article class="restaurant-card">
          <div class="restaurant-card-header">
            <h3>${esc(r.name)}</h3>
            <div class="restaurant-meta">
              <span>📍 ${esc(r.city || 'Local')}</span>
              <span>•</span>
              <span>${items.length} Dishes</span>
            </div>
          </div>

          <div class="restaurant-items-list">
            ${items.length ? items.map(i => `
              <div class="dish-card">
                <div class="dish-thumb">
                  ${i.image_url ? `<img src="${esc(i.image_url)}" alt="${esc(i.name)}">` : `<span class="dish-thumb-placeholder">🍲</span>`}
                </div>
                <div class="dish-info">
                  <strong>${esc(i.name)}</strong>
                  <p>${esc(i.description || 'Deliciously prepared freshly to order.')}</p>
                  <span class="dish-price">${formatCurrency(i.price)}</span>
                </div>
                <button class="btn" style="padding:8px 14px; font-size:12px" onclick="openOrderModal('${esc(r.owner_id)}', '${esc(r.name)}', '${esc(i.id)}', '${esc(i.name)}', ${Number(i.price)})">
                  Order
                </button>
              </div>
            `).join('') : '<p class="muted" style="font-size:13px">No menu items published yet.</p>'}
          </div>
        </article>
      `;
    }

    host.innerHTML = `
      <div class="content-card">
        <div class="card-header">
          <div>
            <h2>Explore Local Kitchens</h2>
            <p class="muted" style="margin:4px 0 0">Choose a dish and place your order directly.</p>
          </div>
        </div>
        <div class="restaurant-grid">
          ${cardsHtml}
        </div>
      </div>
    `;
  } catch (err) {
    host.innerHTML = `<p class="message">${esc(err.message)}</p>`;
  }
}

// Inline Order Checkout Modal (Replaces window.prompt completely)
function openOrderModal(sellerId, restaurantName, itemId, itemName, price) {
  modalContainer.innerHTML = `
    <div class="checkout-modal-backdrop open" id="orderModalBackdrop" onclick="if(event.target===this)closeModal()">
      <div class="checkout-modal">
        <div class="modal-header">
          <h3>Confirm Your Order</h3>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="order-summary-box">
            <p style="margin:0 0 4px; font-size:12px; color:var(--muted)">Ordering from <strong>${esc(restaurantName)}</strong></p>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px">
              <strong style="font-size:16px">${esc(itemName)}</strong>
              <strong style="font-size:16px; color:var(--orange2)">${formatCurrency(price)}</strong>
            </div>
          </div>

          <form id="orderCheckoutForm">
            <div class="field">
              <label>Delivery Address</label>
              <textarea name="address" rows="3" required placeholder="Flat/House no, Street name, Landmark, City">${esc(me?.city ? me.city + ', ' : '')}</textarea>
            </div>
            <p class="message" id="orderModalMsg"></p>
            <div class="row-actions" style="margin-top:16px">
              <button type="button" class="btn outline" style="flex:1" onclick="closeModal()">Cancel</button>
              <button type="submit" class="btn" style="flex:2" id="orderConfirmBtn">Place Order Now</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  document.getElementById('orderCheckoutForm').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const address = f.get('address').trim();
    const msg = document.getElementById('orderModalMsg');
    const btn = document.getElementById('orderConfirmBtn');
    if (!address) {
      msg.textContent = 'Please enter a complete delivery address';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Submitting order…';

    try {
      const res = await api('/orders', {
        method: 'POST',
        body: JSON.stringify({
          seller_id: sellerId,
          items: [{ id: itemId, quantity: 1 }],
          address
        })
      });
      closeModal();
      showNotice(
        res.auto_allocated 
          ? `Order #${res.id.slice(0, 8)} placed! Auto-allocated to rider ${res.rider_name || ''}.` 
          : `Order #${res.id.slice(0, 8)} placed successfully! Pending rider allocation.`, 
        'success'
      );
      go('/dashboard/orders');
    } catch (err) {
      msg.textContent = err.message;
      btn.disabled = false;
      btn.textContent = 'Place Order Now';
    }
  };
}

function closeModal() {
  modalContainer.innerHTML = '';
}

// Seller: Menu Management with Photo Upload & Full Edit (Add, Replace, Remove)
async function renderMenu() {
  if (!await ensureAuth()) return;
  dashboardShell('menu');
  const host = document.getElementById('dashContent');

  try {
    const items = await api('/menu?seller_id=' + me.id);
    let stagedPhotoUrl = '';

    host.innerHTML = `
      <div class="content-card">
        <div class="card-header">
          <div>
            <h2>Add New Menu Item</h2>
            <p class="muted" style="margin:4px 0 0">Upload dish photos and details to attract hungry food lovers.</p>
          </div>
        </div>

        <form id="addDishForm" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px; align-items:start">
          <div class="field" style="margin:0">
            <label>Dish Name *</label>
            <input name="name" required placeholder="e.g. Signature Truffle Pasta">
          </div>

          <div class="field" style="margin:0">
            <label>Price (₹) *</label>
            <input name="price" type="number" min="1" step="1" required placeholder="e.g. 349">
          </div>

          <div class="field" style="margin:0">
            <label>Category</label>
            <select name="category">
              <option value="Main">Main Course</option>
              <option value="Starters">Starters & Appetizers</option>
              <option value="Desserts">Desserts</option>
              <option value="Beverages">Beverages</option>
              <option value="Snacks">Snacks</option>
            </select>
          </div>

          <div class="field" style="grid-column:1/-1; margin:0">
            <label>Description</label>
            <textarea name="description" rows="2" placeholder="Describe the ingredients, flavors, and allergens…"></textarea>
          </div>

          <div class="field" style="grid-column:1/-1; margin:0">
            <label>Dish Photo (Upload or drag image)</label>
            <div class="photo-uploader" id="photoDropArea">
              <input type="file" id="dishPhotoInput" accept="image/*">
              <div class="uploader-icon">📷</div>
              <strong style="font-size:13.5px">Click or drag image here to upload photo</strong>
              <small class="muted">PNG, JPG, WebP up to 10MB</small>
            </div>
            <div id="addPhotoPreview"></div>
          </div>

          <div style="grid-column:1/-1; display:flex; justify-content:flex-end">
            <button class="btn" id="addDishBtn">✦ Publish Dish to Menu</button>
          </div>
        </form>
      </div>

      <div class="content-card">
        <div class="card-header">
          <div>
            <h2>Your Current Menu (${items.length} items)</h2>
            <p class="muted" style="margin:4px 0 0">Edit dish details, change or remove photos anytime.</p>
          </div>
        </div>

        ${items.length ? `
          <div class="seller-menu-grid">
            ${items.map(i => `
              <div class="seller-dish-card">
                <div class="seller-dish-img-box">
                  ${i.image_url ? `<img src="${esc(i.image_url)}" alt="${esc(i.name)}">` : `<span style="font-size:48px">🍲</span>`}
                </div>
                <div class="seller-dish-body">
                  <span class="pill" style="align-self:flex-start; margin-bottom:8px; background:var(--orange-pale); color:var(--orange2)">${esc(i.category || 'Main')}</span>
                  <h4 class="seller-dish-title">${esc(i.name)}</h4>
                  <p class="seller-dish-desc">${esc(i.description || 'No description provided.')}</p>
                  <div class="seller-dish-footer">
                    <strong style="color:var(--orange2); font-size:16px">${formatCurrency(i.price)}</strong>
                    <div class="row-actions">
                      <button class="tiny blue" onclick="openEditDishModal('${esc(i.id)}')">✏️ Edit</button>
                      <button class="tiny red" onclick="deleteDish('${esc(i.id)}')">🗑️ Remove</button>
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <p class="empty">No menu items added yet. Use the form above to publish your first dish!</p>
        `}
      </div>
    `;

    // Photo input handling for Add Dish
    const dropArea = document.getElementById('photoDropArea');
    const fileInput = document.getElementById('dishPhotoInput');
    const previewContainer = document.getElementById('addPhotoPreview');

    dropArea.onclick = () => fileInput.click();
    fileInput.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        showNotice('Uploading dish photo…', 'info');
        stagedPhotoUrl = await uploadPhotoFile(file);
        previewContainer.innerHTML = `
          <div class="uploader-preview-container">
            <img src="${esc(stagedPhotoUrl)}" class="uploader-preview-img" alt="Preview">
            <div>
              <strong style="font-size:13px">Photo ready</strong>
              <br><small class="muted">${esc(file.name)}</small>
            </div>
            <button type="button" class="tiny red" style="margin-left:auto" id="removeStagedPhotoBtn">Remove</button>
          </div>
        `;
        document.getElementById('removeStagedPhotoBtn').onclick = () => {
          stagedPhotoUrl = '';
          previewContainer.innerHTML = '';
          fileInput.value = '';
        };
        showNotice('Photo uploaded successfully!', 'success');
      } catch (err) {
        showNotice(err.message, 'error');
      }
    };

    // Submit Add Dish
    document.getElementById('addDishForm').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = document.getElementById('addDishBtn');
      btn.disabled = true;
      btn.textContent = 'Publishing…';

      try {
        await api('/menu', {
          method: 'POST',
          body: JSON.stringify({
            name: f.get('name').trim(),
            price: Number(f.get('price')),
            category: f.get('category') || 'Main',
            description: f.get('description').trim(),
            image_url: stagedPhotoUrl || ''
          })
        });
        showNotice('Dish successfully published to your menu!', 'success');
        renderMenu();
      } catch (err) {
        showNotice(err.message, 'error');
        btn.disabled = false;
        btn.textContent = '✦ Publish Dish to Menu';
      }
    };
  } catch (err) {
    host.innerHTML = `<p class="message">${esc(err.message)}</p>`;
  }
}

// Edit Dish Modal (Allows editing name, price, description, category, and ADDING / REPLACING / REMOVING photo)
async function openEditDishModal(dishId) {
  try {
    const items = await api('/menu?seller_id=' + me.id);
    const item = items.find(x => x.id === dishId);
    if (!item) return;

    let currentPhotoUrl = item.image_url || '';

    modalContainer.innerHTML = `
      <div class="checkout-modal-backdrop open" id="editDishModalBackdrop" onclick="if(event.target===this)closeModal()">
        <div class="checkout-modal">
          <div class="modal-header">
            <h3>Edit Dish: ${esc(item.name)}</h3>
            <button class="modal-close" onclick="closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <form id="editDishForm">
              <div class="field">
                <label>Dish Name</label>
                <input name="name" value="${esc(item.name)}" required>
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
                <div class="field">
                  <label>Price (₹)</label>
                  <input name="price" type="number" min="1" value="${item.price}" required>
                </div>
                <div class="field">
                  <label>Category</label>
                  <select name="category">
                    <option value="Main" ${item.category === 'Main' ? 'selected' : ''}>Main Course</option>
                    <option value="Starters" ${item.category === 'Starters' ? 'selected' : ''}>Starters & Appetizers</option>
                    <option value="Desserts" ${item.category === 'Desserts' ? 'selected' : ''}>Desserts</option>
                    <option value="Beverages" ${item.category === 'Beverages' ? 'selected' : ''}>Beverages</option>
                    <option value="Snacks" ${item.category === 'Snacks' ? 'selected' : ''}>Snacks</option>
                  </select>
                </div>
              </div>

              <div class="field">
                <label>Description</label>
                <textarea name="description" rows="2">${esc(item.description || '')}</textarea>
              </div>

              <div class="field">
                <label>Dish Photo</label>
                <div id="editPhotoContainer">
                  ${currentPhotoUrl ? `
                    <div class="uploader-preview-container">
                      <img src="${esc(currentPhotoUrl)}" class="uploader-preview-img" alt="Current Photo">
                      <div>
                        <strong style="font-size:13px">Active Photo</strong>
                        <br><small class="muted">Currently shown on customer menu</small>
                      </div>
                      <button type="button" class="tiny red" style="margin-left:auto" id="removeEditPhotoBtn">Remove Photo</button>
                    </div>
                  ` : `
                    <p class="muted" style="font-size:12.5px; margin:0 0 8px">No photo currently attached.</p>
                  `}
                </div>

                <div class="photo-uploader" id="editPhotoDropArea" style="margin-top:10px; padding:12px">
                  <input type="file" id="editPhotoFileInput" accept="image/*">
                  <strong style="font-size:12.5px">Upload new / replacement photo</strong>
                </div>
              </div>

              <div class="row-actions" style="margin-top:20px">
                <button type="button" class="btn outline" style="flex:1" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn" style="flex:2" id="saveEditDishBtn">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    // Remove photo button handler
    const updatePhotoDisplay = () => {
      const container = document.getElementById('editPhotoContainer');
      if (currentPhotoUrl) {
        container.innerHTML = `
          <div class="uploader-preview-container">
            <img src="${esc(currentPhotoUrl)}" class="uploader-preview-img" alt="Photo">
            <div>
              <strong style="font-size:13px">Dish Photo</strong>
            </div>
            <button type="button" class="tiny red" style="margin-left:auto" id="removeEditPhotoBtn">Remove Photo</button>
          </div>
        `;
        document.getElementById('removeEditPhotoBtn').onclick = () => {
          currentPhotoUrl = '';
          updatePhotoDisplay();
        };
      } else {
        container.innerHTML = `<p class="muted" style="font-size:12.5px; margin:0 0 8px">No photo attached (will display default food icon).</p>`;
      }
    };

    if (document.getElementById('removeEditPhotoBtn')) {
      document.getElementById('removeEditPhotoBtn').onclick = () => {
        currentPhotoUrl = '';
        updatePhotoDisplay();
      };
    }

    // Replacement file upload
    const dropArea = document.getElementById('editPhotoDropArea');
    const fileInput = document.getElementById('editPhotoFileInput');
    dropArea.onclick = () => fileInput.click();
    fileInput.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        showNotice('Uploading new photo…', 'info');
        currentPhotoUrl = await uploadPhotoFile(file);
        updatePhotoDisplay();
        showNotice('New photo ready. Click Save Changes to apply.', 'success');
      } catch (err) {
        showNotice(err.message, 'error');
      }
    };

    // Save changes
    document.getElementById('editDishForm').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = document.getElementById('saveEditDishBtn');
      btn.disabled = true;
      btn.textContent = 'Saving…';

      try {
        await api('/menu/' + dishId, {
          method: 'PATCH',
          body: JSON.stringify({
            name: f.get('name').trim(),
            price: Number(f.get('price')),
            category: f.get('category'),
            description: f.get('description').trim(),
            image_url: currentPhotoUrl // Updated or empty string
          })
        });
        closeModal();
        showNotice('Dish successfully updated!', 'success');
        renderMenu();
      } catch (err) {
        showNotice(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Save Changes';
      }
    };
  } catch (err) {
    showNotice(err.message, 'error');
  }
}

// Delete Menu Dish
async function deleteDish(id) {
  try {
    await api('/menu/' + id, { method: 'DELETE' });
    showNotice('Dish removed from menu', 'info');
    renderMenu();
  } catch (err) {
    showNotice(err.message, 'error');
  }
}

// Orders View (With Free Rider Dropdown for Admin, Status Progression for Seller & Rider)
async function renderOrders() {
  if (!await ensureAuth()) return;
  dashboardShell('orders');
  const host = document.getElementById('dashContent');

  try {
    const ordersUrl = me.role === 'admin' ? '/admin/orders' : '/orders';
    const rows = await api(ordersUrl);

    // If admin, fetch all riders with free status for dropdown selection (NO PROMPT)
    let ridersList = [];
    if (me.role === 'admin') {
      try {
        ridersList = await api('/admin/riders');
      } catch (e) {
        ridersList = [];
      }
    }

    host.innerHTML = `
      <div class="content-card">
        <div class="card-header">
          <div>
            <h2>${me.role === 'admin' ? 'Platform Orders & Rider Allocation' : 'Your Orders'}</h2>
            <p class="muted" style="margin:4px 0 0">
              ${me.role === 'admin' 
                ? 'Assign unallocated orders to free riders via dropdown. Automatically allocated orders display their assigned rider.' 
                : 'Track meal progression from kitchen preparation to doorstep delivery.'}
            </p>
          </div>
          <button class="btn outline" onclick="renderOrders()">↻ Refresh</button>
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Restaurant & Location</th>
                <th>Customer / Address</th>
                <th>Total</th>
                <th>Status</th>
                <th>Rider Allocation</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map(o => {
                const isAutoAllocated = Boolean(o.rider_id);
                return `
                  <tr>
                    <td>
                      <strong>#${o.id.slice(0, 8)}</strong>
                      <br><small class="muted">${new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                    </td>

                    <td>
                      <strong>${esc(o.restaurant_name || 'Kitchen')}</strong>
                      <br><small class="muted">📍 ${esc(o.restaurant_city || 'City')}</small>
                    </td>

                    <td>
                      <strong>${esc(o.buyer_name || 'Customer')}</strong>
                      <br><small class="muted">${esc(o.address)}</small>
                    </td>

                    <td>
                      <strong style="color:var(--orange2)">${formatCurrency(o.total)}</strong>
                    </td>

                    <td>
                      <span class="pill ${esc(o.status)}">${esc(o.status.replace('_', ' '))}</span>
                    </td>

                    <td>
                      ${me.role === 'admin' ? `
                        <!-- Admin Rider Allocation Dropdown (NO PROMPT) -->
                        <select class="rider-dropdown" onchange="assignRiderDropdown('${o.id}', this.value)">
                          <option value="">-- Choose Rider --</option>
                          ${ridersList.map(r => `
                            <option value="${r.id}" ${o.rider_id === r.id ? 'selected' : ''}>
                              ${esc(r.name)} (${esc(r.city || 'Hub')}) ${r.is_free ? '· Free' : `· (${r.active_orders} active)`}
                            </option>
                          `).join('')}
                        </select>
                      ` : o.rider_name ? `
                        <span class="pill" style="background:var(--green-light); color:var(--green)">
                          🛵 ${esc(o.rider_name)}
                        </span>
                      ` : `
                        <span class="pill" style="background:#fef3c7; color:#92400e">
                          ⏳ Waiting for Rider
                        </span>
                      `}
                    </td>

                    <td>
                      ${me.role === 'seller' ? `
                        <select class="rider-dropdown" onchange="setOrderStatus('${o.id}', this.value)">
                          <option value="">Update Status</option>
                          <option value="accepted" ${o.status === 'accepted' ? 'selected' : ''}>Accept Order</option>
                          <option value="preparing" ${o.status === 'preparing' ? 'selected' : ''}>Preparing</option>
                          <option value="ready" ${o.status === 'ready' ? 'selected' : ''}>Ready for Pickup</option>
                          <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancel</option>
                        </select>
                      ` : me.role === 'rider' ? `
                        <select class="rider-dropdown" onchange="setOrderStatus('${o.id}', this.value)">
                          <option value="">Update Status</option>
                          <option value="picked_up" ${o.status === 'picked_up' ? 'selected' : ''}>Picked Up</option>
                          <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                        </select>
                      ` : me.role === 'admin' ? `
                        <select class="rider-dropdown" onchange="setOrderStatus('${o.id}', this.value)">
                          <option value="">Status</option>
                          <option value="placed">Placed</option>
                          <option value="accepted">Accepted</option>
                          <option value="preparing">Preparing</option>
                          <option value="ready">Ready</option>
                          <option value="picked_up">Picked Up</option>
                          <option value="delivered">Delivered</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      ` : `
                        <span class="muted">${o.status === 'delivered' ? 'Delivered 🎉' : 'In Progress'}</span>
                      `}
                    </td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="7" class="empty">No orders found in this queue.</td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    host.innerHTML = `<p class="message">${esc(err.message)}</p>`;
  }
}

// Assign Rider via Dropdown (Replaces prompt completely)
async function assignRiderDropdown(orderId, riderId) {
  if (!riderId) return;
  try {
    await api(`/admin/orders/${orderId}/assign-rider`, {
      method: 'PATCH',
      body: JSON.stringify({ rider_id: riderId })
    });
    showNotice(`Rider successfully allocated to order #${orderId.slice(0, 8)}`, 'success');
    renderOrders();
  } catch (err) {
    showNotice(err.message, 'error');
  }
}

// Update Order Status
async function setOrderStatus(orderId, status) {
  if (!status) return;
  try {
    await api(`/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    showNotice(`Order #${orderId.slice(0, 8)} marked as ${status}`, 'success');
    renderOrders();
  } catch (err) {
    showNotice(err.message, 'error');
  }
}

// Admin: Users List
async function renderAdminUsers() {
  if (!await ensureAuth() || me.role !== 'admin') return;
  dashboardShell('users');
  const host = document.getElementById('dashContent');

  try {
    const rows = await api('/admin/profiles');
    host.innerHTML = `
      <div class="content-card">
        <div class="card-header">
          <div>
            <h2>Registered Users Directory (${rows.length})</h2>
            <p class="muted" style="margin:4px 0 0">Full overview of all authenticated platform profiles.</p>
          </div>
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Operating City</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(u => `
                <tr>
                  <td><strong>${esc(u.name)}</strong></td>
                  <td>${esc(u.email)}</td>
                  <td>
                    <span class="pill" style="background:var(--orange-pale); color:var(--orange2)">
                      ${esc(u.role.toUpperCase())}
                    </span>
                  </td>
                  <td>📍 ${esc(u.city || 'National')}</td>
                  <td class="muted">${new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    host.innerHTML = `<p class="message">${esc(err.message)}</p>`;
  }
}

// Admin: Restaurant Approvals
async function renderAdminRestaurants() {
  if (!await ensureAuth() || me.role !== 'admin') return;
  dashboardShell('restaurants_admin');
  const host = document.getElementById('dashContent');

  try {
    const rows = await api('/admin/restaurants');
    host.innerHTML = `
      <div class="content-card">
        <div class="card-header">
          <div>
            <h2>Restaurant Approvals & Governance (${rows.length})</h2>
            <p class="muted" style="margin:4px 0 0">Approve or reject kitchen registrations before they can publish menus.</p>
          </div>
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Kitchen Name</th>
                <th>City / Location</th>
                <th>Status</th>
                <th>Registered</th>
                <th>Review Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map(r => `
                <tr>
                  <td><strong>${esc(r.name)}</strong></td>
                  <td>📍 ${esc(r.city || 'Hub')}</td>
                  <td>
                    <span class="pill ${esc(r.status)}">${esc(r.status)}</span>
                  </td>
                  <td class="muted">${new Date(r.created_at).toLocaleDateString()}</td>
                  <td>
                    <div class="row-actions">
                      ${r.status !== 'approved' ? `
                        <button class="tiny green" onclick="setRestaurantApproval('${r.id}', 'approved')">✓ Approve</button>
                      ` : ''}
                      ${r.status !== 'rejected' ? `
                        <button class="tiny red" onclick="setRestaurantApproval('${r.id}', 'rejected')">✕ Reject</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('') : `
                <tr><td colspan="5" class="empty">No restaurant applications pending.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    host.innerHTML = `<p class="message">${esc(err.message)}</p>`;
  }
}

async function setRestaurantApproval(id, status) {
  try {
    await api(`/admin/restaurants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    showNotice(`Restaurant status changed to ${status}`, 'success');
    renderAdminRestaurants();
  } catch (err) {
    showNotice(err.message, 'error');
  }
}

// Sign Out
function logout(redirect = true) {
  token = null;
  me = null;
  localStorage.removeItem('foodie_token');
  localStorage.removeItem('foodie_user');
  if (ws) {
    ws.close();
    ws = null;
  }
  history.replaceState(null, '', '#/');
  landing();
}

// Router & Back-Button Protection
function route() {
  const hash = location.hash.slice(1) || '/';
  const p = decodeURIComponent(hash).split('/').filter(Boolean);
  const isAuth = Boolean(token && localStorage.getItem('foodie_token'));

  // Requirement 5: Avoid returning to signin page on back button if authenticated
  const authRoutes = ['', '/', 'admin', 'user', 'login', 'register'];
  const firstSegment = p[0] || '';

  if (isAuth && authRoutes.includes(firstSegment)) {
    history.replaceState(null, '', '#/dashboard');
    return renderOverview();
  }

  if (!p.length) return landing();
  if (p[0] === 'admin') return loginPage('admin');
  if (p[0] === 'user') return userLanding();
  if (p[0] === 'login') return loginPage(p[1] || 'buyer');
  if (p[0] === 'register') return registerPage(p[1] || 'buyer');

  if (p[0] === 'dashboard') {
    const sub = p[1] || 'overview';
    if (sub === 'overview') return renderOverview();
    if (sub === 'restaurants') return renderRestaurants();
    if (sub === 'menu') return renderMenu();
    if (sub === 'orders') return renderOrders();
    if (sub === 'users') return renderAdminUsers();
    if (sub === 'restaurants_admin') return renderAdminRestaurants();
    return renderOverview();
  }

  landing();
}

// Intercept popstate to guarantee back button never hits signin when logged in
window.addEventListener('popstate', () => {
  const isAuth = Boolean(token && localStorage.getItem('foodie_token'));
  const first = decodeURIComponent(location.hash.slice(1) || '/').split('/').filter(Boolean)[0] || '';
  if (isAuth && ['', '/', 'admin', 'user', 'login', 'register'].includes(first)) {
    history.replaceState(null, '', '#/dashboard');
    route();
  }
});

// Window Exports
window.renderDashboard = renderDashboard;
window.renderOverview = renderOverview;
window.renderRestaurants = renderRestaurants;
window.renderMenu = renderMenu;
window.renderOrders = renderOrders;
window.renderAdminUsers = renderAdminUsers;
window.renderAdminRestaurants = renderAdminRestaurants;
window.logout = logout;
window.go = go;
window.closeModal = closeModal;
window.openOrderModal = openOrderModal;
window.openEditDishModal = openEditDishModal;
window.deleteDish = deleteDish;
window.setOrderStatus = setOrderStatus;
window.assignRiderDropdown = assignRiderDropdown;
window.setRestaurantApproval = setRestaurantApproval;

window.addEventListener('hashchange', route);
route();
