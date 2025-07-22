// controllers/talk.js

let posts = [];
let comments = {};

// 🧪 Fake in-memory user DB (used for username lookup)
const userDB = [
  { userId: "687dc0d5b5068224c27f2cae", username: "siva" },
  { userId: "user123", username: "john" }
];

// 📤 Upload a post
exports.uploadPost = async (req, res) => {
  try {
    const { caption } = req.body;
    const file = req.file;
    const userId = req.user?.id; // ✅ From JWT

    if (!caption || !userId || !file) {
      return res.status(400).json({ message: "caption, media, and userId are required" });
    }

    const mediaUrl = file.path;
    const mediaType = file.mimetype.startsWith("image/")
      ? "image"
      : file.mimetype.startsWith("video/")
      ? "video"
      : "other";

    const post = {
      id: Date.now(),
      caption,
      mediaUrl,
      mediaType,
      userId,
      likes: [],
      createdAt: new Date()
    };

    posts.push(post);

    res.status(201).json({ message: "✅ Post uploaded", post });
  } catch (error) {
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

// 📥 Get all posts
exports.getAllPosts = async (req, res) => {
  try {
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch posts", error: error.message });
  }
};

// 🔎 Get post by ID
exports.getPostById = async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const post = posts.find(p => p.id === postId);
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.status(200).json(post);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch post", error: error.message });
  }
};

// 👤 Get posts by User ID
exports.getPostsByUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const userPosts = posts.filter(p => p.userId === userId);
    res.status(200).json(userPosts);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user posts", error: error.message });
  }
};

// 🔍 Get posts by username
exports.getPostsByUsername = async (req, res) => {
  try {
    const username = req.params.username;
    const user = userDB.find(u => u.username === username);

    if (!user) return res.status(404).json({ message: "User not found" });

    const userPosts = posts.filter(p => p.userId === user.userId);
    res.status(200).json(userPosts);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch posts by username", error: error.message });
  }
};

// 👍 Like post
exports.likePost = async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.user?.id;

    const post = posts.find(p => p.id === postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (!post.likes.includes(userId)) {
      post.likes.push(userId);
    }

    res.status(200).json({ message: "Post liked", likes: post.likes });
  } catch (error) {
    res.status(500).json({ message: "Like failed", error: error.message });
  }
};

// 👎 Unlike post
exports.unlikePost = async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.user?.id;

    const post = posts.find(p => p.id === postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    post.likes = post.likes.filter(id => id !== userId);

    res.status(200).json({ message: "Post unliked", likes: post.likes });
  } catch (error) {
    res.status(500).json({ message: "Unlike failed", error: error.message });
  }
};

// 💬 Add comment
exports.addComment = async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.user?.id;
    const { text } = req.body;

    if (!text || !userId) {
      return res.status(400).json({ message: "Text and userId required" });
    }

    const comment = {
      id: Date.now(),
      userId,
      text,
      createdAt: new Date()
    };

    if (!comments[postId]) {
      comments[postId] = [];
    }

    comments[postId].push(comment);

    res.status(201).json({ message: "Comment added", comment });
  } catch (error) {
    res.status(500).json({ message: "Comment failed", error: error.message });
  }
};

// 🗨️ Get comments
exports.getComments = async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const postComments = comments[postId] || [];
    res.status(200).json(postComments);
  } catch (error) {
    res.status(500).json({ message: "Failed to get comments", error: error.message });
  }
};

// ❌ Delete post
exports.deletePost = async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.user?.id;

    const index = posts.findIndex(p => p.id === postId);
    if (index === -1) return res.status(404).json({ message: "Post not found" });

    const post = posts[index];
    if (post.userId !== userId) {
      return res.status(403).json({ message: "Unauthorized: Cannot delete others' posts" });
    }

    posts.splice(index, 1);
    delete comments[postId];

    res.status(200).json({ message: "Post deleted" });
  } catch (error) {
    res.status(500).json({ message: "Delete failed", error: error.message });
  }
};
