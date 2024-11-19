import cookieParser from "cookie-parser";
import crypto from "crypto";
import express from "express";
import session from "express-session";
import { createServer, IncomingMessage, ServerResponse } from "http";
import next from "next";
import staging from "staging";
import { parse } from "url";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const expressApp = express();

  // Basic middleware
  expressApp.use(express.urlencoded({ extended: true }));
  expressApp.use(cookieParser());

  // Session middleware
  expressApp.use(
    session({
      secret:
        process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
      name: "staging_sess", // Custom name to avoid conflicts
      cookie: {
        secure: !dev, // Use secure cookies in production
        httpOnly: true,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
      resave: false,
      saveUninitialized: false,
    }),
  );

  // Apply password protection middleware
  expressApp.use(
    staging({
      publicRoutes: ["/_next/static/.*", "/api/public/.*"],
    }),
  );

  createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const parsedUrl = parse(req.url!, true);

      // Skip middleware for static files and Next.js internals
      if (req.url?.startsWith("/_next/") || req.url?.startsWith("/static/")) {
        await handle(req, res, parsedUrl);
        return;
      }

      // Create a middleware handler that works with native http types
      const handler = expressApp as unknown as (
        req: IncomingMessage,
        res: ServerResponse,
        next: (err?: any) => void,
      ) => void;

      // Run the Express middleware stack
      await new Promise<void>((resolve, reject) => {
        handler(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // If we get here, password protection passed
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error processing request:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  }).listen(port);

  console.log(
    `> Server listening at http://localhost:${port} as ${
      dev ? "development" : process.env.NODE_ENV
    }`,
  );
});
