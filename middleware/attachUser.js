const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Lecturer = require('../models/Lecturer');
const { determineUserRoleAndColor } = require('../utils/userUtils');

// Global User Cache
const USER_CACHE = {}; // Key: email, Value: { data: userObject, expires: timestamp }
const USER_CACHE_TTL = 300000; // 5 minutes (300,000ms)

// Utility to safely retrieve user from DB and update cache
async function fetchAndCacheUser(email) {
    // 1. Check cache first
    const cachedEntry = USER_CACHE[email];
    if (cachedEntry && Date.now() < cachedEntry.expires) {
        return cachedEntry.data;
    }
    
    // Define projection to avoid fetching the large password hash
    const USER_PROJECTION = '-password'; 

    // 2. Fetch from DB if cache expired or miss (Optimized with projection)
    const [student, staff, lecturer] = await Promise.all([
        Student.findOne({ email }).select(USER_PROJECTION).lean(),
        Staff.findOne({ email }).select(USER_PROJECTION).lean(),
        Lecturer.findOne({ email }).select(USER_PROJECTION).lean()
    ]);
    
    let user = student || staff || lecturer;
    let userType = student ? 'student' : (staff ? 'staff' : (lecturer ? 'lecturer' : null));

    if (user) {
        const enrichedUser = await determineUserRoleAndColor(user, userType);
        const enriched = {
            ...enrichedUser,
            _id: enrichedUser._id?.toString?.(),
            userType,
            theme: enrichedUser.theme || 'default'
        };

        // 3. Update cache
        USER_CACHE[email] = {
            data: enriched,
            expires: Date.now() + USER_CACHE_TTL
        };
        return enriched;
    }

    // 4. Handle user not found (cleanup cache)
    delete USER_CACHE[email];
    return null; 
}

module.exports = async function attachUser(req, res, next) {
	try {
		const sessionUser = req.session?.user;
		res.locals.user = null;
		res.locals.themeClass = '';

		if (!sessionUser?.email) {
			return next();
		}

		const email = sessionUser.email.toLowerCase();
		
        // Fetch from cache or DB/cache and then cache
        const enriched = await fetchAndCacheUser(email);

		if (!enriched) {
			// If user is not found, reset session.
			const snapshot = {
				_id: sessionUser._id,
				email: sessionUser.email,
				fullName: sessionUser.fullName || '',
				avatar: sessionUser.avatar || null,
				userType: null,
				role: 'regular',
				nameColorClass: 'color-regular',
				theme: 'default'
			};
			req.session.user = snapshot;
			res.locals.user = snapshot;
			return next();
		}

		req.session.user = enriched; // Update session with fresh/cached data
		res.locals.user = enriched;
		res.locals.themeClass = enriched.theme === 'dark' ? 'dark-mode' : '';

		next();
	} catch (err) {
		console.error('[attachUser] error:', err);
		next();
	}
};