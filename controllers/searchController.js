const Community = require('../models/Community');
const getCommunityModel = require('../models/communityPostModel');
const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Lecturer = require('../models/Lecturer');
const { enrichAuthorInfo, determineUserRoleAndColor } = require('../utils/userUtils');

// Helper to enrich search results with author info and snippets concurrently
async function processSearchResults(posts, communityMap, regex, users) {
    
    // 1. Parallelize User Enrichment
    const userEnrichmentPromises = users.map(async user => {
        const userType = user.studentId ? 'student' : (user.staffId ? 'staff' : 'lecturer');
        await determineUserRoleAndColor(user, userType);
        user.userType = userType;
        return user;
    });
    const enrichedUsers = await Promise.all(userEnrichmentPromises);


    // 2. Prepare posts for parallel enrichment and snippet creation
    const postEnrichmentPromises = posts.map(async post => {
        post.communityDisplayName = communityMap.get(post.community);
        
        // Parallelize author enrichment
        post.author = await enrichAuthorInfo(post.author); 

        // Create body snippet
        if (post.body && regex.test(post.body)) {
            post.searchSnippet = post.body.substring(0, 150) + '...';
        }
        
        // Find matching comment for snippet display
        if (post.comments && post.comments.length > 0) {
            const matchingComment = post.comments.find(comment => regex.test(comment.content));
            if (matchingComment) {
                // Enrich comment author info (synchronous for single comment, tolerable)
                matchingComment.author = await enrichAuthorInfo(matchingComment.author); 
                post.commentSnippet = {
                    author: matchingComment.author.fullName,
                    authorRole: matchingComment.author.role,
                    userType: matchingComment.author.userType,
                    content: matchingComment.content.substring(0, 50) + '...'
                };
            }
        }
        return post;
    });

    const enrichedPosts = await Promise.all(postEnrichmentPromises);
    
    // Remove duplicates one last time after processing
    const uniquePosts = enrichedPosts.filter((item, index, self) =>
        index === self.findIndex(t => t._id.toString() === item._id.toString())
    );
    
    return { enrichedPosts: uniquePosts, enrichedUsers };
}

exports.search = async (req, res) => {
	try {
		const query = req.query.q?.trim();
		const filter = req.query.filter || 'latest'; 

		if (!query) {
			return res.render('search/searchResults', {
				posts: [],
				communities: [],
				users: [],
				query: '',
				filter: 'latest', 
				title: 'Search'
			});
		}

		const regex = new RegExp(query, 'i');

        const USER_PROJECTION = 'fullName email studentId userId avatar roleOverride theme';

		// 1. Parallelize core lookups (Communities, Users)
        const [
            communities,
            students,
            staff,
            lecturers,
            allCommunities
        ] = await Promise.all([
            Community.find({
                $or: [
                    { name: regex },
                    { displayName: regex },
                    { description: regex }
                ]
            }).lean(),
            Student.find({ $or: [{ fullName: regex }, { email: regex }, { studentId: regex }] }).select(USER_PROJECTION).lean(),
            Staff.find({ $or: [{ fullName: regex }, { email: regex }] }).select(USER_PROJECTION).lean(),
            Lecturer.find({ $or: [{ fullName: regex }, { email: regex }] }).select(USER_PROJECTION).lean(),
            Community.find().lean()
        ]);
        
        let users = [...students, ...staff, ...lecturers];
        
        const communityMap = new Map(allCommunities.map(c => [c.name, c.displayName || c.name.toUpperCase()]));
        
        let posts = [];
        
        // 2. Parallelize Post searching across all communities
        const postSearchPromises = allCommunities.map(async c => {
            const CommunityPost = getCommunityModel(c.name.toLowerCase());
            const foundPosts = await CommunityPost.find({
                $or: [
                    { title: regex },
                    { body: regex },
                    { 'comments.content': regex }
                ],
                'deleted.status': { $ne: true }
            }).lean().then(posts => posts.map(p => ({ ...p, community: c.name })));
            return foundPosts;
        });

        const foundPostsResults = await Promise.all(postSearchPromises);
        posts = foundPostsResults.flat();


        // 3. Process and enrich posts and users concurrently (major speedup)
        const { enrichedPosts, enrichedUsers } = await processSearchResults(posts, communityMap, regex, users);
        posts = enrichedPosts;
        users = enrichedUsers;

		// 4. Apply the filter logic to the posts
		if (filter === 'latest') {
			posts.sort((a, b) => b.createdAt - a.createdAt);
		} else if (filter === 'popular') {
			posts.sort((a, b) => (b.upvotes.length - b.downvotes.length) - (a.upvotes.length - a.downvotes.length));
		} else if (filter === 'unanswered') {
			posts.sort((a, b) => {
				const aUnanswered = a.comments?.length === 0;
				const bUnanswered = b.comments?.length === 0;
				if (aUnanswered && !bUnanswered) return -1;
				if (!aUnanswered && bUnanswered) return 1;
				return 0;
			});
		}

		const joinedCommunities = req.session.user ? await Community.find({ members: req.session.user.email }).lean() : [];
		// Enrich joinedCommunities with displayName
		joinedCommunities.forEach(c => {
			c.displayName = communityMap.get(c.name);
		});

		res.render('search/searchResults', {
			posts,
			communities,
			users,
			query,
			filter, 
			title: `Search results for "${query}"`,
			joinedCommunities
		});

	} catch (err) {
		console.error(err);
		res.status(500).json({ success: false, error: "Server error" });
	}
};