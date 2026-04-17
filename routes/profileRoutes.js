const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Lecturer = require('../models/Lecturer');
const bcrypt = require("bcrypt");
const { computeUserKarma } = require('../utils/karma');
const getCommunityModel = require('../models/communityPostModel');
const Community = require('../models/Community');
const { determineUserRoleAndColor, enrichAuthorInfo } = require('../utils/userUtils');
const { getLevelThresholds } = require('../utils/points');
const { avatar, banner } = require('../middleware/upload');
const { v2: cloudinary } = require('cloudinary');

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

// Helper to handle post enrichment (for profile view)
async function enrichPostData(post) {
    post.author = await enrichAuthorInfo(post.author);
    
    if (post.comments && post.comments.length > 0) {
        const nonDeletedComments = post.comments.filter(c => !c.deleted?.status);
        if (nonDeletedComments.length > 0) {
            // Sort to get the top comment only
            nonDeletedComments.sort((a, b) => b.upvotes.length - a.upvotes.length);
            post.comments[0] = nonDeletedComments[0];
            post.comments[0].author = await enrichAuthorInfo(post.comments[0].author);
        } else {
            post.comments = [];
        }
    }
    return post;
}

// View Profile - for the current logged-in user
router.get('/view', async (req, res) => {
    const targetEmail = req.session.user?.email;

    if (!targetEmail) {
        return res.redirect('/');
    }

    // Get the latest user data from the database
    let userModel;
    let userType;
    if (req.session.user.userType === 'student') userModel = Student;
    if (req.session.user.userType === 'staff') userModel = Staff;
    if (req.session.user.userType === 'lecturer') userModel = Lecturer;
    userType = req.session.user.userType;

    const USER_PROJECTION = '-password'; 

    const viewedUser = await userModel.findOne({ email: targetEmail }).select(USER_PROJECTION).lean(); 
    if (!viewedUser) return res.status(404).json({ success: false, error: 'User not found.' });

    const communities = await Community.find().lean();
    
    await determineUserRoleAndColor(viewedUser, userType);
    viewedUser.userType = userType; // Set userType for the profile view
    
    // Parallelize fetching posts and comments from all communities
    const postFetchingPromises = communities.map(async (community) => {
        const PostModel = getCommunityModel(community.name);
        
        const communityDisplayName = community.displayName;
        
        const postsPromise = PostModel.find({
            'author.email': targetEmail,
            'deleted.status': false
        }).lean().then(posts => posts.map(p => ({ ...p, community: community.name, communityDisplayName }))); // MODIFIED

        const commentedPromise = PostModel.find({
            'comments.author.email': targetEmail,
            'deleted.status': false
        }).lean().then(commented => {
            return commented.filter(post => 
                post.comments.some(c => c.author.email === targetEmail && !c.deleted?.status)
            ).map(p => ({ ...p, community: community.name, communityDisplayName })); // MODIFIED
        });

        const [posts, commented] = await Promise.all([postsPromise, commentedPromise]);
        return { posts, commented };
    });

    const results = await Promise.all(postFetchingPromises);

    let userPosts = [];
    let commentedPosts = [];

    results.forEach(result => {
        userPosts.push(...result.posts);
        commentedPosts.push(...result.commented);
    });
    
    // Remove duplicates from commentedPosts
    commentedPosts = commentedPosts.filter(
        (post, index, self) =>
            index === self.findIndex(p => p._id.toString() === post._id.toString())
    );

    // Parallelize enrichment for all posts/comments (major speedup)
    const allPostsToEnrich = [...userPosts, ...commentedPosts];
    const enrichedPosts = await Promise.all(allPostsToEnrich.map(post => enrichPostData(post)));

    // Re-map the enriched posts back to their original arrays (efficiently)
    const postMap = new Map(enrichedPosts.map(p => [p._id.toString(), p]));
    userPosts = userPosts.map(p => postMap.get(p._id.toString()));
    commentedPosts = commentedPosts.map(p => postMap.get(p._id.toString()));


    const viewedUserJoinedCommunities = await Community.find({ members: targetEmail });
    const karmaData = await computeUserKarma(viewedUser.email); 

    const isOwner = true;

    // Calculate EXP progress for the bar
    const { currentLevelThreshold, nextLevelThreshold, isMaxLevel } = getLevelThresholds(viewedUser.level);
    const totalPointsToNextLevel = nextLevelThreshold - currentLevelThreshold;
    const pointsProgress = isMaxLevel ? viewedUser.points : (viewedUser.points - currentLevelThreshold);
    const expProgressPercentage = isMaxLevel ? 100 : (pointsProgress / totalPointsToNextLevel) * 100;

    res.render('profile/view', {
        title: `${viewedUser.fullName}'s Profile`,
        viewedUser,
        userPosts,
        commentedPosts,
        viewedUserJoinedCommunities,
        karma: karmaData.karma,
        isOwner,
        expProgressPercentage,
        pointsProgress,
        nextLevelThreshold
    });
});

