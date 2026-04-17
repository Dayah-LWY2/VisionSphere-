const express = require('express');
const router = express.Router();
const getCommunityModel = require('../models/communityPostModel');

const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Lecturer = require('../models/Lecturer');
const Community = require('../models/Community');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { updateUserPoints } = require('../utils/points');
const { enrichAuthorInfo, determineUserRoleAndColor, ADMIN_EMAILS, fetchUsersByEmails } = require('../utils/userUtils');
const { comment, communityIcon } = require('../middleware/upload');
const { v2: cloudinary } = require('cloudinary');
const multer = require('multer'); // IMPORT MULTER FOR NON-FILE UPLOAD FORMS

// Import the cache object from the sidebar middleware
const { COMMUNITY_CACHE } = require('../middleware/sidebar');

// Small helpers
const normalize = (s) => (s || '').toLowerCase().trim();
function safeGetCommunityModel(communityName) {
    if (!communityName || typeof communityName !== 'string' || !communityName.trim()) {
        throw new Error('Invalid communityName — refusing to create collection');
    }
    return getCommunityModel(communityName);
}

// Helper function for parallel post enrichment (new)
async function enrichPostData(post, communityDisplayName, userMap) { // ADD userMap
    post.communityDisplayName = communityDisplayName;
    post.author = await enrichAuthorInfo(post.author, userMap); // PASS userMap
    
    if (post.comments && post.comments.length > 0) {
        const nonDeletedComments = post.comments.filter(c => !c.deleted?.status);
        if (nonDeletedComments.length > 0) {
            // Sort to get the top comment only
            nonDeletedComments.sort((a, b) => b.upvotes.length - a.upvotes.length);
            post.comments[0] = nonDeletedComments[0];
            post.comments[0].author = await enrichAuthorInfo(post.comments[0].author, userMap); // PASS userMap
        } else {
            post.comments = [];
        }
    }
    return post;
}

// GET route for creating a community
router.get('/create', (req, res) => {
    const user = req.session.user;
    if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
        return res.status(403).send("Forbidden");
    }

    res.render('community/createCommunity', {
        title: 'Create Community'
    });
});

// POST route to handle community creation
router.post('/create', async (req, res) => {
    const { name, description, isGeneral, isRestrictedPosting } = req.body;
    const user = req.session.user;

    if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
        return res.status(403).json({ success: false, error: "Forbidden" });
    }

    if (!name) {
        return res.status(400).json({ success: false, error: "Community name is required." });
    }

    const originalName = name.trim();
    const normalizedName = originalName.toLowerCase(); 

    try {
        const existingCommunity = await Community.findOne({ name: normalizedName });
        if (existingCommunity) {
            return res.status(409).json({ success: false, error: "A community with this name already exists." });
        }
        
        const newCommunity = await Community.create({
            name: normalizedName, // Stored lowercase for lookups
            displayName: originalName, // Stored with original casing for display
            description: description || '',
            members: !!isGeneral ? [] : [user.email], // Empty if general, else add creator
            isGeneral: !!isGeneral,
            isRestrictedPosting: !!isRestrictedPosting
        });

        const CommunityPost = safeGetCommunityModel(normalizedName);
        await CommunityPost.createIndexes();
        
        // Invalidate sidebar cache so the new community appears immediately
        if (COMMUNITY_CACHE) {
            COMMUNITY_CACHE.data = null;
        }

        res.redirect(`/community/${newCommunity.name}`);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: "Failed to create community." });
    }
});

