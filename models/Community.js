const mongoose = require('mongoose');

const communitySchema = new mongoose.Schema({
    name: { type: String, unique: true }, // e.g., 'dit', 'dba'
    displayName: { type: String, required: true }, 
    description: { type: String, default: '' },
    icon: {
        filename: String,
        uploadedAt: Date
    },
    members: [String], // array of emails
    isGeneral: { type: Boolean, default: false },
    isRestrictedPosting: { type: Boolean, default: false },
    bannedMembers: [ // New field to store banned users
        {
            email: { type: String, required: true },
            bannedBy: { type: String, required: true },
            bannedAt: { type: Date, default: Date.now },
            reason: { type: String }
        }
    ],
    removedMembers: [ // This is for the kick feature
        {
            email: { type: String, required: true },
            removedBy: { type: String, required: true },
            removedAt: { type: Date, default: Date.now },
            reason: { type: String }
        }
    ]
});

module.exports = mongoose.model('Community', communitySchema);