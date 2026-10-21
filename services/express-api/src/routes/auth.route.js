/** HTTP route handlers for auth route in the Relay Express API. */

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

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     tags: [Authentication]
 *     summary: Register a new user account
 *     description: Creates a new user account with email, password, and full name. Rate limited to prevent abuse.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - fullName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: SecurePass123!
 *               fullName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 example: John Doe
 *     responses:
 *       201:
 *         description: User successfully registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input or email already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */
router.post("/signup", signupRateLimiter, signup);

/**
 * @swagger
 * /api/auth/mobile/signup:
 *   post:
 *     tags: [Authentication]
 *     summary: Register a native mobile account
 *     description: Uses the same validation and rate limits as browser signup and returns a bearer JWT for secure device storage.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, email, password]
 *             properties:
 *               fullName: { type: string, maxLength: 100 }
 *               email: { type: string, format: email }
 *               password: { type: string, format: password, minLength: 6 }
 *     responses:
 *       201: { description: Account created; response includes public user fields, accessToken, tokenType, and expiresIn }
 *       400: { description: Invalid input }
 *       409: { description: Email already exists }
 *       429: { description: Rate limit exceeded }
 */
router.post("/mobile/signup", signupRateLimiter, signup);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Authenticate user and create session
 *     description: Authenticates a user with email and password. Sets HTTP-only JWT cookie on success. Rate limited.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: SecurePass123!
 *     responses:
 *       200:
 *         description: Authentication successful
 *         headers:
 *           Set-Cookie:
 *             description: HTTP-only JWT cookie
 *             schema:
 *               type: string
 *               example: jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Path=/; Max-Age=604800
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */
router.post("/login", authRateLimiter, login);
/**
 * @swagger
 * /api/auth/mobile/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Authenticate a native mobile client
 *     description: Uses the existing account verifier and returns a bearer JWT for storage in platform secure storage.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200: { description: Authenticated; response includes public user fields, accessToken, tokenType, and expiresIn }
 *       401: { description: Invalid credentials }
 *       429: { description: Rate limit exceeded }
 */
router.post("/mobile/login", authRateLimiter, login);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: End user session
 *     description: Clears the JWT authentication cookie, logging the user out.
 *     responses:
 *       200:
 *         description: Successfully logged out
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Logged out successfully"
 */
router.post("/logout", logout);

/**
 * @swagger
 * /api/auth/update-profile:
 *   put:
 *     tags: [Authentication]
 *     summary: Update user profile
 *     description: Updates the authenticated user's profile information. Supports text and image updates. Rate limited.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 example: John Smith
 *               profilePic:
 *                 type: string
 *                 format: binary
 *                 description: Profile picture image file (max 5MB)
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */
router.put(
  "/update-profile",
  protectRoute,
  profileUpdateRateLimiter,
  updateProfile,
);

/**
 * @swagger
 * /api/auth/check:
 *   get:
 *     tags: [Authentication]
 *     summary: Verify authentication status
 *     description: Checks if the current session is authenticated and returns user data if valid.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User is authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get("/check", protectRoute, checkAuth);

export default router;
