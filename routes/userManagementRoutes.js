import express from "express";
import {
  getUsers,
  getSingleUser,
  updateRole,
  updateStatus,
  deleteUser,
  createUser 
} from "../controllers/userManagementController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();


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
