const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const sendEmail = require('../utils/sendEmail');
const Community = require('../models/Community');

const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Lecturer = require('../models/Lecturer');

// Helper to find user by email, studentId, or userId
async function findUser(identifier) {
    const lowerIdentifier = identifier.toLowerCase();
    const idRegex = new RegExp(`^${identifier}$`, 'i');

    // All three lookups now run concurrently
    const [student, staff, lecturer] = await Promise.all([
        Student.findOne({ 
            $or: [
                { email: lowerIdentifier }, 
                { studentId: idRegex }         
            ] 
        }),
        Staff.findOne({ 
            $or: [
                { email: lowerIdentifier },    
                { userId: idRegex }          
            ] 
        }),
        Lecturer.findOne({ 
            $or: [
                { email: lowerIdentifier },    
                { userId: idRegex }           
            ] 
        })
    ]);

    if (student) return { user: student, userType: 'student' };
    if (staff) return { user: staff, userType: 'staff' };
    if (lecturer) return { user: lecturer, userType: 'lecturer' };

    return null;
}

// Helper to extract community name from studentId (e.g., dit0723-003 -> dit)
function getCommunityFromStudentId(studentId) {
    const match = studentId.match(/^([a-z]+)/i);
    return match ? match[1].toLowerCase() : null;
}

// Check Email for Verification (Signup)
router.post('/check-email', async (req, res) => {
    const { email } = req.body;

    try {
        const result = await findUser(email);
        if (!result) {
            return res.status(404).json({ success: false, message: "Account not found in college records." });
        }

        if (result.user.password) {
            return res.status(409).json({ 
                success: false, 
                message: "This account already exists. Please log in instead." 
            });
        }
        
        // Use the actual email from the found user object as the recipient
        const userEmail = result.user.email; 
        
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        // Also use the actual email when creating the JWT token
        const token = jwt.sign({ email: userEmail }, process.env.SESSION_SECRET, { expiresIn: '15m' });
        const link = `${baseUrl}/verify/${token}`;

        // Send the email to the correct userEmail
        await sendEmail(userEmail, "VisionSphere Email Verification", ` 
            <h2>Verify your email</h2>
            <p>Click the link below to continue signup:</p>
            <a href="${link}">${link}</a>
        `);

        res.status(200).json({ success: true, message: "Verification link sent!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Verify Token and Open Create Password Modal
router.get('/verify/:token', async (req, res) => {
    const { token } = req.params;
    
    // Check if the user is already logged in
    if (req.session.user) {
        return res.redirect('/');
    }

    try {
        const decoded = jwt.verify(token, process.env.SESSION_SECRET);
        const result = await findUser(decoded.email);

        if (!result) {
            return res.status(404).send("User not found");
        }
        
        res.render('layout', {
            title: "Create Password",
            body: `<script>
                window.emailToSetPassword="${decoded.email}"; 
                window.showCreatePasswordModal = true;
            </script>`,
        });
    } catch (err) {
        console.error(err);
        res.status(400).send("Invalid or expired token");
    }
});

// Forgot Password - Request Reset
router.post('/reset-request', async (req, res) => {
    const { email } = req.body;

    try {
        const result = await findUser(email);
        if (!result) {
            return res.status(404).json({ success: false, message: "Account not found." });
        }

        if (!result.user.password) {
            return res.status(400).json({
                success: false,
                message: "This account hasn't completed signup. Please sign up first.",
            });
        }
        
        // Use the actual email from the found user object as the recipient
        const userEmail = result.user.email; 

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        // Use the actual email when creating the JWT token
        const token = jwt.sign({ email: userEmail }, process.env.SESSION_SECRET, { expiresIn: '15m' });
        const resetLink = `${baseUrl}/reset-password/${token}`;

        // Send the email to the correct userEmail
        await sendEmail(userEmail, "Reset Your Password", `
            <h2>Reset Your Password</h2>
            <p>Click below to change your password:</p>
            <a href="${resetLink}">${resetLink}</a>
        `);

        res.status(200).json({ success: true, message: "Kindly click OK to continue, then open your email to find the reset link." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Reset Password Modal via Token
router.get('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    
    // Check if the user is already logged in
    if (req.session.user) {
        return res.redirect('/');
    }
    
    try {
        const decoded = jwt.verify(token, process.env.SESSION_SECRET);
        const result = await findUser(decoded.email);

        if (!result) return res.status(404).send("User not found");

        res.render('layout', {
            title: "Reset Password",
            body: `<script>
                window.emailToSetPassword="${decoded.email}";
                window.showCreatePasswordModal = true;
            </script>`,
        });
    } catch (err) {
        console.error(err);
        res.status(400).send("Invalid or expired reset link");
    }
});

// Save Password After Signup or Reset
router.post('/set-password', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Server-side password strength validation
        const minLength = 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSymbols = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        if (password.length < minLength || !hasUpperCase || !hasLowerCase || !hasNumbers || !hasSymbols) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one symbol."
            });
        }

        const result = await findUser(email);
        if (!result) {
            return res.status(404).json({ success: false, message: "Account not found." });
        }

        const { user } = result;

        if (user.password) {
            const isSame = await bcrypt.compare(password, user.password);
            if (isSame) {
                return res.status(400).json({
                    success: false,
                    message: "New password cannot be the same as the old password."
                });
            }
        }

        user.password = await bcrypt.hash(password, 10);
        await user.save();

        // Auto-join community based on student ID
        if (result.userType === 'student' && user.studentId) {
            const communityName = getCommunityFromStudentId(user.studentId);
            if (communityName) {
                const community = await Community.findOne({ name: communityName });
                if (community) {
                    // Use $addToSet to prevent duplicates
                    community.members.addToSet(user.email);
                    await community.save();
                }
            }
        }

        // Immediately set the session and login the user
        req.session.user = {
            email: user.email,
            fullName: user.fullName,
            studentId: user.studentId || null,
            avatar: user.avatar || null,
            userType: result.userType
        };
        
        res.status(200).json({ success: true, message: "Password saved and login successful." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error saving password." });
    }
});

// Login Route (Any User)
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await findUser(email);
        if (!result) {
            return res.status(404).json({ success: false, message: "Account not found." });
        }

        const { user, userType } = result;

        if (!user.password) {
            return res.status(400).json({ success: false, message: "Account hasn't set a password yet." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Incorrect password." });
        }

        req.session.user = {
            email: user.email,
            fullName: user.fullName,
            studentId: user.studentId || null,
            userId: user.userId || null,
            avatar: user.avatar || null,
            userType
        };

        res.status(200).json({ success: true, message: "Login successful." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

module.exports = router;