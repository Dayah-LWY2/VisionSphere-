const Community = require('../models/Community');
const Notification = require('../models/Notification'); // ADDED

// Simple In-Memory Cache (5 minutes TTL)
const COMMUNITY_CACHE = {
    data: null,
    expires: 0,
    TTL: 300000 // 5 minutes in milliseconds
};

module.exports = async function sidebarData(req, res, next) {
	try {
		const user = req.session.user;

		let generalCommunities = [];
		let joinedCommunities = [];
		let availableCommunities = [];

        // Fetch Communities: Check cache first
        let allCommunities;
        if (COMMUNITY_CACHE.data && Date.now() < COMMUNITY_CACHE.expires) {
            allCommunities = COMMUNITY_CACHE.data;
        } else {
            // Cache expired or empty, fetch from DB
            allCommunities = await Community.find().lean();
            // Store result in cache
            COMMUNITY_CACHE.data = allCommunities;
            COMMUNITY_CACHE.expires = Date.now() + COMMUNITY_CACHE.TTL;
        }

        // Fetch Notification count concurrently
        const fetchPromises = [];
        
        // Add notification count promise if user is logged in
        if (user) {
            fetchPromises.push(Notification.countDocuments({ userEmail: user.email, read: false }));
        } else {
            fetchPromises.push(Promise.resolve(0));
        }

        // Execute notification count concurrently (already fetched communities in parallel if needed)
        const [unreadNotificationCount] = await Promise.all(fetchPromises);
        
        // Data processing starts after all necessary data is fetched concurrently
        let nonGeneralCommunities = allCommunities.filter(c => !c.isGeneral);
        
		if (user) {
            // Split communities based on isGeneral flag
            generalCommunities = allCommunities.filter(c => c.isGeneral);

            // Filter non-general communities into joined and available
            joinedCommunities = nonGeneralCommunities.filter(c => c.members.includes(user.email));
            availableCommunities = nonGeneralCommunities.filter(c => !c.members.includes(user.email));
            
		} else {
			// guest users only see all available communities
            generalCommunities = allCommunities.filter(c => c.isGeneral);
            availableCommunities = nonGeneralCommunities;
		}

        // Alphabetical Sorting by displayName (fallback to name)
        const sorter = (a, b) => {
            const nameA = (a.displayName || a.name).toUpperCase();
            const nameB = (b.displayName || b.name).toUpperCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return 0;
        };

        generalCommunities.sort(sorter); // NEW
        joinedCommunities.sort(sorter);
        availableCommunities.sort(sorter);

		// Make them available globally to all EJS templates
        res.locals.generalCommunities = generalCommunities;
		res.locals.joinedCommunities = joinedCommunities;
		res.locals.availableCommunities = availableCommunities;
		res.locals.unreadNotificationCount = unreadNotificationCount;

		next();
	} catch (err) {
		console.error('Sidebar middleware error:', err);
		next(err);
	}
};
// Export the cache object for manual invalidation in routes
module.exports.COMMUNITY_CACHE = COMMUNITY_CACHE;