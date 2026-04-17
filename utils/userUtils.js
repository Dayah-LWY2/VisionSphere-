const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Lecturer = require('../models/Lecturer');

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

async function determineUserRoleAndColor(user, userType) {
    if (!user) {
        return {
            role: 'regular'
        };
    }

    let role = 'regular';
    const email = user.email.toLowerCase();

    if (ADMIN_EMAILS.includes(email)) {
        role = 'admin';
    } else if (user.roleOverride === 'moderator') {
        role = 'moderator';
    } else if (user.roleOverride === 'regular') {
        role = 'regular';
    } else if (userType === 'staff' || userType === 'lecturer') {
        role = 'moderator';
    }

    user.role = role;
    return user;
}

// Optional userMap parameter for batch optimization (used by communityRoutes)
async function enrichAuthorInfo(author, userMap) { 
    if (!author || !author.email) return author;

    // Fast path: Look up in the provided map first (used in batch processing)
    const cachedUser = userMap?.get(author.email);

    let user;
    let userType;

    if (cachedUser) {
        user = cachedUser;
        userType = cachedUser.userType; // userType is pre-calculated in fetchUsersByEmails
    } else {
        // Fallback: Original logic (used when map is not provided)
        const USER_PROJECTION = 'fullName email avatar roleOverride studentId userId theme points level'; 

        const [student, staff, lecturer] = await Promise.all([
            Student.findOne({ email: author.email }).select(USER_PROJECTION).lean(),
            Staff.findOne({ email: author.email }).select(USER_PROJECTION).lean(),
            Lecturer.findOne({ email: author.email }).select(USER_PROJECTION).lean()
        ]);
        
        user = student || staff || lecturer;
        userType = student ? 'student' : (staff ? 'staff' : (lecturer ? 'lecturer' : null));

        if (user) {
             user = await determineUserRoleAndColor(user, userType);
        }
    }


    if (user) {
        // Use the fetched/cached user data to populate the author object
        author.id = user._id;
        author.fullName = user.fullName;
        author.email = user.email;
        author.avatar = user.avatar || null;
        author.role = user.role;
        author.nameColorClass = user.nameColorClass;
        author.studentId = user.studentId || user.userId || '';
        author.userType = userType;
    } else {
        // If the user no longer exists, update the author data to reflect that
        author.fullName = '[Deleted User]';
        author.avatar = null;
        author.role = 'regular';
        author.nameColorClass = 'color-regular';
        author.studentId = '';
        author.userType = '';
    }

    return author;
}

// Implements the bulk fetching logic required by communityRoutes.js
async function fetchUsersByEmails(emails) {
    if (!emails || emails.length === 0) return new Map();

    const USER_PROJECTION = 'fullName email avatar roleOverride studentId userId theme points level';
    const query = { email: { $in: emails } };
    
    // 1. Fetch raw data in parallel
    const [rawStudents, rawStaff, rawLecturers] = await Promise.all([
        Student.find(query).select(USER_PROJECTION).lean(),
        Staff.find(query).select(USER_PROJECTION).lean(),
        Lecturer.find(query).select(USER_PROJECTION).lean()
    ]);
    
    const userMap = new Map();

    // 2. Combine and map raw data, including the user type
    const allUsersWithTypes = [
        ...rawStudents.map(u => ({ ...u, userType: 'student' })),
        ...rawStaff.map(u => ({ ...u, userType: 'staff' })),
        ...rawLecturers.map(u => ({ ...u, userType: 'lecturer' }))
    ];

    // 3. Parallelize role enrichment
    const enrichmentPromises = allUsersWithTypes.map(user => 
        determineUserRoleAndColor(user, user.userType)
            .then(enriched => {
                // Retain userType for later use in post/comment rendering
                enriched.userType = user.userType;
                // Ensure _id is a string if it exists for consistency
                if (enriched._id) enriched._id = enriched._id.toString();
                return enriched;
            })
    );
    
    const enrichedUsers = await Promise.all(enrichmentPromises);

    // 4. Create the final map
    enrichedUsers.forEach(user => {
        userMap.set(user.email, user);
    });

    return userMap;
}


module.exports = {
    determineUserRoleAndColor,
    enrichAuthorInfo,
    ADMIN_EMAILS,
    fetchUsersByEmails
};