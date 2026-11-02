// Сервер-посредник (сигнальный сервер).
// Он НЕ передаёт голос. Он только пересылает "служебные" сообщения
// между двумя телефонами, чтобы они нашли друг друга. Голос идёт напрямую (WebRTC).
const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();
app.use(express.static("public")); // отдаём страницу из папки public
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Кто сейчас в сети: номер телефона -> соединение
const online = new Map();

// Приводим номер к виду +99361234567 (только цифры и плюс в начале)
const normalize = (p) => "+" + String(p || "").replace(/\D/g, "");

wss.on("connection", (ws) => {
  ws.phone = null;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // 1. Регистрация: пользователь сообщает свой номер
    if (msg.type === "register") {
      const phone = normalize(msg.phone);
      if (phone.length < 8) return ws.send(JSON.stringify({ type: "error", text: "Номер слишком короткий" }));
      if (online.has(phone) && online.get(phone) !== ws) {
        return ws.send(JSON.stringify({ type: "error", text: "Этот номер уже занят в сети" }));
      }
      ws.phone = phone;
      online.set(phone, ws);
      return ws.send(JSON.stringify({ type: "registered", phone }));
    }

    if (!ws.phone) return; // дальше только для зарегистрированных

    // 2. Проверка: в сети ли контакт
    if (msg.type === "check") {
      const phone = normalize(msg.phone);
      return ws.send(JSON.stringify({ type: "presence", phone, online: online.has(phone) }));
    }

    // 3. Пересылка звонка: offer / answer / ice / hangup / reject
    if (["offer", "answer", "ice", "hangup", "reject"].includes(msg.type)) {
      const target = online.get(normalize(msg.to));
      if (!target) return ws.send(JSON.stringify({ type: "unavailable", phone: normalize(msg.to) }));
      target.send(JSON.stringify({ ...msg, from: ws.phone })); // добавляем, от кого
    }
  });

  ws.on("close", () => {
    if (ws.phone && online.get(ws.phone) === ws) online.delete(ws.phone);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Сервер запущен на порту " + PORT));
