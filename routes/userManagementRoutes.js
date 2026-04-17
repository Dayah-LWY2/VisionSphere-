const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Lecturer = require('../models/Lecturer');
const { determineUserRoleAndColor } = require('../utils/userUtils');
const Community = require('../models/Community');
const { ADMIN_EMAILS } = require('../utils/userUtils');

// Middleware to check for admin or moderator role
function ensureAdminOrModerator(req, res, next) {
    if (req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'moderator')) {
        return next();
    }
    res.status(403).json({ success: false, error: "Forbidden: You do not have permission to access this page." });
}

// GET route to display all users
router.get('/manage-users', ensureAdminOrModerator, async (req, res) => {
    try {
        // Parallelize initial data fetch for all user types
        const [students, staff, lecturers] = await Promise.all([
            Student.find().lean(),
            Staff.find().lean(),
            Lecturer.find().lean()
        ]);
        
        let allUsers = [...students, ...staff, ...lecturers];
        
        // Prepare promises for parallel role enrichment
        const enrichmentPromises = allUsers.map(user => {
            user.userType = user.studentId ? 'student' : (user.userId && !user.studentId ? (user.staffId ? 'staff' : 'lecturer') : 'unknown');
            // This runs the role logic but needs to be wrapped in a promise to run concurrently
            return determineUserRoleAndColor(user, user.userType);
        });

        // Execute all role enrichment in parallel (major speedup)
        allUsers = await Promise.all(enrichmentPromises);

        res.render('management/manageUsers', {
            title: 'Manage Users',
            allUsers
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error loading users.' });
    }
});

// POST route to update a user's role
router.post('/update-role', ensureAdminOrModerator, async (req, res) => {
    const { email, newRole } = req.body;
    const currentUser = req.session.user;
    const targetEmail = email.toLowerCase();
    const currentEmail = currentUser.email.toLowerCase();

    // Moderators are explicitly disallowed from changing roles (Promote/Demote).
    if (currentUser.role !== 'admin') {
        return res.status(403).json({ success: false, error: "Only administrators are authorized to change user roles." });
    }
    
    // Prevent an admin from changing their own role
    if (currentEmail === targetEmail) {
        return res.status(403).json({ success: false, error: "You cannot change your own role." });
    }

    try {
        const models = [Student, Staff, Lecturer];
        let targetUser = null;
        for (const model of models) {
            targetUser = await model.findOne({ email });
            if (targetUser) break;
        }

        if (!targetUser) {
            return res.status(404).json({ success: false, error: 'User not found.' });
        }
        
        if (ADMIN_EMAILS.includes(targetEmail)) {
             if (currentUser.role === 'admin') {
                return res.status(403).json({ success: false, error: "An admin cannot change another admin's role." });
             } else {
                 return res.status(403).json({ success: false, error: "You do not have permission to change this user's role." });
             }
        }


        // Prevent moderators from changing an admin's role
        if (currentUser.role === 'moderator' && newRole === 'admin') {
            return res.status(403).json({ success: false, error: "Moderators cannot promote users to admin." });
        }
        // Prevent moderators from changing another moderator's role
        const targetUserRole = targetUser.roleOverride || (targetUser.staffId || targetUser.lecturerId ? 'moderator' : 'regular');
        if (currentUser.role === 'moderator' && targetUserRole === 'moderator' && newRole !== 'regular') {
            return res.status(403).json({ success: false, error: "Moderators cannot change another moderator's role." });
        }

        // Update roleOverride based on the new role
        targetUser.roleOverride = newRole === 'regular' ? 'regular' : 'moderator';

        await targetUser.save();
        res.json({ success: true, message: `Successfully updated role for ${email} to ${newRole}.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error updating role.' });
    }
});

// POST route to remove a user
router.post('/remove-user', ensureAdminOrModerator, async (req, res) => {
    const { email } = req.body;
    const currentUser = req.session.user;
    const targetEmail = email.toLowerCase();
    const currentEmail = currentUser.email.toLowerCase();

    if (currentEmail === targetEmail) {
        return res.status(400).json({ success: false, error: "You cannot remove yourself." });
    }

    try {
        const models = { 'student': Student, 'staff': Staff, 'lecturer': Lecturer };
        let targetUser = null;
        let targetUserType = null;
        for (const type in models) {
            targetUser = await models[type].findOne({ email });
            if (targetUser) {
                targetUserType = type;
                break;
            }
        }

        if (!targetUser) {
            return res.status(404).json({ success: false, error: "User not found." });
        }
        
        if (ADMIN_EMAILS.includes(targetEmail)) {
             if (currentUser.role === 'admin') {
                return res.status(403).json({ success: false, error: "An admin cannot remove another admin." });
             } else {
                 return res.status(403).json({ success: false, error: "You do not have permission to remove this user." });
             }
        }
        
        // Determine the target user's role
        const enrichedTarget = await determineUserRoleAndColor(targetUser.toObject(), targetUserType);

        // Authorization checks
        if (currentUser.role === 'moderator' && (enrichedTarget.role === 'admin' || enrichedTarget.role === 'moderator')) {
            return res.status(403).json({ success: false, error: "Moderators can only remove regular users." });
        }
        
        // Delete user from all collections they might be in
        await Student.deleteOne({ email });
        await Staff.deleteOne({ email });
        await Lecturer.deleteOne({ email });
        
        // Remove user's email from all community member and banned lists
        await Community.updateMany(
            { 'members': email },
            { $pull: { members: email } }
        );
        await Community.updateMany(
            { 'bannedMembers.email': email },
            { $pull: { bannedMembers: { email: email } } }
        );

        res.json({ success: true, message: `User ${email} has been permanently removed.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: "Server error removing user." });
    }
});

// POST route to add a new user
router.post('/add-user', ensureAdminOrModerator, async (req, res) => {
    const { fullName, email, id, userType } = req.body;
    const currentUser = req.session.user;
    const targetEmail = email.toLowerCase();
    const currentEmail = currentUser.email.toLowerCase();

    if (!fullName || !email || !id || !userType) {
        return res.status(400).json({ success: false, error: 'All fields are required.' });
    }

    // Convert ID to uppercase for consistent storage and lookup
    const upperCaseId = id.toUpperCase();

    // Server-side validation to restrict user creation for moderators
    if (currentUser.role === 'moderator' && (userType === 'staff' || userType === 'lecturer')) {
        return res.status(403).json({ success: false, error: 'Moderators can only add student accounts.' });
    }

    // Add validation for student IDs - use the upperCaseId for the check
    if (userType === 'student' && upperCaseId.includes('-')) {
        return res.status(400).json({ success: false, error: 'Student ID cannot contain a hyphen.' });
    }

    if (ADMIN_EMAILS.includes(targetEmail)) {
        if (currentUser.role === 'admin') {
            return res.status(403).json({ success: false, error: "An admin cannot add another admin." });
        } else {
             return res.status(403).json({ success: false, error: "You do not have permission to add this user." });
        }
    }
    
    try {
        // Check for existing user with the same email
        const existingStudent = await Student.findOne({ email });
        const existingStaff = await Staff.findOne({ email });
        const existingLecturer = await Lecturer.findOne({ email });

        if (existingStudent || existingStaff || existingLecturer) {
            return res.status(409).json({ success: false, error: 'A user with this email already exists.' });
        }

        // Check for existing user with the same ID based on user type - use upperCaseId
        let existingIdUser;
        if (userType === 'student') {
            existingIdUser = await Student.findOne({ studentId: upperCaseId });
        } else if (userType === 'staff') {
            existingIdUser = await Staff.findOne({ userId: upperCaseId });
        } else if (userType === 'lecturer') {
            existingIdUser = await Lecturer.findOne({ userId: upperCaseId });
        }

        if (existingIdUser) {
            return res.status(409).json({ success: false, error: 'A user with this ID already exists.' });
        }

        let newUser;
        if (userType === 'student') {
            // Use upperCaseId when creating the new record
            newUser = new Student({ fullName, email, studentId: upperCaseId });
        } else if (userType === 'staff') {
            // Use upperCaseId when creating the new record
            newUser = new Staff({ fullName, email, userId: upperCaseId });
        } else if (userType === 'lecturer') {
            // Use upperCaseId when creating the new record
            newUser = new Lecturer({ fullName, email, userId: upperCaseId });
        } else {
            return res.status(400).json({ success: false, error: 'Invalid user type provided.' });
        }

        await newUser.save();
        res.status(201).json({ success: true, message: 'User added successfully. The user can now sign up to set their password.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error adding user.' });
    }
});

module.exports = router;