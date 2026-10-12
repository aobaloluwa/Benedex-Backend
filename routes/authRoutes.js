import express from "express";
import {
    registerUser,
    loginUser,
    googleAuthCallbackSuccess,
    forgotPassword,
    resetPassword,
    updatePassword // 1. Import your new controller method here
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authLimiter } from '../middleware/rateLimiter.js'; 

const router = express.Router();

// Baseline Core Routes Handler Nodes
router.post("/register", authLimiter, registerUser);
router.post("/login", authLimiter, loginUser);

// 🌐 GOOGLE SOCIAL LINK DATA TUNNEL
router.post("/google", authLimiter, googleAuthCallbackSuccess);

// 🔒 CREDENTIAL PROTECTION RESET ROUTES
router.post("/forgot-password", authLimiter, forgotPassword);
router.put("/reset-password/:token", authLimiter, resetPassword);

// 🛠️ PROFILE SECURITY UPDATE VECTOR (Protected Endpoint)
router.put("/update-password", protect, updatePassword);

export default router;
