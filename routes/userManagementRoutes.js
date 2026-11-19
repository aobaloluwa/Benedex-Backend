import express from "express";
import {
  getUsers,
  getSingleUser,
  getPublicUserIdentity,
  updateRole,
  updateStatus,
  deleteUser,
  createUser 
} from "../controllers/userManagementController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public identity verification endpoint for scanned QR codes
router.get("/verify-public/:id", getPublicUserIdentity);

router.post(
  "/",
  protect,
  authorize("superadmin"),
  createUser
);

router.get("/", protect, authorize("superadmin"), getUsers);
router.get("/:id", protect, authorize("superadmin"), getSingleUser);
router.put("/role/:id", protect, authorize("superadmin"), updateRole);
router.put("/status/:id", protect, authorize("superadmin"), updateStatus);
router.delete("/:id", protect, authorize("superadmin"), deleteUser);

export default router;
