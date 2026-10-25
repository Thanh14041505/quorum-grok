import http from "node:http";
import { createServer, loadEnv } from "vite";
import handler from "../api/market.js";
Object.assign(process.env, loadEnv("development", process.cwd(), ""));
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "spa",
});
http
  .createServer((req, res) => {
    if (req.url?.split("?")[0] === "/api/market") {
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (data) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
        return res;
      };
      handler(req, res).catch(() => {
        res.statusCode = 500;
        res.end('{"error":"Internal error"}');
      });
    } else vite.middlewares(req, res);
  })
  .listen(Number(process.env.PORT) || 5173, "0.0.0.0", () =>
    console.log("T+ Compass http://localhost:" + (process.env.PORT || 5173)),
  );
