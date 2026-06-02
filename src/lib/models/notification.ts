import mongoose, { Schema } from "mongoose";

const NotificationSchema = new Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    userId: { type: String, ref: "User", required: true },
    creatorId: { type: String, ref: "User", required: true },
    type: {
      type: String,
      enum: ["LIKE", "COMMENT", "FOLLOW"],
      required: true,
    },
    read: { type: Boolean, default: false },
    postId: { type: String, ref: "Post" },
    commentId: { type: String, ref: "Comment" },
  },
  { timestamps: true, versionKey: false }
);

NotificationSchema.index({ userId: 1, createdAt: -1 });

NotificationSchema.virtual("id").get(function () {
  return this._id;
});

NotificationSchema.set("toObject", { virtuals: true });
NotificationSchema.set("toJSON", { virtuals: true });

const Notification =
  mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);

export default Notification;
