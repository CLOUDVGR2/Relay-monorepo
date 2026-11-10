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
 *     summary: Register a browser user account
 *     description: Creates an account and establishes a browser session using an HTTP-only JWT cookie. Returns public user fields directly.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, fullName]
 *             properties:
 *               email: { type: string, format: email, maxLength: 254 }
 *               password: { type: string, format: password, minLength: 6, description: Maximum 72 UTF-8 bytes }
 *               fullName: { type: string, minLength: 1, maxLength: 100 }
 *     responses:
 *       201:
 *         description: Account created; browser JWT set as an HTTP-only cookie
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400: { description: Missing or invalid account fields }
 *       409: { description: Email already exists }
 *       429: { $ref: '#/components/responses/RateLimitExceeded' }
 *       500: { $ref: '#/components/responses/InternalError' }
 */
router.post("/signup", signupRateLimiter, signup);

/**
 * @swagger
 * /api/auth/mobile/signup:
 *   post:
 *     tags: [Authentication]
 *     summary: Register a native mobile account
 *     description: Creates an account and returns public user fields plus a bearer JWT for secure device storage.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, email, password]
 *             properties:
 *               fullName: { type: string, minLength: 1, maxLength: 100 }
 *               email: { type: string, format: email, maxLength: 254 }
 *               password: { type: string, format: password, minLength: 6, description: Maximum 72 UTF-8 bytes }
 *     responses:
 *       201:
 *         description: Account created; user fields and bearer credentials returned directly
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/User'
 *                 - type: object
 *                   required: [accessToken, tokenType, expiresIn]
 *                   properties:
 *                     accessToken: { type: string }
 *                     tokenType: { type: string, enum: [Bearer] }
 *                     expiresIn: { type: integer, description: Token lifetime in seconds }
 *       400: { description: Missing or invalid account fields }
 *       409: { description: Email already exists }
 *       429: { $ref: '#/components/responses/RateLimitExceeded' }
 *       500: { $ref: '#/components/responses/InternalError' }
 */
router.post("/mobile/signup", signupRateLimiter, signup);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Authenticate a browser user
 *     description: Authenticates with email and password and sets an HTTP-only JWT cookie. Returns public user fields directly.
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
 *       200:
 *         description: Authenticated; JWT set as an HTTP-only cookie
 *         headers:
 *           Set-Cookie:
 *             description: Authentication cookie
 *             schema: { type: string }
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400: { description: Email and password are required }
 *       401: { description: Invalid credentials }
 *       429: { $ref: '#/components/responses/RateLimitExceeded' }
 *       500: { $ref: '#/components/responses/InternalError' }
 */
router.post("/login", authRateLimiter, login);
/**
 * @swagger
 * /api/auth/mobile/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Authenticate a native mobile client
 *     description: Authenticates with email and password and returns public user fields plus a bearer JWT for secure device storage.
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
 *       200:
 *         description: Authenticated; user fields and bearer credentials returned directly
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/User'
 *                 - type: object
 *                   required: [accessToken, tokenType, expiresIn]
 *                   properties:
 *                     accessToken: { type: string }
 *                     tokenType: { type: string, enum: [Bearer] }
 *                     expiresIn: { type: integer, description: Token lifetime in seconds }
 *       400: { description: Email and password are required }
 *       401: { description: Invalid credentials }
 *       429: { $ref: '#/components/responses/RateLimitExceeded' }
 *       500: { $ref: '#/components/responses/InternalError' }
 */
router.post("/mobile/login", authRateLimiter, login);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: End browser session
 *     description: Clears the JWT authentication cookie. Authentication is not required for this route.
 *     responses:
 *       200:
 *         description: Session cookie cleared
 *         headers:
 *           Set-Cookie:
 *             description: Expired authentication cookie
 *             schema: { type: string }
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: Logged out successfully }
 *       500: { $ref: '#/components/responses/InternalError' }
 */
router.post("/logout", logout);

/**
 * @swagger
 * /api/auth/update-profile:
 *   put:
 *     tags: [Authentication]
 *     summary: Update authenticated user profile
 *     description: Updates the user's full name and/or profile picture. Profile pictures must be supported Base64 image data URIs, not multipart files.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               fullName: { type: string, minLength: 1, description: Non-empty name trimmed by the server }
 *               profilePic:
 *                 type: string
 *                 description: Supported Base64 image data URI; maximum decoded image size 7 MiB
 *                 example: data:image/png;base64,iVBORw0KGgo...
 *     responses:
 *       200:
 *         description: Updated public user object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400: { description: Invalid fields or no supported updates supplied }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { description: User not found }
 *       413: { description: Profile image exceeds 7 MiB }
 *       429: { $ref: '#/components/responses/RateLimitExceeded' }
 *       500: { $ref: '#/components/responses/InternalError' }
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
 *     description: Returns the authenticated user's public fields directly.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Authenticated user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/check", protectRoute, checkAuth);

export default router;
