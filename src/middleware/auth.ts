import type { NextFunction, Request, Response } from "express";
import { env } from "../env.js";

// Single-admin auth for now: a shared bearer token, checked on every request.
// Swap for real per-user auth (sessions/JWT) once multi-user support lands --
// every route already goes through this one middleware, so that's a one-place change.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token || token !== env.adminApiToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
