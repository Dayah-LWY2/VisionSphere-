function ensureAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next(); // user logged in, continue
    }
    // If not logged in, redirect to homepage (where login modal exists)
    res.redirect('/?loginRequired=true');
}

module.exports = ensureAuthenticated;