// Config Database
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            dbName: 'Forum'
        });
        console.log("MongoDB connected to 'Forum' database");
    } catch (err) {
        console.error("MongoDB connection failed", err);
        process.exit(1);
    }
};

connectDB();

module.exports = mongoose;
