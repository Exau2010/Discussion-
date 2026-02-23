const socket = io();

// ===== AUTH =====
async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (data.error) return alert(data.error);
  localStorage.setItem("user", username);
  window.location.href = "home.html";
}

async function register() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  if (!username || !password) return alert("Remplis tous les champs !");
  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (data.error) return alert(data.error);
  alert("Compte créé ! Tu peux maintenant te connecter.");
  window.location.href = "index.html";
}

// ===== LOGOUT =====
function logout() {
  localStorage.removeItem("user");
  window.location.href = "index.html";
      }
