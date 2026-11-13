import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../models/User.js";
import generateToken from "../utils/generateToken.js";
import { recordLearningActivity } from "../utils/studentLearning.js";
import { OAuth2Client } from "google-auth-library";
import nodemailer from "nodemailer";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// @desc    Register standard email user
export const registerUser = async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        if (!fullName || !email || !password || typeof email !== "string" || typeof password !== "string") {
            return res.status(400).json({ message: "Full name, email, and password are required." });
        }
        const normalizedEmail = email.trim().toLowerCase();
        const userExists = await User.findOne({ email: normalizedEmail });
        if (userExists) {
            return res.status(400).json({ message: "User already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            fullName,
            email: normalizedEmail,
            password: hashedPassword,
            // Public self-registration always creates a student. Privileged roles
            // must be assigned through the authenticated admin user-management flow.
            role: "student"
        });

        if (user.role === "student") {
            await recordLearningActivity({
                student: user._id,
                type: "account_registered",
                title: "Created your account",
                points: 0
            });
        }

        res.status(201).json({
            _id: user._id,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            token: generateToken(user._id)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Standard email/password login
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
            return res.status(400).json({ message: "Email and password are required." });
        }
        const user = await User.findOne({ email: email.trim().toLowerCase() });

        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Safety catch if a Google-only user tries traditional login without setting a password
        if (!user.password) {
            return res.status(400).json({ 
                message: "Account registered using Google Auth. Please sign in via Google." 
            });
        }

        if (await bcrypt.compare(password, user.password)) {
            if (user.role === "student") {
                await recordLearningActivity({
                    student: user._id,
                    type: "user_logged_in",
                    title: "Logged in",
                    points: 0
                });
            }

            res.json({
                _id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                token: generateToken(user._id)
            });
        } else {
            res.status(401).json({ message: "Invalid credentials" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Handle incoming token payloads signed from Google client frontend
export const googleAuthCallbackSuccess = async (req, res) => {
    try {
        const { credential } = req.body; // Token sent by the frontend Google Login button

        if (!credential) {
            return res.status(400).json({ message: "Google verification token missing." });
        }

        // Cryptographically verify the token directly with Google's public security keys
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const googleId = payload['sub']; // Google's unique structural ID for this specific user
        const email = payload['email'];
        if (payload['email_verified'] !== true || typeof email !== "string") {
            return res.status(401).json({ message: "Google account email is not verified." });
        }
        const fullName = payload['name'];
        const profileImage = payload['picture'];

        // Find or create the user record matching by Google Account Parameters
        let user = await User.findOne({ $or: [{ googleId }, { email: email.toLowerCase() }] });

        if (!user) {
            user = await User.create({
                fullName,
                email,
                googleId,
                profileImage: profileImage || "",
                role: "student"
            });

            await recordLearningActivity({
                student: user._id,
                type: "account_registered",
                title: "Created your account via Google",
                points: 0
            });
        } else if (!user.googleId) {
            // Securely link Google identity to existing local profile if emails align
            user.googleId = googleId;
            if (!user.profileImage && profileImage) user.profileImage = profileImage;
            await user.save();
        }

        // Return your system's native JWT token back to the frontend
        res.status(200).json({
            _id: user._id,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            token: generateToken(user._id)
        });
    } catch (error) {
        res.status(500).json({ message: "Google Authentication engine token validation failure: " + error.message });
    }
};

// @desc    Generate password reset token code
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || typeof email !== "string" || !email.trim()) {
            return res.status(400).json({ message: "Valid email address is required." });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(404).json({ message: "No user account matched with that email address." });
        }

        // 1. Generate a secure 6-digit random numeric code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        // 2. Hash the code before storing it in the database for security
        user.resetPasswordToken = crypto.createHash("sha256").update(verificationCode).digest("hex");
        user.resetPasswordExpires = Date.now() + 600000; // Code expires tightly in 10 Minutes

        await user.save();

        // 3. Log code to server console for instant verification & development feedback
        console.log(`\n========================================`);
        console.log(`🔑 PASSWORD RESET CODE FOR: ${user.email}`);
        console.log(`👉 VERIFICATION CODE: ${verificationCode}`);
        console.log(`========================================\n`);

        // 4. Send background email if EMAIL_USER and EMAIL_PASS are present
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const transporter = nodemailer.createTransport({
                host: process.env.EMAIL_HOST || 'smtp.gmail.com',
                port: Number(process.env.EMAIL_PORT) || 587,
                secure: false, // STARTTLS
                connectionTimeout: 4000,
                greetingTimeout: 4000,
                socketTimeout: 4000,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            const mailOptions = {
                from: `"Benedex Support" <${process.env.EMAIL_USER}>`,
                to: user.email,
                subject: "Your Password Reset Verification Code",
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                        <h2 style="color: #194066; text-align: center;">Password Reset Request</h2>
                        <p>Hello ${user.fullName},</p>
                        <p>We received a request to reset your password. Use the verification code below to complete your reset sequence. This code is active for <strong>10 minutes</strong>.</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; padding: 12px 24px; background-color: #f4f6f8; border-radius: 4px; color: #1E844F; border: 1px dashed #1E844F;">
                                ${verificationCode}
                            </span>
                        </div>
                        <p style="font-size: 12px; color: #666;">If you did not initiate this request, please ignore this email or secure your account credentials.</p>
                    </div>
                `,
            };

            // Fire background email dispatch (non-blocking)
            transporter.sendMail(mailOptions).catch((emailError) => {
                console.error("Nodemailer background sendMail error:", emailError?.message || emailError);
            });
        }

        // Return HTTP 200 response immediately
        return res.status(200).json({
            success: true,
            message: "A password verification code has been successfully dispatched to your email inbox."
        });

    } catch (error) {
        return res.status(500).json({ message: "Password reset request failure: " + error.message });
    }
};

// @desc    Verify 6-digit password reset code with database
// @route   POST /api/auth/verify-reset-code
// @access  Public
export const verifyResetCode = async (req, res) => {
    try {
        const { code, email } = req.body;

        if (!code || typeof code !== "string" || !code.trim()) {
            return res.status(400).json({ message: "Verification code is required." });
        }

        const hashedToken = crypto.createHash("sha256").update(code.trim()).digest("hex");

        const query = {
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        };

        if (email && typeof email === "string" && email.trim()) {
            query.email = email.trim().toLowerCase();
        }

        const user = await User.findOne(query);

        if (!user) {
            return res.status(400).json({ message: "Verification code is invalid or has expired." });
        }

        res.status(200).json({
            success: true,
            message: "Verification code validated successfully!"
        });
    } catch (error) {
        res.status(500).json({ message: "Code verification failure: " + error.message });
    }
};

// @desc    Reset password with validated security token
// @route   POST /api/auth/reset-password/:token
// @access  Public
export const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        if (!password || typeof password !== "string" || password.length < 6) {
            return res.status(400).json({ message: "New password must be at least 6 characters long." });
        }

        const hashedToken = crypto.createHash("sha256").update(token.trim()).digest("hex");

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: "Verification code is invalid or has expired." });
        }

        // Encrypt the new target password entry string
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        // Wipe security token parameters cleanly on success
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.status(200).json({
            success: true,
            message: "Password successfully updated! You can now log in with your new credentials."
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update password for a logged-in user inside profile dashboard
// @route   PUT /api/auth/update-password
// @access  Private
export const updatePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Fetch user by id verified from auth token middleware
        const user = await User.findById(req.user?._id);
        if (!user) {
            return res.status(404).json({ message: "User account not found." });
        }

        // If user registered via Google only and hasn't set a password yet, bypass match verification
        if (user.password) {
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: "Invalid current password credential." });
            }
        }

        // Encrypt and pin the new password string
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        await user.save();

        res.status(200).json({
            success: true,
            message: "System password updated successfully!"
        });
    } catch (error) {
        res.status(500).json({ message: "Password update sequence error: " + error.message });
    }
};

// @desc    Update user profile details (fullName, profileImage)
// @route   PUT /api/auth/update-profile
// @access  Private
export const updateProfile = async (req, res) => {
    try {
        const { fullName, profileImage } = req.body;

        const user = await User.findById(req.user?._id);
        if (!user) {
            return res.status(404).json({ message: "User account not found." });
        }

        if (fullName !== undefined && fullName.trim() !== "") {
            user.fullName = fullName.trim();
        }

        if (profileImage !== undefined) {
            user.profileImage = profileImage;
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: "Profile details updated successfully!",
            user: {
                _id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                profileImage: user.profileImage,
                xp: user.xp,
                badges: user.badges
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Profile update sequence error: " + error.message });
    }
};

// @desc    Get current authenticated user profile
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user?._id).select("-password");
        if (!user) {
            return res.status(404).json({ message: "User account not found." });
        }
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: "Profile retrieval error: " + error.message });
    }
};
