require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
require('./config/db');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');

const app = express();
const ASSET_VERSION = Date.now();

// View engine setup
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layout');

// Middleware - body parsing and static files
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false
    }
}));

// Custom middleware
app.use(require('./middleware/attachUser'));
app.use(require('./middleware/sidebar'));
app.use((req, res, next) => {
    res.locals.assetVersion = ASSET_VERSION;
    next();
});

const ensureAuthenticated = require('./middleware/auth');

// Route setup
app.use('/api', require('./routes/karmaRoutes'));
app.use('/', require('./routes/authRoutes'));
app.use('/posts', ensureAuthenticated, require('./routes/postRoutes'));
app.use('/profile', ensureAuthenticated, require('./routes/profileRoutes'));
app.use('/community', ensureAuthenticated, require('./routes/communityRoutes'));
app.use('/search', ensureAuthenticated, require('./routes/searchRoutes'));
app.use('/notification', ensureAuthenticated, require('./routes/notificationRoutes'));
app.use('/management', ensureAuthenticated, require('./routes/userManagementRoutes'));
app.use('/', require('./routes/homeRoutes'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
