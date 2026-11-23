// Seller login -> Flask API -> seller-dashboard.html
document.addEventListener("DOMContentLoaded", function () {
  const loginForm = document.getElementById("loginForm");
  const message = document.getElementById("message");

  if (localStorage.getItem("foodie.seller.token")) {
    window.location.replace("seller-dashboard.html");
    return;
  }

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    message.style.display = "none";
    const btn = loginForm.querySelector("button");
    btn.disabled = true;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "seller",
          identifier: document.getElementById("email").value,
          password: document.getElementById("password").value
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Login failed");
      localStorage.setItem("foodie.seller.token", data.token);
      window.location.href = "seller-dashboard.html";
    } catch (e) {
      message.textContent = e.message;
      message.style.color = "#c62828";
      message.style.display = "block";
    } finally {
      btn.disabled = false;
    }
  });
});
