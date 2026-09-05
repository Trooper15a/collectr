// Production HTTPS server for the PWA (used by auto-start). Run `npm run build` first.
// Uses the mkcert certificates that `next dev --experimental-https` generated in ./certificates.
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";

const port = Number(process.env.PORT ?? 3000);
const dir = path.dirname(fileURLToPath(import.meta.url));
process.chdir(dir);

const certDir = path.join(dir, "certificates");
const key = fs.readFileSync(path.join(certDir, "localhost-key.pem"));
const cert = fs.readFileSync(path.join(certDir, "localhost.pem"));

const app = next({ dev: false, dir });
const handle = app.getRequestHandler();

await app.prepare();
https
  .createServer({ key, cert }, (req, res) => handle(req, res))
  .listen(port, "0.0.0.0", () => {
    console.log(`[collectr] ready on https://0.0.0.0:${port} (${new Date().toISOString()})`);
  });
