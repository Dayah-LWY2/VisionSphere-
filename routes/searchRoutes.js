const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');

// Search route (GET) - try to keep this as a simple pass-through to the controller 
router.get('/', searchController.search);

module.exports = router;