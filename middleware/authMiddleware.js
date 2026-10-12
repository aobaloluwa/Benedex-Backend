import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Settings from "../models/Settings.js";

const protect = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;
    if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const token = authorization.slice(7).trim();
    if (!token || !process.env.JWT_SECRET) {
      return res.status(401).json({ message: "Invalid authentication token." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || typeof decoded.id !== "string") {
      return res.status(401).json({ message: "Invalid authentication token." });
    }

    const user = await User.findById(decoded.id).select("-password -resetPasswordToken -resetPasswordExpires");
    if (!user) {
      return res.status(401).json({ message: "Account is no longer available." });
    }
    if (user.status === "suspended") {
      return res.status(403).json({ message: "This account has been suspended." });
    }

    req.user = user;

    const systemConfig = await Settings.findOne();
    if (systemConfig?.maintenanceMode && user.role !== "admin") {
      return res.status(503).json({
        maintenance: true,
        message: "System Optimization Active. Platform is temporarily offline for students and instructors."
      });
    }

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired authentication token." });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You are not authorized to perform this action."
      });
    }
    next();
  };
};

// Kept here for safety/explicit backward compatibility if called elsewhere
const checkMaintenance = async (req, res, next) => {
  try {
    const systemConfig = await Settings.findOne();
    if (systemConfig?.maintenanceMode && req.user && req.user.role !== "admin") {
      return res.status(503).json({
        maintenance: true,
        message: "System Optimization Active. Platform is temporarily offline for students and instructors."
      });
    }
    next();
  } catch (error) {
    return res.status(500).json({
      message: "Unable to verify platform availability."
    });
  }
};

export {
  protect,
  authorize,
  checkMaintenance
};
