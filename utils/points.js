const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Lecturer = require('../models/Lecturer');

// Define point thresholds for each level
const LEVEL_THRESHOLDS = {
    1: 0,
    2: 10,
    3: 25,
    4: 50,
    5: 75,
    6: 100,
    7: 120,
    8: 140,
    9: 160,
    10: 180,
    11: 200,
    12: 240,
    13: 280,
    14: 320,
    15: 360,
    16: 400,
    17: 450,
    18: 500,
    19: 600,
    20: 700,
    21: 800,
    22: 900,
    23: 1000,
    24: 1100,
    25: 1200,
    26: 1300,
    27: 1450,
    28: 1600,
    29: 1800,
    30: 2000,
    31: 2100,
    32: 2300,
    33: 2500,
    34: 2700,
    35: 2900,
    36: 3100,
    37: 3300,
    38: 3600,
    39: 3900,
    40: 4000,
    41: 4200,
    42: 4600,
    43: 5000,
    44: 5500,
    45: 6000,
    46: 6500,
    47: 7000,
    48: 7600,
    49: 8200,
    50: 9000
};

// +3 got upvote, +2 upvoted comment, +1 comment, +2 received reaction, +1 post
// -2 post get downvoted, -1 comment get downvoted, -100 removed from community, -50 post got deleted, -250 getting banned
// Points will reset if user's action is reset

async function updateUserPoints(email, pointsToAdd) {
    if (!email) return;

    const [student, staff, lecturer] = await Promise.all([
        Student.findOne({ email }),
        Staff.findOne({ email }),
        Lecturer.findOne({ email })
    ]);
    
    let user = student || staff || lecturer;

    if (user) {
        user.points += pointsToAdd;
        user.points = Math.max(0, user.points); // Ensure points don't go below zero

        // Calculate new level based on points
        let newLevel = 0;
        for (const [level, threshold] of Object.entries(LEVEL_THRESHOLDS)) {
            if (user.points >= threshold) {
                newLevel = parseInt(level, 10);
            }
        }
        user.level = newLevel;

        await user.save();
    }
}

function getLevelThresholds(level) {
    const nextLevel = level + 1;
    const currentLevelThreshold = LEVEL_THRESHOLDS[level] || 0;
    const nextLevelThreshold = LEVEL_THRESHOLDS[nextLevel] || currentLevelThreshold;
    const isMaxLevel = level >= Object.keys(LEVEL_THRESHOLDS).length;
    return { currentLevelThreshold, nextLevelThreshold, isMaxLevel };
}

module.exports = { updateUserPoints, getLevelThresholds };