// View Profile - for any user
router.get('/view/:email', async (req, res) => {
    const targetEmail = req.params.email;

    if (!targetEmail) {
        return res.redirect('/');
    }

    let userModel;
    let userType;
    
    // Parallelize user lookups
    const USER_PROJECTION = '-password'; 

    const [student, staff, lecturer] = await Promise.all([
        Student.findOne({ email: targetEmail }).select(USER_PROJECTION).lean(),
        Staff.findOne({ email: targetEmail }).select(USER_PROJECTION).lean(),
        Lecturer.findOne({ email: targetEmail }).select(USER_PROJECTION).lean()
    ]);
    
    if (student) {
        userModel = Student;
        userType = 'student';
    } else if (staff) {
        userModel = Staff;
        userType = 'staff';
    } else if (lecturer) {
        userModel = Lecturer;
        userType = 'lecturer';
    }

    // Consolidate viewedUser data from whichever model was found
    const viewedUser = student || staff || lecturer;

    if (!viewedUser) {
        return res.status(404).json({ success: false, error: 'User not found.' });
    }

    await determineUserRoleAndColor(viewedUser, userType);
    viewedUser.userType = userType; // Set userType for the profile view

    const communities = await Community.find().lean();
    
    // Parallelize fetching posts and comments from all communities
    const postFetchingPromises = communities.map(async (community) => {
        const PostModel = getCommunityModel(community.name);
        
        const communityDisplayName = community.displayName; 

        const postsPromise = PostModel.find({
            'author.email': targetEmail,
            'deleted.status': false
        }).lean().then(posts => posts.map(p => ({ ...p, community: community.name, communityDisplayName }))); // MODIFIED

        const commentedPromise = PostModel.find({
            'comments.author.email': targetEmail,
            'deleted.status': false
        }).lean().then(commented => {
            return commented.filter(post => 
                post.comments.some(c => c.author.email === targetEmail && !c.deleted?.status)
            ).map(p => ({ ...p, community: community.name, communityDisplayName })); // MODIFIED
        });

        const [posts, commented] = await Promise.all([postsPromise, commentedPromise]);
        return { posts, commented };
    });

    const results = await Promise.all(postFetchingPromises);

    let userPosts = [];
    let commentedPosts = [];

    results.forEach(result => {
        userPosts.push(...result.posts);
        commentedPosts.push(...result.commented);
    });
    
    // Remove duplicates from commentedPosts
    commentedPosts = commentedPosts.filter(
        (post, index, self) =>
            index === self.findIndex(p => p._id.toString() === post._id.toString())
    );

    // Parallelize enrichment for all posts/comments (major speedup)
    const allPostsToEnrich = [...userPosts, ...commentedPosts];
    const enrichedPosts = await Promise.all(allPostsToEnrich.map(post => enrichPostData(post)));

    // Re-map the enriched posts back to their original arrays
    const postMap = new Map(enrichedPosts.map(p => [p._id.toString(), p]));
    userPosts = userPosts.map(p => postMap.get(p._id.toString()));
    commentedPosts = commentedPosts.map(p => postMap.get(p._id.toString()));


    const viewedUserJoinedCommunities = await Community.find({ members: targetEmail });
    const karmaData = await computeUserKarma(viewedUser.email);
    const isOwner = req.session.user?.email === targetEmail;

    // Calculate EXP progress for the bar
    const { currentLevelThreshold, nextLevelThreshold, isMaxLevel } = getLevelThresholds(viewedUser.level);
    const totalPointsToNextLevel = nextLevelThreshold - currentLevelThreshold;
    const pointsProgress = isMaxLevel ? viewedUser.points : (viewedUser.points - currentLevelThreshold);
    const expProgressPercentage = isMaxLevel ? 100 : (pointsProgress / totalPointsToNextLevel) * 100;

    res.render('profile/view', {
        title: `${viewedUser.fullName}'s Profile`,
        viewedUser,
        userPosts,
        commentedPosts,
        viewedUserJoinedCommunities,
        karma: karmaData.karma,
        isOwner,
        expProgressPercentage,
        pointsProgress,
        nextLevelThreshold
    });
});

// Upload Avatar
router.post('/upload-avatar', avatar.single('avatar'), async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, error: 'Login required.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'No file was uploaded.' });

    const sessionUser = req.session.user;
    let userModel;
    if (sessionUser.userType === 'student') userModel = Student;
    if (sessionUser.userType === 'staff') userModel = Staff;
    if (sessionUser.userType === 'lecturer') userModel = Lecturer;

    try {
        const user = await userModel.findOne({ email: req.session.user.email });

        // Check if the old avatar exists and delete it from Cloudinary
        if (user.avatar?.filename) {
            const publicId = user.avatar.filename.split('/').slice(-2).join('/').split('.')[0];
            await cloudinary.uploader.destroy(`uploads/profile/avatars/${publicId}`);
        }

        user.avatar = {
            filename: req.file.path, // Save the Cloudinary URL
            uploadedAt: new Date()
        };
        await user.save();

        req.session.user.avatar = user.avatar;
        res.json({ success: true, filename: user.avatar.filename });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to upload avatar.' });
    }
});