// Get Community page with optional filter
router.get('/:communityName', async (req, res) => {
    const communityParam = req.params.communityName;
    const communityName = normalize(communityParam);
    const filter = req.query.filter || 'latest';
    const user = req.session.user;

    try {
        let community = await Community.findOne({ name: communityName }).lean();

        if (!community) {
            return res.status(404).json({ success: false, error: "Community not found" });
        }

        const isBanned = user && community.bannedMembers?.some(b => b.email === user.email);

        // Determine if user is a member (either explicit or implicit via isGeneral)
        const isMember = community.isGeneral || (user && community.members.includes(user.email));

        const CommunityPost = safeGetCommunityModel(communityName);

        let postsQuery = CommunityPost.find({ 'deleted.status': { $ne: true } });

        if (filter === 'popular') {
            postsQuery = postsQuery.sort({ upvotes: -1 });
        } else {
            // Default sort by latest if not popular or unanswered
            postsQuery = postsQuery.sort({ createdAt: -1 });
        }

        const rawPosts = await postsQuery.lean();
        
        // Set the display name property here, falling back to uppercase name
        const communityDisplayName = community.displayName || community.name.toUpperCase();

        // Parallelize post enrichment
        const postsPromises = rawPosts.map(post => enrichPostData(post, communityDisplayName));
        let posts = await Promise.all(postsPromises);
        
        if (filter === 'unanswered') {
            posts.sort((a, b) => {
                const aUnanswered = a.comments?.length === 0;
                const bUnanswered = b.comments?.length === 0;
                if (aUnanswered && !bUnanswered) return -1;
                if (!aUnanswered && bUnanswered) return 1;
                return 0;
            });
        }

        res.render('community/view', {
            title: communityDisplayName,
            communityName,
            posts,
            filter,
            description: community.description,
            memberCount: community.members?.length || 0,
            communityIcon: community.icon?.filename || null,
            communityMembers: community.members || [],
            isBanned,
            isGeneral: community.isGeneral,
            communityDisplayName,
            isRestrictedPosting: community.isRestrictedPosting
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error loading community posts.' });
    }
});

// Community Settings Page
router.get('/:communityName/settings', async (req, res) => {
    const communityName = normalize(req.params.communityName);
    const user = req.session.user;

    try {
        const community = await Community.findOne({ name: communityName }).lean();

        if (!community) {
            return res.status(404).send("Community not found.");
        }

        // Use the logic that defines "membership" for General Communities
        const isMember = community.isGeneral || community.members.includes(user.email);
        const isAdmin = user.role === 'admin';
        const isModerator = user.role === 'moderator';

        // Admin can manage all. Moderator can manage if they are a member.
        if (!isAdmin && (!isModerator || !isMember)) {
            return res.status(403).send("You do not have permission to view these settings.");
        }

        // Set the display name property here, falling back to uppercase name
        const communityDisplayName = community.displayName || community.name.toUpperCase();

        res.render('community/settings', {
            title: `${communityDisplayName} Settings`,
            community: {
                ...community,
                displayName: communityDisplayName
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Failed to load community settings.');
    }
});

// Get Post Page
router.get('/:communityName/post/:postId', async (req, res) => {
    const communityName = normalize(req.params.communityName);
    const postId = req.params.postId;
    const filter = req.query.filter || 'popular';

    try {
        const CommunityPost = safeGetCommunityModel(communityName);
        const post = await CommunityPost.findById(postId).lean();
        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
        
        // Fetch community to get display name for the title
        const community = await Community.findOne({ name: communityName });
        // Set the display name property here, falling back to uppercase name
        const communityDisplayName = community.displayName || community.name.toUpperCase();

        // Batch fetch implementation
        const authorEmails = new Set();
        authorEmails.add(post.author.email); // Post author
        post.comments.forEach(c => { // All comment authors
            if (c.author?.email) authorEmails.add(c.author.email);
        });
        
        const userMap = await fetchUsersByEmails(Array.from(authorEmails)); // BATCH FETCH

        // Enrich post author
        post.author = await enrichAuthorInfo(post.author, userMap); // PASS userMap

        // Parallelize comment author enrichment
        const commentEnrichmentPromises = post.comments.map(async comment => {
            comment.author = await enrichAuthorInfo(comment.author, userMap); // PASS userMap
            return comment;
        });

        post.comments = await Promise.all(commentEnrichmentPromises);

        // Sort comments based on the filter
        if (filter === 'latest') {
            post.comments.sort((a, b) => a.createdAt - b.createdAt);
        } else if (filter === 'unanswered') {
            const rootComments = post.comments.filter(c => !c.parentId);
            const answeredComments = [];
            const unansweredComments = [];

            rootComments.forEach(c => {
                const hasReplies = post.comments.some(reply => String(reply.parentId) === String(c._id));
                if (hasReplies) {
                    answeredComments.push(c);
                } else {
                    unansweredComments.push(c);
                }
            });

            // Unanswered root comments first, then answered root comments. Keep child comments in place.
            const sortedRootComments = [...unansweredComments, ...answeredComments];
            const sortedComments = [];

            // Rebuild the comments array based on the new root comment order
            sortedRootComments.forEach(rootComment => {
                sortedComments.push(rootComment);
                const findReplies = (parentId) => {
                    const replies = post.comments.filter(c => String(c.parentId) === String(parentId));
                    // Keep replies in creation order for consistency
                    replies.sort((a, b) => a.createdAt - b.createdAt); 
                    replies.forEach(reply => {
                        sortedComments.push(reply);
                        findReplies(reply._id);
                    });
                };
                findReplies(rootComment._id);
            });
            post.comments = sortedComments;

        } else {
            // Default to popular filter if no valid filter is provided
            post.comments.sort((a, b) => b.upvotes.length - a.upvotes.length);
        }
        
        // Get user's joined communities (for the EJS logic on post page)
        const joinedCommunities = req.session.user ? await Community.find({ members: req.session.user.email }).lean() : [];


        res.render('community/post', {
            title: `${post.title} in c/${communityDisplayName}`,
            post,
            communityName,
            filter,
            postId,
            communityDisplayName,
            joinedCommunities // Pass to EJS for checking mod delete permission
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to load post' });
    }
});

// User Comment 
router.post('/:communityName/post/:postId/comment', (req, res, next) => {
    // Set a flag for the upload middleware
    req.body = req.body || {};
    req.isComment = true;
    next();
}, comment.single('media'), async (req, res) => { // Use 'comment.single' to handle a single file
    const communityName = normalize(req.params.communityName);
    const postId = req.params.postId;
    const { content, parentId } = req.body;
    const file = req.file;
    const user = req.session.user;

    if (!user) return res.status(401).json({ success: false, error: 'Login required' });

    try {
        const CommunityPost = safeGetCommunityModel(communityName);

        const newComment = {
            content,
            parentId: parentId || null,
            author: {
                email: user.email,
                fullName: user.fullName,
                avatar: user.avatar || {}
            },
            media: file ? file.path : null, // Store the Cloudinary URL directly
            createdAt: new Date()
        };

        await CommunityPost.findByIdAndUpdate(postId, {
            $push: { comments: newComment }
        });

        await updateUserPoints(user.email, 1); // Comment point

        res.redirect(`/community/${communityName}/post/${postId}`);
    } catch (err) {
        console.error(err);
        // On error, delete file from Cloudinary
        if (file) {
            const publicId = file.path.split('/').slice(-2).join('/').split('.')[0];
            await cloudinary.uploader.destroy(`uploads/comments/${publicId}`);
        }
        res.status(500).json({ success: false, error: 'Failed to add comment' });
    }
});

// Join Community
router.post('/:communityName/join', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, error: 'Login required' });

    const communityName = normalize(req.params.communityName);
    const email = req.session.user.email;

    try {
        const community = await Community.findOne({ name: communityName });
        if (!community) return res.status(404).json({ success: false, error: 'Community not found' });

        // Block join/leave action on General Community
        if (community.isGeneral) {
             return res.status(403).json({ success: false, error: 'Cannot join or leave a General Community.' });
        }

        const isMember = community.members.includes(email);
        if (isMember) {
            community.members = community.members.filter(member => member != email);
        } else {
            community.members.push(email);
        }

        await community.save();

        // Invalidate the sidebar cache to force a refresh on the next request
        if (COMMUNITY_CACHE) {
            COMMUNITY_CACHE.data = null;
        }

        res.redirect(`/community/${communityName}`);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to join community' });
    }
});

// Kick Member
router.post('/:communityName/kick', async (req, res) => {
    try {
        const { communityName } = req.params;
        const { email: targetEmail, reason } = req.body;


        const currentUser = req.session.user;
        if (!currentUser) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const community = await Community.findOne({ name: normalize(communityName) });
        if (!community) {
            return res.status(404).json({ error: 'Community not found' });
        }
        
        // Block kick action on General Community
        if (community.isGeneral) {
            return res.status(403).json({ error: 'Cannot kick members from a General Community.' });
        }

        const isAdmin = currentUser.role === 'admin';
        const isMember = community.members.includes(currentUser.email);
        if (!isAdmin && !isMember) {
            return res.status(403).json({ error: 'You must be a member of this community to perform this action.' });
        }

        if (!community.members.includes(targetEmail)) {
            return res.status(400).json({ error: 'User not a member of this community' });
        }

        const Student = require('../models/Student');
        const Staff = require('../models/Staff');
        const Lecturer = require('../models/Lecturer');

        let targetUser =
            (await Student.findOne({ email: targetEmail }).lean()) ||
            (await Staff.findOne({ email: targetEmail }).lean()) ||
            (await Lecturer.findOne({ email: targetEmail }).lean());

        let targetRole = 'regular';
        if (targetUser) {
            if (ADMIN_EMAILS.includes(targetEmail.toLowerCase())) {
                targetRole = 'admin';
            } else if (targetUser.roleOverride === 'regular') {
                targetRole = 'regular';
            } else if (targetUser.roleOverride === 'moderator') {
                targetRole = 'moderator';
            } else if (targetUser.staffId || targetUser.lecturerId) {
                targetRole = 'moderator';
            }
        }

        if (currentUser.role === 'moderator') {
            if (targetRole !== 'regular') {
                return res.status(403).json({ error: 'Moderators can only kick regular users' });
            }
        } else if (currentUser.role === 'regular') {
            return res.status(403).json({ error: 'Regular users cannot kick anyone' });
        }

        if (!reason || reason.trim() === '') {
            return res.status(400).json({ error: 'Reason is required to kick a user' });
        }

        await Community.updateOne(
            { name: normalize(communityName) },
            {
                $pull: { members: targetEmail },
                $push: {
                    removedMembers: {
                        email: targetEmail,
                        removedBy: currentUser.email,
                        removedAt: new Date(),
                        reason
                    }
                }
            }
        );

        const Notification = require('../models/Notification');

        await Notification.create({
            userEmail: targetEmail,
            message: `You have been kicked from ${communityName}: ${reason}`,
        });

        await updateUserPoints(targetEmail, -100); // removed from community

        return res.status(200).json({ success: true, message: `Yahoo kicked: ${targetEmail}` });
    } catch (err) {
        console.error('[Kick Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update Description
router.post('/:communityName/description', async (req, res) => {
    const communityName = normalize(req.params.communityName);
    const { description } = req.body;
    const user = req.session.user;

    if (!user) return res.status(401).json({ success: false, error: 'Login required' });

    try {
        const community = await Community.findOne({ name: communityName });
        if (!community) return res.status(404).json({ success: false, error: 'Community not found' });

        const isModeratorOrAdmin = ['admin', 'moderator'].includes(user.role);
        // Use isGeneral to grant implicit membership for admin/mod permission checks
        const isMember = community.isGeneral || community.members.includes(user.email); 

        if (user.role !== 'admin' && (!isModeratorOrAdmin || !isMember)) {
            return res.status(403).json({ success: false, error: 'You must be a moderator or admin of this community to edit the description.' });
        }

        await Community.findOneAndUpdate(
            { name: communityName },
            { $set: { description } },
            { upsert: true }
        );

        res.status(200).json({ success: true, message: 'Description updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to update description' });
    }
});

// Corrected route to handle JSON responses for client-side JavaScript
router.post('/:communityName/icon', communityIcon.single('icon'), async (req, res) => {
    const communityName = normalize(req.params.communityName);
    const user = req.session.user;

    if (!user || !['admin', 'moderator'].includes(user.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    try {
        const community = await Community.findOne({ name: communityName });
        if (!community) return res.status(404).json({ success: false, error: 'Community not found' });

        // Use isGeneral to grant implicit membership for admin/mod permission checks
        const isMember = community.isGeneral || community.members.includes(user.email); 
        const isAdmin = user.role === 'admin';
        if (!isAdmin && !isMember) {
            return res.status(403).json({ success: false, error: 'You must be a member of this community to perform this action.' });
        }
        
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file was uploaded.' });
        }

        const filename = req.file.path; // Store the Cloudinary URL
        await Community.findOneAndUpdate(
            { name: communityName },
            {
                icon: {
                    filename,
                    uploadedAt: new Date()
                }
            }
        );

        res.json({ success: true, message: 'Icon uploaded successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Error uploading icon' });
    }
});

// Corrected route to handle JSON responses for client-side JavaScript
router.post('/:communityName/icon/delete', async (req, res) => {
    const communityName = normalize(req.params.communityName);
    const user = req.session.user;

    if (!user || !['admin', 'moderator'].includes(user.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    try {
        const community = await Community.findOne({ name: communityName });
        if (!community) return res.status(404).json({ success: false, error: 'Community not found' });

        // Use isGeneral to grant implicit membership for admin/mod permission checks
        const isMember = community.isGeneral || community.members.includes(user.email); 
        const isAdmin = user.role === 'admin';
        if (!isAdmin && !isMember) {
            return res.status(403).json({ success: false, error: 'You must be a member of this community to perform this action.' });
        }

        if (community?.icon?.filename) {
            const publicId = community.icon.filename.split('/').slice(-2).join('/').split('.')[0];
            await cloudinary.uploader.destroy(`uploads/communities/${publicId}`);
        }

        community.icon = null;
        await community.save();

        res.json({ success: true, message: 'Icon deleted successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to delete icon' });
    }
});

// User React
router.post('/:communityName/reaction/:postId', async (req, res) => {
    const { communityName, postId } = req.params;
    const { emoji } = req.body;
    const user = req.session.user;

    if (!user) return res.status(401).json({ success: false, error: 'Login required' });

    try {
        const Post = safeGetCommunityModel(communityName);
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

        if (!post.reactions.has(emoji)) post.reactions.set(emoji, []);

        const users = post.reactions.get(emoji);
        const index = users.indexOf(user.email);
        const isPostAuthor = post.author.email === user.email;

        if (index === -1) {
            users.push(user.email);
            if (isPostAuthor) {
                await updateUserPoints(post.author.email, 2); // +2 point received reaction
            }
        } else {
            users.splice(index, 1);
            if (isPostAuthor) {
                await updateUserPoints(post.author.email, -2); // -2 point reaction removed from user
            }
        }

        post.reactions.set(emoji, users);
        await post.save();

        res.json({ success: true, reactions: post.reactions, userEmail: user.email });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// User vote
router.post('/:communityName/vote/:postId', async (req, res) => {
    const communityName = normalize(req.params.communityName);
    const { postId } = req.params;
    const { voteType } = req.body;
    const user = req.session.user;

    if (!user) return res.status(401).json({ success: false, error: 'Login required' });

    // Input validation for postId
    if (!mongoose.Types.ObjectId.isValid(postId)) {
        return res.status(400).json({ success: false, error: 'Invalid post ID provided.' });
    }

    try {
        const Post = safeGetCommunityModel(communityName);
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

        const email = user.email;
        const postAuthorEmail = post.author.email;
        const isUp = voteType === 'up';

        const upIndex = post.upvotes.indexOf(email);
        const downIndex = post.downvotes.indexOf(email);

        if (isUp) {
            if (upIndex === -1) {
                post.upvotes.push(email);
                if (downIndex !== -1) post.downvotes.splice(downIndex, 1);
                await updateUserPoints(postAuthorEmail, 3); // +3 for receiving upvote
            } else {
                post.upvotes.splice(upIndex, 1);
                await updateUserPoints(postAuthorEmail, -3); // -3 for upvote getting removed
            }
        } else {
            if (downIndex === -1) {
                post.downvotes.push(email);
                if (upIndex !== -1) post.upvotes.splice(upIndex, 1);
                await updateUserPoints(postAuthorEmail, -2); // -2 for downvote
            } else {
                post.downvotes.splice(downIndex, 1);
                await updateUserPoints(postAuthorEmail, 2); // +2 for removing downvote
            }
        }

        await post.save();
        res.json({
            upvotes: post.upvotes.length,
            downvotes: post.downvotes.length,
            userVote: {
                up: post.upvotes.includes(email),
                down: post.downvotes.includes(email)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Add new route for voting on comments
router.post('/:communityName/post/:postId/comment/:commentId/vote', async (req, res) => {
    const { communityName, postId, commentId } = req.params;
    const { voteType } = req.body;
    const user = req.session.user;

    if (!user) {
        return res.status(401).json({ success: false, error: 'Login required' });
    }

    try {
        const Post = safeGetCommunityModel(communityName);
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, error: 'Post not found' });
        }

        const comment = post.comments.id(commentId);
        if (!comment) {
            return res.status(404).json({ success: false, error: 'Comment not found' });
        }

        const email = user.email;
        const commentAuthorEmail = comment.author.email;
        const isUp = voteType === 'up';

        const upIndex = comment.upvotes.indexOf(email);
        const downIndex = comment.downvotes.indexOf(email);

        if (isUp) {
            if (upIndex === -1) {
                comment.upvotes.push(email);
                if (downIndex !== -1) {
                    comment.downvotes.splice(downIndex, 1);
                }
                await updateUserPoints(commentAuthorEmail, 2); // +2 for upvote
            } else {
                comment.upvotes.splice(upIndex, 1);
                await updateUserPoints(commentAuthorEmail, -2); // -2 for removing upvote
            }
        } else {
            if (downIndex === -1) {
                comment.downvotes.push(email);
                if (upIndex !== -1) {
                    comment.upvotes.splice(upIndex, 1);
                }
                await updateUserPoints(commentAuthorEmail, -1); // -1 for downvote
            } else {
                comment.downvotes.splice(downIndex, 1);
                await updateUserPoints(commentAuthorEmail, 1); // +1 for removing downvote
            }
        }

        await post.save();
        res.json({
            upvotes: comment.upvotes.length,
            downvotes: comment.downvotes.length,
            userVote: {
                up: comment.upvotes.includes(email),
                down: comment.downvotes.includes(email)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// User Delete Post
router.post('/:communityName/post/:postId/delete', async (req, res) => {
    const communityName = normalize(req.params.communityName);
    const { postId } = req.params;
    const { reason } = req.body;
    const user = req.session.user;

    if (!user) return res.status(401).json({ success: false, error: 'Login required' });

    try {
        const CommunityPost = safeGetCommunityModel(communityName);
        const post = await CommunityPost.findById(postId);
        const community = await Community.findOne({ name: communityName });

        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
        if (!community) return res.status(404).json({ success: false, error: 'Community not found' });
        
        // Use display name for notification message
        const communityDisplayName = community.displayName || community.name.toUpperCase();

        // Prevent admins from deleting another admin's post
        if (user.role === 'admin' && post.author?.email && ADMIN_EMAILS.includes(post.author.email.toLowerCase())) {
             if (post.author.email.toLowerCase() !== user.email.toLowerCase()) {
                return res.status(403).json({ success: false, error: 'An admin cannot delete another admin\'s post.' });
             }
        }

        if (user.role === 'moderator' && post.author?.email && ADMIN_EMAILS.includes(post.author.email.toLowerCase())) {
            return res.status(403).json({ success: false, error: 'A moderator cannot delete an admin\'s post.' });
        }

        if (user.role === 'moderator' && post.author?.role === 'moderator' && post.author.email.toLowerCase() !== user.email.toLowerCase()) {
            return res.status(403).json({ success: false, error: 'A moderator cannot delete another moderator\'s post.' });
        }

        const isAuthor = post.author?.email === user.email;
        const isMod = user.role === 'moderator' || user.role === 'admin';
        // Use isGeneral to grant implicit membership for admin/mod permission checks
        const isMember = community.isGeneral || community.members.includes(user.email); 

        if (!isAuthor && (!isMod || !isMember)) return res.status(403).json({ success: false, error: 'Not authorized to delete' });

        if (!isAuthor && isMod && (!reason || reason.trim() === '')) {
            return res.status(400).json({ success: false, error: 'Reason is required for moderator/admin' });
        }

        // Also delete associated media from Cloudinary
        if (post.media && post.media.length > 0) {
            for (const mediaUrl of post.media) {
                const publicId = mediaUrl.split('/').slice(-2).join('/').split('.')[0];
                await cloudinary.uploader.destroy(`uploads/posts/${publicId}`);
            }
        }

        post.deleted = {
            status: true,
            reason: isMod ? reason : '',
            deletedBy: user.email,
            deletedAt: new Date()
        };

        await post.save();

        if (isMod && !isAuthor) {
            await Notification.create({
                userEmail: post.author.email,
                message: `Your post "${post.title}" was deleted from c/${communityDisplayName}. Reason: ${reason}`
            });
            await updateUserPoints(post.author.email, -50);
        } else if (isAuthor) {
            await updateUserPoints(user.email, -1);
        }

        res.redirect(`/community/${communityName}`);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to delete post' });
    }
});

router.get('/:communityName/edit/:postId', async (req, res) => {
    const communityName = normalize(req.params.communityName);
    const postId = req.params.postId;
    const user = req.session.user;

    try {
        const CommunityPost = safeGetCommunityModel(communityName);
        const post = await CommunityPost.findById(postId).lean();

        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

        const isAuthor = post.author?.email === user?.email;
        const withinHour = new Date() - new Date(post.createdAt) < 3600000;

        if (!isAuthor || !withinHour) return res.status(403).json({ success: false, error: 'Not allowed to edit' });

        // Fetch joined communities for the dropdown list and general communities for the edit view (even though the community itself won't change)
        const joinedCommunities = await Community.find({
            $or: [
                { members: user.email },
                { isGeneral: true }
            ]
        }).lean();

        // Render the createPost.ejs view with the post data
        res.render('posts/createPost', {
            communityName,
            post,
            title: 'Edit Post',
            joinedCommunities,
            selectedCommunity: communityName
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to load edit page' });
    }
});

// User Edit Post
router.post('/:communityName/edit/:postId', multer().none(), async (req, res) => {
    const communityName = normalize(req.params.communityName);
    const postId = req.params.postId;
    const { title, body } = req.body;
    const user = req.session.user;

    try {
        const CommunityPost = safeGetCommunityModel(communityName);
        const post = await CommunityPost.findById(postId);

        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

        const isAuthor = post.author?.email === user?.email;
        const withinHour = new Date() - new Date(post.createdAt) < 3600000;

        if (!isAuthor || !withinHour) return res.status(403).json({ success: false, error: 'Not allowed to edit' });

        post.title = title;
        post.body = body;
        await post.save();

        res.redirect(`/community/${communityName}/post/${postId}`);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to save edits' });
    }
});

// Get a list of community members for the kick modal
router.get('/:communityName/members', async (req, res) => {
    const communityName = normalize(req.params.communityName);
    const currentUser = req.session.user;

    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const community = await Community.findOne({ name: communityName }).lean();
        if (!community) {
            return res.status(404).json({ error: 'Community not found' });
        }
        
        const isGeneral = community.isGeneral;
        let emailsToProcess = [];

        if (isGeneral) {
            // For General Communities, the source list is ALL user emails (for banning)
            const [students, staff, lecturers] = await Promise.all([
                Student.find({}).select('email').lean(),
                Staff.find({}).select('email').lean(),
                Lecturer.find({}).select('email').lean()
            ]);
            emailsToProcess = [...students, ...staff, ...lecturers].map(u => u.email);
        } else {
            // For regular communities, the source list is explicit members
            emailsToProcess = community.members;
        }

        const isMember = community.isGeneral || community.members.includes(currentUser.email);
        const isAdmin = currentUser.role === 'admin';
        if (!isAdmin && !isMember) {
            return res.status(403).json({ error: 'You must be a member of this community to perform this action.' });
        }

        const bannedEmails = community.bannedMembers?.map(b => b.email) || [];
        const uniqueEmails = Array.from(new Set(emailsToProcess)); 
        
        // Parallel Fetch of User Data for All Emails ---
        const emailsToFetch = uniqueEmails.filter(email => {
            const lowerCaseEmail = email.toLowerCase();
            const isBanned = bannedEmails.includes(email);
            const isSelf = currentUser.email.toLowerCase() === lowerCaseEmail;
            const isAdmin = ADMIN_EMAILS.includes(lowerCaseEmail);
            return !isBanned && !isSelf && !isAdmin;
        });

        const userFetchPromises = emailsToFetch.map(email => 
            Promise.all([
                Student.findOne({ email }).lean(),
                Staff.findOne({ email }).lean(),
                Lecturer.findOne({ email }).lean()
            ]).then(([student, staff, lecturer]) => {
                const user = student || staff || lecturer;
                const userType = student ? 'student' : (staff ? 'staff' : (lecturer ? 'lecturer' : null));
                return user ? determineUserRoleAndColor(user, userType).then(u => ({ ...u, userType })) : null;
            })
        );
        
        const enrichedUsers = (await Promise.all(userFetchPromises)).filter(u => u !== null);
        
        const membersData = [];

        for (const user of enrichedUsers) {
            
            // Moderators cannot see other moderators in the list
            if (currentUser.role === 'moderator' && user.role === 'moderator') {
                 continue;
            }

            membersData.push({
                email: user.email,
                fullName: user.fullName,
                userType: user.userType,
                role: user.role,
                id: user.studentId || user.userId || ''
            });
        }

        res.json({ success: true, members: membersData });
    } catch (err) {
        console.error('[Get Community Members Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Kick multiple members from a community
router.post('/:communityName/kick-multiple', async (req, res) => {
    const { communityName } = req.params;
    const { emails, reason } = req.body;
    const currentUser = req.session.user;

    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const community = await Community.findOne({ name: normalize(communityName) });
        if (!community) {
            return res.status(404).json({ error: 'Community not found' });
        }

        if (community.isGeneral) {
            return res.status(403).json({ error: 'Cannot kick members from a General Community.' });
        }

        const isMember = community.members.includes(currentUser.email);
        const isAdmin = currentUser.role === 'admin';
        if (!isAdmin && !isMember) {
            return res.status(403).json({ error: 'You must be a member of this community to perform this action.' });
        }
        
        const uniqueEmails = Array.from(new Set(emails)); 

        // Parallel Fetch of User Data for All Emails ---
        const userFetchPromises = uniqueEmails.map(email => 
            Promise.all([
                Student.findOne({ email }).lean(),
                Staff.findOne({ email }).lean(),
                Lecturer.findOne({ email }).lean()
            ]).then(([student, staff, lecturer]) => {
                const user = student || staff || lecturer;
                const userType = student ? 'student' : (staff ? 'staff' : (lecturer ? 'lecturer' : null));
                return user ? determineUserRoleAndColor(user, userType).then(u => ({ ...u, userType })) : null;
            })
        );

        const enrichedUsers = (await Promise.all(userFetchPromises)).filter(u => u !== null);
        const userMap = new Map(enrichedUsers.map(u => [u.email, u]));
        
        if (!reason || reason.trim() === '') {
             return res.status(400).json({ error: 'Reason is required to kick a user' });
        }

        const kickedUsers = [];
        const Notification = require('../models/Notification'); // Already required at top of file

        for (const targetEmail of emails) {
            const lowerCaseEmail = targetEmail.toLowerCase();
            const targetUser = userMap.get(targetEmail);
            
            if (!targetUser) continue;

            if (ADMIN_EMAILS.includes(lowerCaseEmail)) {
                 if (currentUser.role === 'admin') {
                    // Fail the whole operation if an admin tries to kick another admin
                    return res.status(403).json({ error: "An admin cannot kick another admin." });
                 }
                continue;
            }

            if (currentUser.email.toLowerCase() === lowerCaseEmail) {
                continue;
            }
            
            // Role check consistency
            const targetRole = targetUser.role;

            if (currentUser.role === 'moderator' && targetRole !== 'regular') {
                continue;
            }

            // Execute kick/write operations (sequential is safer for writes)
            if (community.members.includes(targetEmail)) {
                kickedUsers.push(targetEmail);
                await Community.updateOne(
                    { name: normalize(communityName) },
                    {
                        $pull: { members: targetEmail },
                        $push: {
                            removedMembers: {
                                email: targetEmail,
                                removedBy: currentUser.email,
                                removedAt: new Date(),
                                reason
                            }
                        }
                    }
                );
                await Notification.create({
                    userEmail: targetEmail,
                    message: `You have been kicked from ${communityName}: ${reason}`,
                });
                await updateUserPoints(targetEmail, -100);
            }
        }

        if (kickedUsers.length === 0) {
            return res.status(400).json({ error: 'No members were eligible to be kicked.' });
        }

        res.status(200).json({ success: true, message: `Successfully kicked: ${kickedUsers.length} member(s).` });
    } catch (err) {
        console.error('[Multi Kick Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get a list of users not yet in the community for the add members modal
router.get('/:communityName/non-members', async (req, res) => {
    const communityName = normalize(req.params.communityName);
    const currentUser = req.session.user;

    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const community = await Community.findOne({ name: communityName }).lean();
        if (!community) {
            return res.status(404).json({ error: 'Community not found' });
        }

        // Block get non-members list on General Community
        if (community.isGeneral) {
            return res.status(403).json({ error: 'Management actions are blocked for General Communities.' });
        }
        
        const isMember = community.members.includes(currentUser.email);
        const isAdmin = currentUser.role === 'admin';
        if (!isAdmin && !isMember) {
            return res.status(403).json({ error: 'You must be a member of this community to perform this action.' });
        }

        const memberEmails = community.members;
        const bannedEmails = community.bannedMembers?.map(b => b.email) || [];
        const allUsers = [];

        const students = await Student.find({}).lean();
        const staff = await Staff.find({}).lean();
        const lecturers = await Lecturer.find({}).lean();

        allUsers.push(...students, ...staff, ...lecturers);

        const nonMembersData = [];

        for (const user of allUsers) {
            const lowerCaseEmail = user.email.toLowerCase();
            // Do not list yourself or admins
            if (currentUser.email.toLowerCase() === lowerCaseEmail || ADMIN_EMAILS.includes(lowerCaseEmail)) {
                continue;
            }

            if (memberEmails.includes(user.email) || bannedEmails.includes(user.email)) {
                continue;
            }

            // Corrected logic to check for roleOverride first
            let userRole = 'regular';
            if (user.roleOverride === 'moderator') {
                userRole = 'moderator';
            } else if (user.roleOverride === 'regular') {
                userRole = 'regular';
            } else if (user.studentId) {
                userRole = 'regular';
            } else if (user.staffId || user.lecturerId) {
                userRole = 'moderator';
            }

            if (currentUser.role === 'moderator' && (userRole === 'moderator' || userRole === 'admin')) {
                continue;
            }

            // Assign a single 'id' property based on user type
            const id = user.studentId || user.userId || '';

            nonMembersData.push({
                email: user.email,
                fullName: user.fullName,
                userType: user.studentId ? 'student' : (user.staffId ? 'staff' : 'lecturer'),
                role: userRole,
                id
            });
        }

        res.json({ success: true, nonMembers: nonMembersData });
    } catch (err) {
        console.error('[Get Non-Members Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add multiple members to a community
router.post('/:communityName/add-members', async (req, res) => {
    const { communityName } = req.params;
    const { emails } = req.body;
    const currentUser = req.session.user;

    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const community = await Community.findOne({ name: normalize(communityName) });
        if (!community) {
            return res.status(404).json({ error: 'Community not found' });
        }
        
        if (community.isGeneral) {
            return res.status(403).json({ error: 'Cannot manually add members to a General Community.' });
        }

        const isMember = community.members.includes(currentUser.email);
        const isAdmin = currentUser.role === 'admin';
        if (!isAdmin && !isMember) {
            return res.status(403).json({ error: 'You must be a member of this community to perform this action.' });
        }
        
        const uniqueEmails = Array.from(new Set(emails));

        // Parallel Fetch of User Data for All Emails
        const userFetchPromises = uniqueEmails.map(email => 
            Promise.all([
                Student.findOne({ email }).lean(),
                Staff.findOne({ email }).lean(),
                Lecturer.findOne({ email }).lean()
            ]).then(([student, staff, lecturer]) => {
                const user = student || staff || lecturer;
                const userType = student ? 'student' : (staff ? 'staff' : (lecturer ? 'lecturer' : null));
                return user ? determineUserRoleAndColor(user, userType).then(u => ({ ...u, userType })) : null;
            })
        );
        
        const enrichedUsers = (await Promise.all(userFetchPromises)).filter(u => u !== null);
        const userMap = new Map(enrichedUsers.map(u => [u.email, u]));

        const emailsToAdd = [];
        for (const targetEmail of emails) {
            const lowerCaseEmail = targetEmail.toLowerCase();
            const targetUser = userMap.get(targetEmail);
            
            if (!targetUser) continue;

            if (ADMIN_EMAILS.includes(lowerCaseEmail)) {
                 if (currentUser.role === 'admin') {
                    return res.status(403).json({ error: "An admin cannot add another admin to a community." });
                }
                continue;
            }

            if (currentUser.email.toLowerCase() === lowerCaseEmail) {
                continue;
            }

            // Role check consistency
            const targetRole = targetUser.role;

            if (currentUser.role === 'moderator' && targetRole !== 'regular') {
                continue;
            }
            
            emailsToAdd.push(targetEmail);
        }

        if (emailsToAdd.length === 0) {
            return res.status(400).json({ error: 'No members were eligible to be added.' });
        }

        await Community.updateOne(
            { name: normalize(communityName) },
            { $addToSet: { members: { $each: emailsToAdd } } }
        );

        res.status(200).json({ success: true, message: `Successfully added ${emailsToAdd.length} member(s).` });
    } catch (err) {
        console.error('Add members error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Ban route
router.post('/:communityName/ban', async (req, res) => {
    try {
        const { communityName } = req.params;
        const { emails: emailsToBan, reason } = req.body;
        const currentUser = req.session.user;

        if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const community = await Community.findOne({ name: normalize(communityName) });
        if (!community) {
            return res.status(404).json({ error: 'Community not found' });
        }

        // Use isGeneral to grant implicit membership for admin/mod permission checks
        const isMember = community.isGeneral || community.members.includes(currentUser.email); 
        const isAdmin = currentUser.role === 'admin';
        if (!isAdmin && !isMember) {
            return res.status(403).json({ error: 'You must be a member of this community to perform this action.' });
        }

        if (!emailsToBan || !Array.isArray(emailsToBan) || emailsToBan.length === 0 || !reason || reason.trim() === '') {
            return res.status(400).json({ error: 'Target emails and a reason are required.' });
        }

        const bannedUsers = [];
        const Notification = require('../models/Notification');

        for (const targetEmail of emailsToBan) {
            const lowerCaseEmail = targetEmail.toLowerCase();
             // Skip if the target user is an admin
            if (ADMIN_EMAILS.includes(lowerCaseEmail)) {
                if (currentUser.role === 'admin') {
                    return res.status(403).json({ error: "An admin cannot ban another admin." });
                }
                continue;
            }

            let targetUser = (await Student.findOne({ email: targetEmail }).lean()) ||
                (await Staff.findOne({ email: targetEmail }).lean()) ||
                (await Lecturer.findOne({ email: targetEmail }).lean());

            let targetRole = 'regular';
            if (targetUser) {
                // Check for roleOverride first
                if (ADMIN_EMAILS.includes(lowerCaseEmail)) {
                    targetRole = 'admin';
                } else if (targetUser.roleOverride === 'moderator') {
                    targetRole = 'moderator';
                } else if (targetUser.roleOverride === 'regular') {
                    targetRole = 'regular';
                } else if (targetUser.staffId || targetUser.lecturerId) {
                    targetRole = 'moderator';
                }
            }

            if (currentUser.role === 'moderator' && targetRole !== 'regular') {
                continue;
            }

            if (currentUser.email.toLowerCase() === lowerCaseEmail) {
                continue;
            }

            const isAlreadyBanned = community.bannedMembers?.some(b => b.email === targetEmail);
            if (!isAlreadyBanned) {
                bannedUsers.push(targetEmail);
                
                // Remove from members list ONLY if it's a regular community
                if (!community.isGeneral) {
                    community.members = community.members.filter(member => member !== targetEmail);
                }

                community.bannedMembers.push({
                    email: targetEmail,
                    bannedBy: currentUser.email,
                    bannedAt: new Date(),
                    reason
                });

                await Notification.create({
                    userEmail: targetEmail,
                    message: `You have been banned from ${communityName}. Reason: ${reason}`,
                });
                await updateUserPoints(targetEmail, -250); // point getting banned
            }
        }

        if (bannedUsers.length > 0) {
            await community.save();
        }

        if (bannedUsers.length === 0) {
            return res.status(400).json({ error: 'No members were eligible to be banned.' });
        }

        res.status(200).json({ success: true, message: `Successfully banned: ${bannedUsers.length} member(s).` });
    } catch (err) {
        console.error('[Ban Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Unban route
router.post('/:communityName/unban', async (req, res) => {
    try {
        const { communityName } = req.params;
        const { emails: emailsToUnban } = req.body;
        const currentUser = req.session.user;

        if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const community = await Community.findOne({ name: normalize(communityName) });
        if (!community) {
            return res.status(404).json({ error: 'Community not found' });
        }

        // Use isGeneral to grant implicit membership for admin/mod permission checks
        const isMember = community.isGeneral || community.members.includes(currentUser.email); 
        const isAdmin = currentUser.role === 'admin';
        if (!isAdmin && !isMember) {
            return res.status(403).json({ error: 'You must be a member of this community to perform this action.' });
        }

        if (!emailsToUnban || !Array.isArray(emailsToUnban) || emailsToUnban.length === 0) {
            return res.status(400).json({ error: 'No emails provided to unban.' });
        }

        const unbannedUsers = [];
        for (const targetEmail of emailsToUnban) {
            const lowerCaseEmail = targetEmail.toLowerCase();
            // Skip if the target user is an admin
            if (ADMIN_EMAILS.includes(lowerCaseEmail)) {
                 if (currentUser.role === 'admin') {
                    return res.status(403).json({ error: "An admin cannot unban another admin." });
                 }
                continue;
            }

            const isBanned = community.bannedMembers.some(b => b.email === targetEmail);
            if (isBanned) {
                unbannedUsers.push(targetEmail);
            }
        }

        if (unbannedUsers.length > 0) {
            await Community.updateOne(
                { name: normalize(communityName) },
                { $pull: { bannedMembers: { email: { $in: unbannedUsers } } } }
            );
        }

        if (unbannedUsers.length === 0) {
            return res.status(400).json({ error: 'No users were eligible to be unbanned.' });
        }

        res.status(200).json({ success: true, message: `Successfully unbanned: ${unbannedUsers.length} user(s).` });

    } catch (err) {
        console.error('[Unban Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get a list of banned members for the unban modal
router.get('/:communityName/banned-members', async (req, res) => {
    const communityName = normalize(req.params.communityName);
    const currentUser = req.session.user;

    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const community = await Community.findOne({ name: communityName }).lean();
        if (!community) {
            return res.status(404).json({ error: 'Community not found' });
        }

        const isAdmin = currentUser.role === 'admin';
        const isModerator = currentUser.role === 'moderator';
        const isMember = community.isGeneral || community.members.includes(currentUser.email); 

        if (!isAdmin && (!isModerator || !isMember)) {
            return res.status(403).json({ error: 'You do not have permission to perform this action.' });
        }

        const emailsToFetch = community.bannedMembers.map(b => b.email).filter(email => {
            // Exclude admins from the list to fetch
            return !ADMIN_EMAILS.includes(email.toLowerCase());
        });
        
        // Parallel Fetch of User Data for All Banned Emails
        const userFetchPromises = emailsToFetch.map(email => 
            Promise.all([
                Student.findOne({ email }).lean(),
                Staff.findOne({ email }).lean(),
                Lecturer.findOne({ email }).lean()
            ]).then(([student, staff, lecturer]) => {
                const user = student || staff || lecturer;
                const userType = student ? 'student' : (staff ? 'staff' : (lecturer ? 'lecturer' : null));
                return user ? { ...user, userType } : null; 
            })
        );
        
        const rawUsers = (await Promise.all(userFetchPromises)).filter(u => u !== null);
        const userMap = new Map(rawUsers.map(u => [u.email, u]));
        
        const bannedMembersData = [];
        for (const b of community.bannedMembers) {
             const lowerCaseEmail = b.email.toLowerCase();
             
             if (ADMIN_EMAILS.includes(lowerCaseEmail)) {
                continue;
            }
            
            const user = userMap.get(b.email);
            
            const fullName = user?.fullName || '[User Not Found]';
            const userType = user?.userType || 'N/A';
            const id = user?.studentId || user?.userId || 'N/A';

            bannedMembersData.push({
                email: b.email,
                fullName,
                userType,
                id,
                reason: b.reason,
                bannedBy: b.bannedBy,
                bannedAt: b.bannedAt
            });
        }

        res.json({ success: true, bannedMembers: bannedMembersData });
    } catch (err) {
        console.error('[Get Banned Members Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// User Delete Comment
router.post('/:communityName/post/:postId/comment/:commentId/delete', async (req, res) => {
    const { communityName, postId, commentId } = req.params;
    const { reason } = req.body;
    const user = req.session.user;

    if (!user) return res.status(401).json({ success: false, error: 'Login required' });

    try {
        const CommunityPost = safeGetCommunityModel(communityName);
        const post = await CommunityPost.findById(postId);
        const community = await Community.findOne({ name: communityName });

        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
        if (!community) return res.status(404).json({ success: false, error: 'Community not found' });

        const comment = post.comments.id(commentId);
        if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

        const isAuthor = comment.author?.email === user.email;
        const isMod = user.role === 'moderator' || user.role === 'admin';
        // Use isGeneral to grant implicit membership for admin/mod permission checks
        const isMember = community.isGeneral || community.members.includes(user.email); 
        
        // Use display name for notification message
        const communityDisplayName = community.displayName || community.name.toUpperCase();

        if (!isAuthor && (!isMod || !isMember)) {
            return res.status(403).json({ success: false, error: 'Not authorized to delete comment' });
        }

        if (isMod && !isAuthor && (!reason || reason.trim() === '')) {
            return res.status(400).json({ success: false, error: 'Reason is required for moderator/admin' });
        }
         const commentAuthorEmail = comment.author?.email.toLowerCase();
         if (ADMIN_EMAILS.includes(commentAuthorEmail) && user.role === 'admin' && user.email.toLowerCase() !== commentAuthorEmail) {
            return res.status(403).json({ success: false, error: 'An admin cannot delete another admin\'s comment.' });
        }

        if (user.role === 'moderator' && ADMIN_EMAILS.includes(commentAuthorEmail)) {
            return res.status(403).json({ success: false, error: 'A moderator cannot delete an admin\'s comment.' });
        }

        if (user.role === 'moderator' && comment.author?.role === 'moderator' && comment.author.email.toLowerCase() !== user.email.toLowerCase()) {
            return res.status(403).json({ success: false, error: 'A moderator cannot delete another moderator\'s comment.' });
        }

        // If the comment has media, delete it from Cloudinary
        if (comment.media) {
            const publicId = comment.media.split('/').slice(-2).join('/').split('.')[0];
            await cloudinary.uploader.destroy(`uploads/comments/${publicId}`);
        }

        comment.deleted = {
            status: true,
            reason: isMod ? reason : 'Deleted by author',
            deletedBy: user.email,
            deletedAt: new Date()
        };

        await post.save();

        if (isMod && !isAuthor) {
            await Notification.create({
                userEmail: comment.author.email,
                message: `A comment you made in c/${communityDisplayName} was deleted: "${comment.content.substring(0, 50)}...". Reason: ${reason}`
            });
            await updateUserPoints(comment.author.email, -50); // point deleted comment by mod
        } else if (isAuthor) {
            await updateUserPoints(user.email, -1); // point deleted own comment
        }

        res.redirect(`/community/${communityName}/post/${postId}`);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to delete comment' });
    }
});

// Delete Community
router.post('/:communityName/delete', async (req, res) => {
    const communityName = normalize(req.params.communityName);
    const user = req.session.user;

    if (!user) return res.status(401).json({ success: false, error: 'Login required.' });

    try {
        const community = await Community.findOne({ name: communityName }).lean();
        if (!community) {
            return res.status(404).json({ success: false, error: 'Community not found.' });
        }
        
        // Use display name for notification message
        const communityDisplayName = community.displayName || community.name.toUpperCase();

        // Use isGeneral to grant implicit membership for admin/mod permission checks
        const isMember = community.isGeneral || community.members.includes(user.email); 
        const isAdmin = user.role === 'admin';
        const isModerator = user.role === 'moderator';

        const canDelete = isAdmin || (isModerator && isMember);
        if (!canDelete) {
            return res.status(403).json({ success: false, error: 'You do not have permission to delete this community.' });
        }

        await Community.deleteOne({ name: communityName });

        const mongoose = require('mongoose');
        const db = mongoose.connection.db;
        const collectionName = `community_${communityName.toLowerCase()}`;
        await db.dropCollection(collectionName).catch(err => {
            if (err.codeName !== 'NamespaceNotFound') {
                console.error(`Error dropping collection ${collectionName}:`, err);
            }
        });

        // Also delete all media associated with the community from Cloudinary
        if (community.icon?.filename) {
             const publicId = community.icon.filename.split('/').slice(-2).join('/').split('.')[0];
             await cloudinary.uploader.destroy(`uploads/communities/${publicId}`);
        }
        
        const allEmails = community.members;
        const notifications = allEmails.map(email => ({
            userEmail: email,
            message: `The community c/${communityDisplayName} was deleted by ${user.fullName}.`
        }));

        await Notification.insertMany(notifications);
        
        // Invalidate sidebar cache so the community disappears immediately
        if (COMMUNITY_CACHE) {
            COMMUNITY_CACHE.data = null;
        }

        res.redirect('/');
    } catch (err) {
        console.error('[Community Delete Error]', err);
        res.status(500).json({ success: false, error: 'An error occurred while deleting the community.' });
    }
});

// Post edit comment
router.post('/:communityName/post/:postId/comment/:commentId/edit', multer().none(), async (req, res) => {
    const communityName = normalize(req.params.communityName);
    const postId = req.params.postId;
    const commentId = req.params.commentId;
    const { content } = req.body;
    const user = req.session.user;

    if (!user) return res.status(401).json({ success: false, error: 'Login required' });

    try {
        const CommunityPost = safeGetCommunityModel(communityName);
        const post = await CommunityPost.findById(postId);
        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

        const comment = post.comments.id(commentId);
        if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

        const isAuthor = comment.author?.email === user?.email;
        const withinHour = new Date() - new Date(comment.createdAt) < 3600000;

        if (!isAuthor || !withinHour) {
            return res.status(403).json({ success: false, error: 'Not authorized to edit this comment.' });
        }

        comment.content = content;
        await post.save();

        res.status(200).json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to save comment edits' });
    }
});

// Handle poll votes (with unvote/change vote logic)
router.post('/:communityName/poll/:postId/vote', async (req, res) => {
    const { communityName, postId } = req.params;
    const { optionIndex } = req.body;
    const user = req.session.user;

    if (!user) return res.status(401).json({ success: false, error: 'Login required' });

    try {
        const Post = safeGetCommunityModel(communityName);
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

        let existingVoteIndex = -1;
        let existingOptionIndex = -1;
        let isUnvote = false;

        // Find and remove any existing vote from the user
        post.poll.options.forEach((option, index) => {
            const votePosition = option.votes.indexOf(user.email);
            if (votePosition > -1) {
                existingVoteIndex = votePosition;
                existingOptionIndex = index;
            }
        });

        if (existingOptionIndex > -1) {
            post.poll.options[existingOptionIndex].votes.splice(existingVoteIndex, 1);
            if (existingOptionIndex === Number(optionIndex)) {
                isUnvote = true; // The user is unvoting the same option
            }
        }

        // Add a new vote if it's not an unvote
        if (!isUnvote) {
            post.poll.options[optionIndex].votes.push(user.email);
        }

        await post.save();

        const updatedPoll = post.poll.options.map(option => ({
            text: option.text,
            votes: option.votes.length,
            userHasVoted: option.votes.includes(user.email)
        }));

        return res.status(200).json({ success: true, poll: updatedPoll, userEmail: user.email });
    } catch (err) {
        console.error('Poll vote error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

router.post('/:communityName/settings/restrict-posting', async (req, res) => {
    const communityName = normalize(req.params.communityName);
    const { isRestrictedPosting } = req.body; // boolean from JS
    const user = req.session.user;

    if (!user) return res.status(401).json({ success: false, error: 'Login required.' });

    try {
        const community = await Community.findOne({ name: communityName });
        if (!community) return res.status(404).json({ success: false, error: 'Community not found.' });

        const isModeratorOrAdmin = ['admin', 'moderator'].includes(user.role);
        // Check if user is a member or if it's a general community
        const isMember = community.isGeneral || community.members.includes(user.email); 
        
        if (user.role !== 'admin' && (!isModeratorOrAdmin || !isMember)) {
            return res.status(403).json({ success: false, error: 'You must be a moderator or admin of this community to change posting rules.' });
        }

        // Convert string/boolean input to boolean
        const newSetting = isRestrictedPosting === 'true' || isRestrictedPosting === true;

        await Community.updateOne(
            { name: communityName },
            { $set: { isRestrictedPosting: newSetting } }
        );

        res.status(200).json({ success: true, message: 'Posting restriction updated successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to update posting restriction.' });
    }
});

module.exports = router;
module.exports.enrichAuthorInfo = enrichAuthorInfo;