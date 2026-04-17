const express = require('express');
const router = express.Router();
const Community = require('../models/Community');
const getCommunityModel = require('../models/communityPostModel');
const { updateUserPoints } = require('../utils/points');
const { post } = require('../middleware/upload'); // Corrected import
const { v2: cloudinary } = require('cloudinary');

router.get('/create', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/?loginRequired=true');
    }

    const userRole = req.session.user.role;
    const email = req.session.user.email;
    
    const baseQuery = {
        $or: [
            { members: email }, // Explicitly joined communities
            { isGeneral: true } // General Communities
        ]
    };
    
    // If the user is 'regular', filter out communities where posting is restricted.
    if (userRole === 'regular') {
        baseQuery.isRestrictedPosting = { $ne: true };
    }
    
    const joinedCommunities = await Community.find(baseQuery).lean();

    const selectedCommunity = req.query.community || '';

    // Server-side check for users who manually navigate to a restricted community
    if (selectedCommunity) {
        const community = await Community.findOne({ name: selectedCommunity }).lean();
        if (community?.isRestrictedPosting && userRole === 'regular') {
            // Redirect regular users away from the restricted post creation page
            return res.redirect(`/community/${selectedCommunity}`);
        }
    }

    res.render('posts/createPost', {
        title: 'Create Post',
        joinedCommunities,
        selectedCommunity,
        post: null // Pass null to indicate it's a new post
    });
});

// POST: Handle Create Post
router.post('/create', post.array('media', 5), async (req, res) => {
    const { community, title, body, pollQuestion, pollOptions } = req.body;
    const files = req.files || [];

    // Normalize and validate the community name before proceeding
    const normalizedCommunity = (community || '').trim().toLowerCase();

    // This is the new validation to prevent the issues
    if (!normalizedCommunity || !title || !body) {
        for (const f of files) {
            // This is the general cleanup for invalid form data
            cloudinary.uploader.destroy(f.filename.split('/').slice(-2).join('/').split('.')[0]);
        }
        return res.status(400).json({ success: false, error: "Community, title, and body are required." });
    }

    try {
        const comm = await Community.findOne({ name: normalizedCommunity });
        if (!comm) {
            return res.status(404).json({ success: false, error: "Community does not exist." });
        }
        
        // Critical Access Check (Server-side)
        const userRole = req.session.user.role;
        if (comm.isRestrictedPosting && userRole === 'regular') {
            return res.status(403).json({ success: false, error: `Posting is restricted to Moderators and Admins in c/${comm.displayName || comm.name.toUpperCase()}.` });
        }

        const Post = getCommunityModel(normalizedCommunity);
        const mediaUrls = req.files.map(file => file.path);

        const newPoll = (pollQuestion && pollOptions) ? {
            question: pollQuestion,
            options: pollOptions.filter(opt => opt.trim() !== '').map(text => ({ text, votes: [] }))
        } : undefined;

        await Post.create({
            community: normalizedCommunity,
            title,
            body,
            media: mediaUrls,
            author: {
                id: req.session.user._id,
                email: req.session.user.email,
                fullName: req.session.user.fullName,
                avatar: req.session.user.avatar || null,
                studentId: req.session.user.studentId,
                role: req.session.user.role,
                userType: req.session.user.userType
            },
            poll: newPoll
        });

        await updateUserPoints(req.session.user.email, 1);

        res.redirect(`/community/${normalizedCommunity}`);
    } catch (err) {
        console.error(err);
        for (const f of files) {
            // This catches cleanup for server-side errors (e.g. database error)
            cloudinary.uploader.destroy(f.filename.split('/').slice(-2).join('/').split('.')[0]);
        }
        res.status(500).json({ success: false, error: "Failed to create post." });
    }
});

router.get('/:communityName/edit/:postId', async (req, res) => {
    const communityName = normalize(req.params.communityName);
    const postId = req.params.postId;
    const user = req.session.user;

    try {
        const CommunityPost = getCommunityModel(communityName);
        const post = await CommunityPost.findById(postId).lean();

        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

        const isAuthor = post.author?.email === user?.email;
        const withinHour = new Date() - new Date(post.createdAt) < 3600000;

        if (!isAuthor || !withinHour) return res.status(403).json({ success: false, error: 'Not allowed to edit' });

        // Pass the post object and communities to the same view
        const joinedCommunities = await Community.find({ members: user.email }).lean();

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

module.exports = router;