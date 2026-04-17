const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    userEmail: { type: String, required: true },  // target user
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    read: { type: Boolean, default: false }
});

module.exports = mongoose.model('Notification', NotificationSchema);