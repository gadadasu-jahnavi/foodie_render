// Customer auth (register + login) -> Flask API. Session = JWT in localStorage.
const TOKEN_KEY = "foodie.customer.token";
const USER_KEY = "foodie.customer.user";

function say(text, ok = false) {
  const el = document.getElementById("message");
  el.textContent = text;
  el.className = "message" + (ok ? " ok" : "");
}

async function post(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

// ---------- Registration ----------
const registerForm = document.getElementById("register-form");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = registerForm;
    if (f.password.value.length < 8) return say("Password must be at least 8 characters.");
    const btn = f.querySelector("button[type=submit], .btn");
    btn.disabled = true;
    try {
      await post("/api/customers/register", {
        name: f.name.value.trim(), email: f.email.value.trim().toLowerCase(),
        phone: f.phone.value.trim(), city: f.city.value.trim(), password: f.password.value
      });
      window.location.href = "login.html?registered=1";
    } catch (err) {
      say(err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- Login ----------
const loginForm = document.getElementById("login-form");
if (loginForm) {
  if (localStorage.getItem(TOKEN_KEY)) window.location.replace("home.html");
  if (new URLSearchParams(location.search).get("registered")) say("Account created. Please log in.", true);

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = await post("/api/auth/login", { role: "customer", identifier: loginForm.identity.value, password: loginForm.password.value });
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      window.location.href = "home.html";
    } catch (err) {
      say(err.message);
    }
  });
}

// ---------- Placeholders ----------
document.querySelectorAll("[data-social]").forEach((btn) =>
  btn.addEventListener("click", () => say(btn.dataset.social + " sign-in needs OAuth set up on your server first."))
);
const forgot = document.getElementById("forgot");
if (forgot) forgot.addEventListener("click", () => say("Password reset needs an email service on your server."));
