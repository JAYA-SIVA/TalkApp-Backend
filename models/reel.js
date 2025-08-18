// models/Reel.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const reelSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    videoUrl: {
      type: String,
      required: true,
    },

    caption: {
      type: String,
      default: "",
      trim: true,
    },

    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    comments: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        text: {
          type: String,
          required: true,
          trim: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

/* 🔢 Virtual counts (handy for API/UI) */
reelSchema.virtual("likesCount").get(function () {
  return Array.isArray(this.likes) ? this.likes.length : 0;
});
reelSchema.virtual("commentsCount").get(function () {
  return Array.isArray(this.comments) ? this.comments.length : 0;
});

/* 🔍 Indexes */
reelSchema.index({ createdAt: -1 });
reelSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.Reel || mongoose.model("Reel", reelSchema);
