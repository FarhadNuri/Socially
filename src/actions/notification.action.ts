"use server";

import connectToDatabase from "@/lib/mongoose";
import Comment from "@/lib/models/comment";
import Notification from "@/lib/models/notification";
import Post from "@/lib/models/post";
import User from "@/lib/models/user";
import { getDbUserId } from "./user.action";

const normalizeId = <T extends { _id: string }>(doc: T) => {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id };
};

const normalizeUser = (user: { _id: string; name?: string; username?: string; image?: string }) =>
  normalizeId(user);

export async function getNotifications() {
  try {
    const userId = await getDbUserId();
    if (!userId) return [];

    await connectToDatabase();

    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    if (notifications.length === 0) return [];

    const creatorIds = [...new Set(notifications.map((item) => item.creatorId))];
    const postIds = notifications
      .map((item) => item.postId)
      .filter((id): id is string => Boolean(id));
    const commentIds = notifications
      .map((item) => item.commentId)
      .filter((id): id is string => Boolean(id));

    const [creators, posts, comments] = await Promise.all([
      User.find({ _id: { $in: creatorIds } })
        .select("_id name username image")
        .lean(),
      Post.find({ _id: { $in: postIds } })
        .select("_id content image")
        .lean(),
      Comment.find({ _id: { $in: commentIds } })
        .select("_id content createdAt")
        .lean(),
    ]);

    const creatorMap = new Map(creators.map((creator) => [creator._id, normalizeUser(creator)]));
    const postMap = new Map(posts.map((post) => [post._id, normalizeId(post)]));
    const commentMap = new Map(comments.map((comment) => [comment._id, normalizeId(comment)]));

    return notifications.map((notification) => ({
      ...normalizeId(notification),
      creator: creatorMap.get(notification.creatorId) ?? null,
      post: notification.postId ? postMap.get(notification.postId) ?? null : null,
      comment: notification.commentId ? commentMap.get(notification.commentId) ?? null : null,
    }));
  } catch (error) {
    console.error("Error fetching notifications:", error);
    throw new Error("Failed to fetch notifications");
  }
}

export async function markNotificationsAsRead(notificationIds: string[]) {
  try {
    await connectToDatabase();

    await Notification.updateMany(
      { _id: { $in: notificationIds } },
      { $set: { read: true } }
    );

    return { success: true };
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    return { success: false };
  }
}
