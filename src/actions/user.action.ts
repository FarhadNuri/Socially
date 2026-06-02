"use server";

import connectToDatabase from "@/lib/mongoose";
import Follows from "@/lib/models/follows";
import Notification from "@/lib/models/notification";
import Post from "@/lib/models/post";
import User from "@/lib/models/user";
import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

const normalizeId = <T extends { _id: string }>(doc: T) => {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id };
};

export async function syncUser() {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    const user = await currentUser();

    if (!userId || !user) return;

    const existingUser = await User.findOne({ clerkId: userId }).lean();

    const derivedUsername =
      user.username ?? user.emailAddresses[0].emailAddress.split("@")[0];
    const derivedName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

    if (existingUser) {
      const updatedUser = await User.findOneAndUpdate(
        { clerkId: userId },
        {
          username: derivedUsername,
          email: user.emailAddresses[0].emailAddress,
          image: user.imageUrl,
          ...(derivedName ? { name: derivedName } : {}),
        },
        { new: true }
      ).lean();

      return normalizeId(updatedUser ?? existingUser);
    }

    const dbUser = await User.create({
      clerkId: userId,
      name: derivedName || `${user.firstName || ""} ${user.lastName || ""}`,
      username: derivedUsername,
      email: user.emailAddresses[0].emailAddress,
      image: user.imageUrl,
    });

    return normalizeId(dbUser.toObject());
  } catch (error) {
    console.log("Error in syncUser", error);
  }
}

export async function getUserByClerkId(clerkId: string) {
  await connectToDatabase();

  const user = await User.findOne({ clerkId }).lean();
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
}

export async function getDbUserId() {
  await connectToDatabase();
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const user = await getUserByClerkId(clerkId);

  if (user) return user.id;

  // Ensure the user exists in our DB before failing the request.
  await syncUser();
  const syncedUser = await getUserByClerkId(clerkId);

  return syncedUser ? syncedUser.id : null;
}

type RandomUserDoc = {
  _id: string;
  name?: string;
  username?: string;
  image?: string;
};

type RandomUser = {
  id: string;
  name?: string;
  username?: string;
  image?: string;
  _count: { followers: number };
};

export async function getRandomUsers(): Promise<RandomUser[]> {
  try {
    const userId = await getDbUserId();

    if (!userId) return [];

    await connectToDatabase();

    const following = await Follows.find({ followerId: userId })
      .select("followingId")
      .lean();
    const excludedIds = [userId, ...following.map((item) => item.followingId)];

    const users = (await User.aggregate([
      { $match: { _id: { $nin: excludedIds } } },
      { $sample: { size: 3 } },
    ])) as RandomUserDoc[];

    const usersWithCounts = await Promise.all(
      users.map(async (user) => {
        const followers = await Follows.countDocuments({ followingId: user._id });

        return {
          ...normalizeId(user),
          _count: { followers },
        };
      })
    );

    return usersWithCounts;
  } catch (error) {
    console.log("Error fetching random users", error);
    return [];
  }
}

export async function toggleFollow(targetUserId: string) {
  try {
    const userId = await getDbUserId();

    if (!userId) return;

    if (userId === targetUserId) throw new Error("You cannot follow yourself");

    await connectToDatabase();

    const existingFollow = await Follows.findOne({
      followerId: userId,
      followingId: targetUserId,
    }).lean();

    if (existingFollow) {
      // unfollow
      await Follows.deleteOne({ followerId: userId, followingId: targetUserId });
    } else {
      // follow
      await Follows.create({
        followerId: userId,
        followingId: targetUserId,
      });

      await Notification.create({
        type: "FOLLOW",
        userId: targetUserId, // user being followed
        creatorId: userId, // user following
      });
    }

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.log("Error in toggleFollow", error);
    return { success: false, error: "Error toggling follow" };
  }
}
