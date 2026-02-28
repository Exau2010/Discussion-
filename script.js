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

  localStorage.setItem("token", data.token);
  localStorage.setItem("user", username);

  location.href = "chat.html";
}

async function register() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (data.error) return alert(data.error);

  alert("Compte créé !");
  location.href = "index.html";
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  location.href = "index.html";
}
