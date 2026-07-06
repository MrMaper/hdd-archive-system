// API helpers and utilities shared across the app

var API = "http://localhost:8765/api";

async function apiGet(path) {
  var r = await fetch(API + path);
  return r.json();
}

async function apiPost(path, body) {
  var r = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function apiDelete(path) {
  var r = await fetch(API + path, { method: "DELETE" });
  return r.json();
}

function esc(s) {
  if (!s) return "";
  var el = document.createElement("div");
  el.appendChild(document.createTextNode(s));
  return el.innerHTML;
}

function toast(msg, type) {
  type = type || "success";
  var t = document.createElement("div");
  t.className = "toast " + type;
  t.innerHTML = msg;
  document.body.appendChild(t);
  setTimeout(function () {
    t.remove();
  }, 3000);
}