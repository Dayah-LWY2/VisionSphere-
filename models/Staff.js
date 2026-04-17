const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    userId: { type: String, required: true }, // remove or change in the future?
    fullName: { type: String, required: true },
    password: String,
    avatar: {
        filename: { type: String },
        uploadedAt: { type: Date }
    },
    banner: {
        filename: { type: String },
        uploadedAt: { type: Date }
    },
    points: { type: Number, default: 0 },
    level: { type: Number, default: 0 },
    roleOverride: { type: String, enum: ['regular', 'moderator'], default: undefined },
    theme: { type: String, enum: ['default', 'dark'], default: 'default' }
});

module.exports = mongoose.model('Staff', staffSchema, 'Staff');
