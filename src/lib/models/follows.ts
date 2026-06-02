import mongoose, { Schema } from "mongoose";

const FollowsSchema = new Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    followerId: { type: String, ref: "User", required: true },
    followingId: { type: String, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

FollowsSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

FollowsSchema.virtual("id").get(function () {
  return this._id;
});

FollowsSchema.set("toObject", { virtuals: true });
FollowsSchema.set("toJSON", { virtuals: true });

const Follows = mongoose.models.Follows || mongoose.model("Follows", FollowsSchema);

export default Follows;
