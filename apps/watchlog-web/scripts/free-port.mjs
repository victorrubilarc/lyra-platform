// Libera el puerto del dev server antes de arrancar Vite.
// Si algo está escuchando en el puerto (un Vite zombi, otra app), lo mata.
// Cross-platform: usa netstat/taskkill en Windows y lsof/kill en Unix.
//
// Uso: node scripts/free-port.mjs   (puerto por defecto 5173, override con PORT)
import { execSync } from "node:child_process";

const PORT = Number(process.env.PORT ?? 5173);

/** Devuelve los PIDs que están LISTENING en el puerto dado. */
function pidsOnPort(port) {
  try {
    if (process.platform === "win32") {
      const out = execSync("netstat -ano -p tcp", { encoding: "utf8" });
      const pids = new Set();
      for (const line of out.split("\n")) {
        const m = line.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
        if (m && Number(m[1]) === port) pids.add(m[2]);
      }
      return [...pids];
    }
    const out = execSync(`lsof -ti tcp:${port} -s tcp:LISTEN`, { encoding: "utf8" });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    // netstat/lsof sin coincidencias salen con código !=0: puerto libre.
    return [];
  }
}

const pids = pidsOnPort(PORT);
if (pids.length === 0) {
  console.log(`[free-port] ${PORT} libre`);
} else {
  for (const pid of pids) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      } else {
        process.kill(Number(pid), "SIGKILL");
      }
      console.log(`[free-port] maté PID ${pid} que ocupaba ${PORT}`);
    } catch (e) {
      console.warn(`[free-port] no pude matar PID ${pid}: ${e.message}`);
    }
  }
}
