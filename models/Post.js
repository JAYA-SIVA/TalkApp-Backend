// models/Post.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

/* -------------------------- Comments sub-schema -------------------------- */
const commentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    comment: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/* ------------------------- Moderation sub-document ------------------------ */
/**
 * moderation.status is primarily for internal workflows. Your Android app only
 * cares about the simple booleans `isAdult` and `isApproved`, which we also
 * keep on the root document for fast filtering.
 */
const moderationSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["approved", "rejected", "pending"],
      default: "approved",
      index: true,
    },
    reason: { type: String, default: "", trim: true },
    reviewer: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { _id: false }
);

/* --------------------------------- Post --------------------------------- */
const postSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["post", "tweet", "reel", "story"],
      default: "post",
      index: true,
    },

    // textual body (for tweets/plain posts)
    text: { type: String, default: "", trim: true },

    // caption for media posts
    caption: { type: String, default: "", trim: true },

    // media
    images: { type: [String], default: [] }, // Cloudinary URLs
    video: { type: String, default: "" },    // Cloudinary URL

    // social
    likes: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    comments: { type: [commentSchema], default: [] },

    /* ------------------ Adult / approval flags used by client ------------------ */
    // Marked by your policy (never settable by normal clients)
    isAdult: { type: Boolean, default: false, index: true },

    // Visible flag to quickly hide content from feeds/search
    isApproved: { type: Boolean, default: true, index: true },

    /* ------------------------- Moderation audit trail -------------------------- */
    moderation: { type: moderationSchema, default: () => ({}) },
  },
  {
    timestamps: true, // createdAt & updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ----------------------------- Virtual counts ---------------------------- */
postSchema.virtual("likesCount").get(function () {
  return Array.isArray(this.likes) ? this.likes.length : 0;
});
postSchema.virtual("commentsCount").get(function () {
  return Array.isArray(this.comments) ? this.comments.length : 0;
});

/* -------------------------------- Indexes -------------------------------- */
postSchema.index({ createdAt: -1 });
postSchema.index({ userId: 1, createdAt: -1 });
postSchema.index({ type: 1, createdAt: -1 });
postSchema.index({ isApproved: 1, createdAt: -1 });
postSchema.index({ isAdult: 1, createdAt: -1 });

/* -------------------------- Lightweight adult check -------------------------- */
/**
 * A tiny keyword gate. Keep server-side so Android can’t bypass it.
 * You can expand/replace with your own classifier.
 */
const ADULT_KEYWORDS = [
  "18+", "nsfw", "porn", "xxx", "nudity", "nude", "sexual", "sex",
  "explicit", "onlyfans", "erotic", "fetish",
];
const ADULT_REGEX = new RegExp(`\\b(${ADULT_KEYWORDS.join("|")})\\b`, "i");

postSchema.statics.isAdultish = function (text = "") {
  return ADULT_REGEX.test(text || "");
};

/* --------------------------- Client safety helpers --------------------------- */
/**
 * Strip client attempts to forcibly set moderation flags.
 * Use in your route before `new Post(body)`:
 *   const clean = Post.sanitizeClientCreate(req.body)
 */
postSchema.statics.sanitizeClientCreate = function (body = {}) {
  const clean = { ...body };
  delete clean.isAdult;
  delete clean.isApproved;
  delete clean.moderation;
  return clean;
};

/**
 * Call this on new docs when created by non-admins to enforce policy:
 *   const post = new Post(clean);
 *   post.enforceClientDefaults();
 */
postSchema.methods.enforceClientDefaults = function () {
  // Default path: content is approved & not adult unless policy flags it
  const adult = (this.caption && ADULT_REGEX.test(this.caption)) ||
                (this.text && ADULT_REGEX.test(this.text));
  if (adult) {
    // Choose your behavior:
    // A) Block in route (recommended for “stop at upload”)
    // B) Mark as adult & unapproved (kept here for workflows)
    this.isAdult = true;
    this.isApproved = false;
    this.moderation = {
      status: "pending",
      reason: "Auto keyword flag",
      reviewer: null,
      reviewedAt: null,
    };
  } else {
    this.isAdult = false;
    this.isApproved = true;
    // keep moderation.approved as default
  }
};

/* --------------------------- Admin override helper -------------------------- */
/**
 * For admins/moderators to approve/reject content explicitly.
 *   await post.applyModeration({ status: "approved" }) // also clears isAdult
 */
postSchema.methods.applyModeration = async function ({
  status,
  reason = "",
  reviewer = null,
}) {
  if (!["approved", "rejected", "pending"].includes(status)) return this;

  this.moderation.status = status;
  this.moderation.reason = reason;
  this.moderation.reviewer = reviewer;
  this.moderation.reviewedAt = new Date();

  if (status === "approved") {
    this.isApproved = true;
    // You can also decide to keep isAdult=true but allow show-with-gate;
    // since your Android now *gates* adult content, keeping it true is OK:
    // this.isAdult = true; // if you want to keep adult flag but still approved
  } else if (status === "rejected") {
    this.isApproved = false;
  } else if (status === "pending") {
    this.isApproved = false;
  }

  return this.save();
};

module.exports = mongoose.models.Post || mongoose.model("Post", postSchema);
