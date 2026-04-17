const express = require('express');
const router = express.Router();
const Community = require('../models/Community');
const getCommunityModel = require('../models/communityPostModel');
const { enrichAuthorInfo } = require('./communityRoutes');

// Helper to handle post enrichment in parallel
async function enrichPostData(post, communityMap) {
    post.communityDisplayName = communityMap.get(post.community);
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

router.get('/', async (req, res) => {
    let allPosts = [];
    const user = res.locals.user;
    const filter = req.query.filter || 'random'; // Default to 'random'

    try {
        if (user) {
            const allCommunities = await Community.find().lean();
            const bannedCommunityNames = allCommunities
                .filter(c => c.bannedMembers.some(b => b.email === user.email))
                .map(c => c.name);
                
            const communityMap = new Map(allCommunities.map(c => [c.name, c.displayName || c.name.toUpperCase()]));

            const nonBannedCommunities = allCommunities
                .filter(c => !bannedCommunityNames.includes(c.name));
            
            const generalCommunityNames = nonBannedCommunities
                .filter(c => c.isGeneral)
                .map(c => c.name);

            const regularCommunities = nonBannedCommunities
                .filter(c => !c.isGeneral);

            const joinedCommunityNames = regularCommunities
                .filter(c => c.members.includes(user.email))
                .map(c => c.name);
            const otherCommunityNames = regularCommunities
                .filter(c => !c.members.includes(user.email))
                .map(c => c.name);

            const communitiesToFetch = [...joinedCommunityNames, ...generalCommunityNames];
            
            // 1. Parallelize fetching posts from all relevant communities
            const postFetchPromises = communitiesToFetch.map(name => {
                const Post = getCommunityModel(name);
                return Promise.all([
                    Post.find({ 'deleted.status': { $ne: true } }).sort({ createdAt: -1 }).limit(10).lean().then(posts => posts.map(p => ({ ...p, community: name }))), // Limit to top 10 recent
                    Post.find({ 'deleted.status': { $ne: true } }).sort({ upvotes: -1 }).limit(10).lean().then(posts => posts.map(p => ({ ...p, community: name }))) // Limit to top 10 popular
                ]).then(([recent, popular]) => [...recent, ...popular]);
            });

            // Add one popular post from non-joined communities
            const otherPostPromises = otherCommunityNames
                .filter(() => Math.random() < 0.2)
                .map(name => {
                    const Post = getCommunityModel(name);
                    return Post.findOne({ 'deleted.status': { $ne: true } })
                        .sort({ upvotes: -1 })
                        .lean()
                        .then(post => post ? { ...post, community: name } : null);
                });

            const results = await Promise.all([...postFetchPromises, ...otherPostPromises]);
            allPosts = results.flat().filter(p => p !== null);

            // 2. Remove duplicates
            const uniquePosts = Array.from(new Set(allPosts.map(p => p._id.toString())))
                .map(id => allPosts.find(p => p._id.toString() === id));

            // 3. Parallelize data enrichment for all unique posts (major speedup)
            const enrichedPosts = await Promise.all(uniquePosts.map(post => enrichPostData(post, communityMap)));

            // 4. Sort the final list of unique posts based on the filter
            if (filter === 'latest') {
                enrichedPosts.sort((a, b) => b.createdAt - a.createdAt);
            } else if (filter === 'popular') {
                enrichedPosts.sort((a, b) => (b.upvotes.length - b.downvotes.length) - (a.upvotes.length - a.downvotes.length));
            } else if (filter === 'unanswered') {
                enrichedPosts.sort((a, b) => {
                    const aUnanswered = a.comments.length === 0;
                    const bUnanswered = b.comments.length === 0;
                    if (aUnanswered && !bUnanswered) return -1;
                    if (!aUnanswered && bUnanswered) return 1;
                    return 0;
                });
            } else {
                // Default to random if no filter is specified
                enrichedPosts.sort(() => 0.5 - Math.random());
            }

            allPosts = enrichedPosts;
        }
    } catch (err) {
        console.error('Error fetching homepage posts:', err);
        return res.render('index', {
            loginRequired: req.query.loginRequired || false,
            title: 'Home',
            posts: [], 
            filter,
        });
    }

    const joinedCommunities = user ? await Community.find({ $or: [{ members: user.email }, { isGeneral: true }] }).lean() : [];
    
    res.render('index', {
        loginRequired: req.query.loginRequired || false,
        title: 'Home',
        posts: allPosts,
        filter,
    });
});

module.exports = router;