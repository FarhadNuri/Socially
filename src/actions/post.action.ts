"use server";

import connectToDatabase from "@/lib/mongoose";
import Comment from "@/lib/models/comment";
import Like from "@/lib/models/like";
import Notification from "@/lib/models/notification";
import Post from "@/lib/models/post";
import User from "@/lib/models/user";
import { getDbUserId } from "./user.action";
import { revalidatePath } from "next/cache";

const normalizeId = <T extends { _id: string }>(doc: T) => {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id };
};

const normalizeUser = (user: { _id: string; name?: string; username?: string; image?: string }) =>
  normalizeId(user);

export async function createPost(content: string, image: string) {
  try {
    const userId = await getDbUserId();

    if (!userId) return;

    await connectToDatabase();

    const post = await Post.create({
      content,
      image,
      authorId: userId,
    });

    revalidatePath("/"); // purge the cache for the home page
    return { success: true, post: normalizeId(post.toObject()) };
  } catch (error) {
    console.error("Failed to create post:", error);
    return { success: false, error: "Failed to create post" };
  }
}

export async function getPosts() {
  try {
    await connectToDatabase();

    const posts = await Post.find().sort({ createdAt: -1 }).lean();
    if (posts.length === 0) return [];

    const postIds = posts.map((post) => post._id);
    const authorIds = [...new Set(posts.map((post) => post.authorId))];

    const [authors, comments, likes] = await Promise.all([
      User.find({ _id: { $in: authorIds } })
        .select("_id name username image")
        .lean(),
      Comment.find({ postId: { $in: postIds } })
        .sort({ createdAt: 1 })
        .lean(),
      Like.find({ postId: { $in: postIds } })
        .select("_id postId userId")
        .lean(),
    ]);

    const authorMap = new Map(authors.map((author) => [author._id, normalizeUser(author)]));

    const commentAuthorIds = [...new Set(comments.map((comment) => comment.authorId))];
    const commentAuthors = await User.find({ _id: { $in: commentAuthorIds } })
      .select("_id name username image")
      .lean();
    const commentAuthorMap = new Map(
      commentAuthors.map((author) => [author._id, normalizeUser(author)])
    );

    const commentsByPost = new Map<string, Array<Record<string, unknown>>>();
    for (const comment of comments) {
      const commentWithAuthor = {
        ...normalizeId(comment),
        author: commentAuthorMap.get(comment.authorId) ?? null,
      };
      const list = commentsByPost.get(comment.postId) ?? [];
      list.push(commentWithAuthor);
      commentsByPost.set(comment.postId, list);
    }

    const likesByPost = new Map<string, Array<Record<string, unknown>>>();
    for (const like of likes) {
      const list = likesByPost.get(like.postId) ?? [];
      list.push(normalizeId(like));
      likesByPost.set(like.postId, list);
    }

    return posts.map((post) => {
      const normalizedPost = normalizeId(post);
      const postLikes = likesByPost.get(post._id) ?? [];
      const postComments = commentsByPost.get(post._id) ?? [];

      return {
        ...normalizedPost,
        author: authorMap.get(post.authorId) ?? null,
        comments: postComments,
        likes: postLikes,
        _count: {
          likes: postLikes.length,
          comments: postComments.length,
        },
      };
    });
  } catch (error) {
    console.log("Error in getPosts", error);
    throw new Error("Failed to fetch posts");
  }
}

export async function toggleLike(postId: string) {
  try {
    const userId = await getDbUserId();
    if (!userId) return;

    await connectToDatabase();

    // check if like exists
    const existingLike = await Like.findOne({ userId, postId }).lean();

    const post = await Post.findById(postId).select("authorId").lean();

    if (!post) throw new Error("Post not found");

    if (existingLike) {
      // unlike
      await Like.deleteOne({ userId, postId });
    } else {
      // like and create notification (only if liking someone else's post)
      await Like.create({ userId, postId });

      if (post.authorId !== userId) {
        await Notification.create({
          type: "LIKE",
          userId: post.authorId, // recipient (post author)
          creatorId: userId, // person who liked
          postId,
        });
      }
    }

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Failed to toggle like:", error);
    return { success: false, error: "Failed to toggle like" };
  }
}

export async function createComment(postId: string, content: string) {
  try {
    const userId = await getDbUserId();

    if (!userId) return;
    if (!content) throw new Error("Content is required");

    await connectToDatabase();

    const post = await Post.findById(postId).select("authorId").lean();

    if (!post) throw new Error("Post not found");

    const comment = await Comment.create({
      content,
      authorId: userId,
      postId,
    });

    // Create notification if commenting on someone else's post
    if (post.authorId !== userId) {
      await Notification.create({
        type: "COMMENT",
        userId: post.authorId,
        creatorId: userId,
        postId,
        commentId: comment._id,
      });
    }

    revalidatePath(`/`);
    return { success: true, comment: normalizeId(comment.toObject()) };
  } catch (error) {
    console.error("Failed to create comment:", error);
    return { success: false, error: "Failed to create comment" };
  }
}

export async function deletePost(postId: string) {
  try {
    const userId = await getDbUserId();

    await connectToDatabase();

    const post = await Post.findById(postId).select("authorId").lean();

    if (!post) throw new Error("Post not found");
    if (post.authorId !== userId) throw new Error("Unauthorized - no delete permission");

    await Promise.all([
      Comment.deleteMany({ postId }),
      Like.deleteMany({ postId }),
      Notification.deleteMany({ postId }),
      Post.deleteOne({ _id: postId }),
    ]);

    revalidatePath("/"); // purge the cache
    return { success: true };
  } catch (error) {
    console.error("Failed to delete post:", error);
    return { success: false, error: "Failed to delete post" };
  }
}
