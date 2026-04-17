const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');

// View all notifications (as a full page)
router.get('/view', async (req, res) => {
    const userEmail = req.session.user.email;
    const notifications = await Notification.find({ userEmail }).sort({ createdAt: -1 });
    res.render('notification/view', { title: 'Notification', notifications });
});

// Get notifications as JSON for the modal
router.get('/api', async (req, res) => {
    const userEmail = req.session.user.email;
    const notifications = await Notification.find({ userEmail }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, notifications });
});

// Mark notifications as read
router.post('/mark-read', async (req, res) => {
    const userEmail = req.session.user.email;
    // Mark all unread notifications for the user as read
    await Notification.updateMany({ userEmail, read: false }, { $set: { read: true } });
    res.json({ success: true });
});

module.exports = router;