// Remove Avatar
router.post('/remove-avatar', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, error: 'Login required.' });

    const sessionUser = req.session.user;
    let userModel;
    if (sessionUser.userType === 'student') userModel = Student;
    if (sessionUser.userType === 'staff') userModel = Staff;
    if (sessionUser.userType === 'lecturer') userModel = Lecturer;

    try {
        const user = await userModel.findOne({ email: req.session.user.email });

        // Check if the old avatar exists and delete it from Cloudinary
        if (user.avatar?.filename) {
            const publicId = user.avatar.filename.split('/').slice(-2).join('/').split('.')[0];
            await cloudinary.uploader.destroy(`uploads/profile/avatars/${publicId}`);
        }

        user.avatar = undefined;
        await user.save();

        req.session.user.avatar = undefined;
        res.json({ success: true, message: 'Avatar removed successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to remove avatar.' });
    }
});

// Upload Banner
router.post('/upload-banner', banner.single('banner'), async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, error: 'Login required.' });
    if (!req.file) return res.status(400).json({ success: false, error: 'No file was uploaded.' });

    const sessionUser = req.session.user;
    let userModel;
    if (sessionUser.userType === 'student') userModel = Student;
    if (sessionUser.userType === 'staff') userModel = Staff;
    if (sessionUser.userType === 'lecturer') userModel = Lecturer;

    try {
        const user = await userModel.findOne({ email: req.session.user.email });

        // Check if the old banner exists and delete it from Cloudinary
        if (user.banner?.filename) {
            const publicId = user.banner.filename.split('/').slice(-2).join('/').split('.')[0];
            await cloudinary.uploader.destroy(`uploads/profile/banners/${publicId}`);
        }

        user.banner = {
            filename: req.file.path, // Save the Cloudinary URL
            uploadedAt: new Date()
        };
        await user.save();

        res.json({ success: true, filename: user.banner.filename });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to upload banner.' });
    }
});

// Remove Banner
router.post('/remove-banner', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, error: 'Login required.' });

    const sessionUser = req.session.user;
    let userModel;
    if (sessionUser.userType === 'student') userModel = Student;
    if (sessionUser.userType === 'staff') userModel = Staff;
    if (sessionUser.userType === 'lecturer') userModel = Lecturer;

    try {
        const user = await userModel.findOne({ email: req.session.user.email });

        // Check if the old banner exists and delete it from Cloudinary
        if (user.banner?.filename) {
            const publicId = user.banner.filename.split('/').slice(-2).join('/').split('.')[0];
            await cloudinary.uploader.destroy(`uploads/profile/banners/${publicId}`);
        }

        user.banner = undefined;
        await user.save();

        res.json({ success: true, message: 'Banner removed successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to remove banner.' });
    }
});

// Settings page
router.get('/settings', async (req, res) => {
    const sessionUser = req.session.user;

    let userModel;
    let userType;
    if (sessionUser.userType === 'student') userModel = Student;
    if (sessionUser.userType === 'staff') userModel = Staff;
    if (sessionUser.userType === 'lecturer') userModel = Lecturer;
    userType = sessionUser.userType;

    const viewedUser = await userModel.findById(sessionUser._id).lean();
    if (!viewedUser) return res.status(404).json({ success: false, error: 'User not found' });

    await determineUserRoleAndColor(viewedUser, userType);
    viewedUser.userType = userType;

    res.render('profile/settings', { title: 'Settings', viewedUser: viewedUser });
});

router.post("/settings", async (req, res) => {
    const sessionUser = req.session.user;
    const { currentPassword, newPassword, confirmPassword, theme } = req.body;

    try {
        let userModel;
        if (sessionUser.userType === "student") userModel = Student;
        if (sessionUser.userType === "staff") userModel = Staff;
        if (sessionUser.userType === "lecturer") userModel = Lecturer;

        const user = await userModel.findById(sessionUser._id);
        if (!user) return res.status(404).json({ success: false, error: "User not found" });

        // Only attempt to change password if a new password is provided
        if (newPassword) {
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ success: false, error: "Current password is incorrect" });
            }

            if (newPassword !== confirmPassword) {
                return res.status(400).json({ success: false, error: "New passwords do not match" });
            }

            // Server-side password strength validation
            const minLength = 8;
            const hasUpperCase = /[A-Z]/.test(newPassword);
            const hasLowerCase = /[a-z]/.test(newPassword);
            const hasNumbers = /\d/.test(newPassword);
            const hasSymbols = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);

            if (newPassword.length < minLength || !hasUpperCase || !hasLowerCase || !hasNumbers || !hasSymbols) {
                return res.status(400).json({ success: false, error: "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one symbol." });
            }

            const isSame = await bcrypt.compare(newPassword, user.password);
            if (isSame) {
                return res.status(400).json({ success: false, error: "New Password cannot be the same as old one" });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            user.password = hashedPassword;
        }

        // Save the new theme preference
        user.theme = theme;
        await user.save();

        // Update the session user and redirect
        req.session.user.theme = user.theme;
        res.json({ success: true, message: "Settings saved successfully" }); 
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: "Something went wrong" });
    }
});

module.exports = router;