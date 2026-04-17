const mongoose = require('mongoose');
const getCommunityModel = require('../models/communityPostModel');

/**
 * Compute karma for a user by email across all community collections.
 * Karma is calculated as (total received upvotes - total received downvotes) on the user's posts and comments.
 * It also counts the number of posts made by the user.
 */
async function computeUserKarma(email) {
    // Return default values if no email is provided
    if (!email) {
        return { karma: 0, up: 0, down: 0, posts: 0 };
    }

    // Get all collections that start with "community_"
    const allCollections = await mongoose.connection.db.listCollections().toArray();
    const communityCollectionNames = allCollections
        .map(c => c.name)
        .filter(n => /^community_/.test(n));

    // Collect ALL aggregation promises into a single array and run them concurrently
    const aggregationPromises = communityCollectionNames.flatMap((collectionName) => {
        const communityName = collectionName.replace(/^community_/, '');
        const Post = getCommunityModel(communityName);

        // Promise to aggregate post karma (returns array of {up, down, count})
        const postKarmaPromise = Post.aggregate([
            { $match: { 'author.email': email, 'deleted.status': { $ne: true } } },
            {
                $project: {
                    up: { $size: { $ifNull: ['$upvotes', []] } },
                    down: { $size: { $ifNull: ['$downvotes', []] } },
                    count: 1 // Add a count field for post count
                }
            }
        ]);

        // Promise to aggregate comment karma (returns array with single element: [{up, down}])
        const commentKarmaPromise = Post.aggregate([
            { $match: { 'comments.author.email': email, 'comments.deleted.status': { $ne: true } } },
            { $unwind: '$comments' },
            { $match: { 'comments.author.email': email, 'comments.deleted.status': { $ne: true } } },
            {
                $group: {
                    _id: null,
                    up: { $sum: { $size: { $ifNull: ['$comments.upvotes', []] } } },
                    down: { $sum: { $size: { $ifNull: ['$comments.downvotes', []] } } }
                }
            }
        ]);
        
        return [postKarmaPromise, commentKarmaPromise];
    });

    // Execute all aggregation queries concurrently
    const results = await Promise.all(aggregationPromises);
    
    let totalUpvotes = 0;
    let totalDownvotes = 0;
    let totalPosts = 0;
    
    // Process the flat array of results
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        
        // Every even index is a postKarma result (array of posts)
        if (i % 2 === 0) {
            for (const post of result) {
                totalUpvotes += post.up || 0;
                totalDownvotes += post.down || 0;
                totalPosts += 1;
            }
        } 
        // Every odd index is a commentKarma result (array with a single element or empty)
        else {
            if (result.length > 0) {
                totalUpvotes += result[0].up || 0;
                totalDownvotes += result[0].down || 0;
            }
        }
    }

    const karmaScore = totalUpvotes - totalDownvotes;

    return { karma: karmaScore, up: totalUpvotes, down: totalDownvotes, posts: totalPosts };
}

module.exports = { computeUserKarma };