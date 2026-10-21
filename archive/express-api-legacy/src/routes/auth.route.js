/** HTTP route handlers for auth route in the Relay archived legacy Express implementation. */

import express from "express";

import {
  checkAuth,
  login,
  logout,
  signup,
  updateProfile,
} from "../controllers/auth.controller.js";

import { protectRoute } from "../middleware/auth.middleware.js";

import {
  authRateLimiter,
  profileUpdateRateLimiter,
  signupRateLimiter,
} from "../middleware/rate-limit.middleware.js";

const router = express.Router();

// Apply abuse controls before executing authentication controllers.
router.post("/signup", signupRateLimiter, signup);
router.post("/login", authRateLimiter, login);
router.post("/logout", logout);

// Authenticate first; then limit expensive profile-update operations.
router.put(
  "/update-profile",
  protectRoute,
  profileUpdateRateLimiter,
  updateProfile,
);

router.get("/check", protectRoute, checkAuth);

export default router;
