const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    community: String,
    title: String,
    body: String,
    media: [String], // array of file paths
    createdAt: { type: Date, default: Date.now },
    author: {
        id: mongoose.Schema.Types.ObjectId,
        email: String,
        fullName: String,
        avatar: {
            filename: String,
            uploadedAt: Date
        }
    },
    upvotes: { type: [String], default: [] },
    downvotes: { type: [String], default: [] },
    poll: {
        question: String,
        options: [{
            text: String,
            votes: { type: [String], default: [] } // Array of user emails who voted
        }]
    },
    reactions: {
        type: Map,
        of: [String],
        default: {}
    },
    comments: {
        type: [
            {
                _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
                content: String,
                parentId: { type: mongoose.Schema.Types.ObjectId, default: null },
                author: {
                    email: String,
                    fullName: String,
                    avatar: {
                        filename: String,
                        uploadedAt: Date
                    }
                },
                media: String,
                createdAt: { type: Date, default: Date.now },
                deleted: {
                    status: { type: Boolean, default: false },
                    reason: { type: String, default: '' },
                    deletedBy: { type: String, default: '' },
                    deletedAt: { type: Date }
                },
                upvotes: { type: [String], default: [] },
                downvotes: { type: [String], default: [] }
            }
        ],
        default: []
    },
    deleted: {
        status: { type: Boolean, default: false },
        reason: { type: String, default: '' },
        deletedBy: { type: String, default: '' },
        deletedAt: { type: Date }
    }
});

// Add the text index to the schema
postSchema.index({
  title: 'text',
  body: 'text',
  'comments.content': 'text'
});

const modelsCache = {};

function getCommunityModel(communityName) {
    const collectionName = `community_${communityName.toLowerCase()}`;
    if (!modelsCache[collectionName]) {
        modelsCache[collectionName] = mongoose.model(collectionName, postSchema, collectionName);
    }
    return modelsCache[collectionName];
}

module.exports = getCommunityModel;