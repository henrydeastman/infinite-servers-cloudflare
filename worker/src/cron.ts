import { Env, ServersFile } from "./types";

export async function runCronCheck(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const today = new Date().toISOString().slice(0, 10);
  const hour = new Date().getHours();

  const tgRaw = await env.CONFIG.get("config.json", "json");
  const tg = tgRaw?.telegram ?? {};
  const tgEnabled = tg.enabled && tg.bot_token && tg.chat_id;

  const serversRaw = await env.CONFIG.get("servers.json", "json") as ServersFile | null;
  if (!serversRaw?.servers) return;

  const servers = serversRaw.servers;
  let changed = false;

  for (const [name, sv] of Object.entries(servers)) {
    if (!sv.token || !sv.expiry) continue;

    const expTs = Math.floor(new Date(sv.expiry + "T00:00:00").getTime() / 1000);
    const daysSinceExpiry = Math.floor((now - expTs) / 86400);
    const daysUntilExpiry = Math.floor((expTs - now) / 86400);

    const row = await env.DB.prepare(
      "SELECT updated FROM server_status WHERE server = ?"
    ).bind(name).first<{ updated: number }>();
    const online = row ? (now - row.updated) < 900 : false;

    if (daysSinceExpiry >= 15 && online) {
      const newExpiry = new Date(expTs * 1000 + 30 * 86400000).toISOString().slice(0, 10);
      servers[name].expiry = newExpiry;
      changed = true;
      continue;
    }

    if (tgEnabled && daysUntilExpiry >= -4 && daysUntilExpiry <= 7 && hour === 20) {
      if (sv.expiry_notified !== today) {
        const statusText = online ? "Online" : "Offline";
        let urgency: string;
        if (daysUntilExpiry > 0) urgency = `剩余 ${daysUntilExpiry} 天`;
        else if (daysUntilExpiry === 0) urgency = "今天到期";
        else urgency = `已过期 ${Math.abs(daysUntilExpiry)} 天`;

        const msg = `🔔 续费提醒\n服务器: ${name}\n状态: ${statusText}\n到期时间: ${sv.expiry}\n${urgency}`;

        await sendTelegram(tg.bot_token, tg.chat_id, msg);
        servers[name].expiry_notified = today;
        changed = true;
      }
    }
  }

  if (changed) {
    await env.CONFIG.put("servers.json", JSON.stringify(serversRaw, null, 2));
  }
}

async function sendTelegram(botToken: string, chatId: string, message: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ chat_id: chatId, text: message }).toString(),
  });
}
