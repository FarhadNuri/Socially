import mongoose, { Schema } from "mongoose";

const LikeSchema = new Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    postId: { type: String, ref: "Post", required: true },
    userId: { type: String, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

LikeSchema.index({ userId: 1, postId: 1 }, { unique: true });

LikeSchema.virtual("id").get(function () {
  return this._id;
});

LikeSchema.set("toObject", { virtuals: true });
LikeSchema.set("toJSON", { virtuals: true });

const Like = mongoose.models.Like || mongoose.model("Like", LikeSchema);

export default Like;
