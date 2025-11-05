// models/Reel.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const reelSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    videoUrl: { type: String, required: true },

    caption: { type: String, default: "", trim: true },

    likes: [{ type: Schema.Types.ObjectId, ref: "User" }],

    comments: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        text: { type: String, required: true, trim: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    /* ▶ Views counter (for UI “eye” icon) */
    views: { type: Number, default: 0, min: 0, index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },   // include virtuals in API output
    toObject: { virtuals: true }, // for server-side transforms
  }
);

/* 🔢 Virtual counts (handy for API/UI) */
reelSchema.virtual("likesCount").get(function () {
  return Array.isArray(this.likes) ? this.likes.length : 0;
});
reelSchema.virtual("commentsCount").get(function () {
  return Array.isArray(this.comments) ? this.comments.length : 0;
});
reelSchema.virtual("viewsCount").get(function () {
  return typeof this.views === "number" ? this.views : 0;
});

/* 🔍 Indexes */
reelSchema.index({ createdAt: -1 });
reelSchema.index({ userId: 1, createdAt: -1 });
// `views` already has an index on the field for “most viewed” sort

/* 🆙 Helpers */
reelSchema.statics.bumpView = async function (reelId) {
  if (!reelId) return;
  await this.findByIdAndUpdate(reelId, { $inc: { views: 1 } }, { lean: true });
};

// placeholder if you want unique-per-user/IP in future
reelSchema.statics.bumpViewUnique = async function (reelId /*, key */) {
  return this.bumpView(reelId);
};

module.exports = mongoose.models.Reel || mongoose.model("Reel", reelSchema);
