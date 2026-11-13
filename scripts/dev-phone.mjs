/**
 * `npm run dev:phone` — lance le site en local ET l'ouvre au téléphone.
 *
 * - écoute sur toutes les interfaces (0.0.0.0) pour que le téléphone, sur le même wifi, y accède ;
 * - cherche l'adresse du Mac sur le wifi (elle change d'un réseau à l'autre) ;
 * - règle NEXTAUTH_URL / AUTH_URL / NEXT_PUBLIC_BASE_URL sur cette adresse, sinon la connexion
 *   renvoie le téléphone vers « localhost » (qui, pour lui, n'existe pas) ;
 * - affiche un QR code dans le terminal, à scanner avec l'appareil photo.
 *
 * Attention : c'est la base du .env (donc la vraie) qui est utilisée, comme avec `npm run dev`.
 * Pour s'y connecter depuis l'ordinateur, utiliser l'adresse affichée (pas « localhost »),
 * sinon le cookie de connexion ne correspond pas à l'adresse de retour.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import QRCode from "qrcode";

const PATH_OPEN = process.env.PHONE_PATH || "/fr";

function lanIp() {
  const rank = (ip) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  const all = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address)
    .sort((a, b) => rank(a) - rank(b));
  return all[0] ?? null;
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = createServer().once("error", () => resolve(false)).once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "0.0.0.0");
  });
}

const ip = lanIp();
if (!ip) {
  console.error("Aucune adresse wifi trouvée : le Mac est-il connecté au réseau ?");
  process.exit(1);
}

let port = Number(process.env.PORT) || 3000;
while (!(await portFree(port))) port += 1;

const base = `http://${ip}:${port}`;
const env = { ...process.env, NEXTAUTH_URL: base, AUTH_URL: base, NEXT_PUBLIC_BASE_URL: base };

const child = spawn("npx", ["next", "dev", "-p", String(port), "-H", "0.0.0.0"], { env, stdio: ["inherit", "pipe", "inherit"] });

let shown = false;
child.stdout.on("data", async (chunk) => {
  process.stdout.write(chunk);
  if (shown || !/Ready in/i.test(chunk.toString())) return;
  shown = true;
  const url = base + PATH_OPEN;
  const qr = await QRCode.toString(url, { type: "terminal", small: true });
  process.stdout.write(`\n  📱 Sur ton téléphone (même wifi) : ${url}\n\n${qr}\n`);
});

const stop = () => child.kill("SIGINT");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
