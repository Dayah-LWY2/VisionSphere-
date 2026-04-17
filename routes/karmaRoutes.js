const express = require('express');
const router = express.Router();
const { computeUserKarma } = require('../utils/karma');

// JSON-only guard (no redirect)
function requireLoginJson(req, res, next) {
    if (req.session && req.session.user && req.session.user.email) return next();
    return res.status(401).json({ error: 'Login required' });
}

router.get('/me/karma', requireLoginJson, async (req, res) => {
    try {
        const email = req.session.user.email;
        const stats = await computeUserKarma(email);
        res.json({ success: true, email, ...stats });
    } catch (err) {
        console.error('[karma] error:', err);
        res.status(500).json({ success: false, error: 'Failed to compute karma' });
    }
});

module.exports = router;