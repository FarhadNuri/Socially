"use server";

import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/mongoose";
import Comment from "@/lib/models/comment";
import Follows from "@/lib/models/follows";
import Like from "@/lib/models/like";
import Post from "@/lib/models/post";
import User from "@/lib/models/user";
import { revalidatePath } from "next/cache";
import { getDbUserId } from "./user.action";

const normalizeId = <T extends { _id: string }>(doc: T) => {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id };
};

const normalizeUser = (user: { _id: string; name?: string; username?: string; image?: string }) =>
  normalizeId(user);

const buildPostsWithDetails = async (posts: Array<{ _id: string; authorId: string }>) => {
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
};

export async function getProfileByUsername(username: string) {
  try {
    await connectToDatabase();

    const user = await User.findOne({ username }).lean();
    if (!user) return null;

    const [followers, following, posts] = await Promise.all([
      Follows.countDocuments({ followingId: user._id }),
      Follows.countDocuments({ followerId: user._id }),
      Post.countDocuments({ authorId: user._id }),
    ]);

    return {
      ...normalizeId(user),
      _count: { followers, following, posts },
    };
  } catch (error) {
    console.error("Error fetching profile:", error);
    throw new Error("Failed to fetch profile");
  }
}

export async function getUserPosts(userId: string) {
  try {
    await connectToDatabase();

    const posts = await Post.find({ authorId: userId })
      .sort({ createdAt: -1 })
      .lean();

    return await buildPostsWithDetails(posts);
  } catch (error) {
    console.error("Error fetching user posts:", error);
    throw new Error("Failed to fetch user posts");
  }
}

export async function getUserLikedPosts(userId: string) {
  try {
    await connectToDatabase();

    const likes = await Like.find({ userId }).select("postId").lean();
    const postIds = likes.map((like) => like.postId);
    if (postIds.length === 0) return [];

    const likedPosts = await Post.find({ _id: { $in: postIds } })
      .sort({ createdAt: -1 })
      .lean();

    return await buildPostsWithDetails(likedPosts);
  } catch (error) {
    console.error("Error fetching liked posts:", error);
    throw new Error("Failed to fetch liked posts");
  }
}

export async function updateProfile(formData: FormData) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) throw new Error("Unauthorized");

    const name = formData.get("name") as string;
    const bio = formData.get("bio") as string;
    const location = formData.get("location") as string;
    const website = formData.get("website") as string;

    await connectToDatabase();

    const user = await User.findOneAndUpdate(
      { clerkId },
      { name, bio, location, website },
      { new: true }
    ).lean();

    if (user?.username) {
      revalidatePath(`/profile/${user.username}`);
    }
    return { success: true, user: user ? normalizeId(user) : null };
  } catch (error) {
    console.error("Error updating profile:", error);
    return { success: false, error: "Failed to update profile" };
  }
}

export async function isFollowing(userId: string) {
  try {
    const currentUserId = await getDbUserId();
    if (!currentUserId) return false;

    await connectToDatabase();

    const follow = await Follows.findOne({
      followerId: currentUserId,
      followingId: userId,
    }).lean();

    return !!follow;
  } catch (error) {
    console.error("Error checking follow status:", error);
    return false;
  }
}
