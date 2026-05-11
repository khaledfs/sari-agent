import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import next from "next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, "10.0.0.3+2-key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "10.0.0.3+2.pem")),
};

await app.prepare();

https
  .createServer(httpsOptions, async (req, res) => {
    try {
      const parsedUrl = new URL(req.url ?? "/", `https://${req.headers.host}`);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error handling", req.url, err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  })
  .listen(port, "0.0.0.0", () => {
    console.log(`> Ready on https://10.0.0.3:${port}`);
    console.log(`> Also on  https://localhost:${port}`);
  });
