import mongoose, { Schema } from "mongoose";

const PostSchema = new Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    authorId: { type: String, ref: "User", required: true },
    content: { type: String },
    image: { type: String },
  },
  { timestamps: true, versionKey: false }
);

PostSchema.virtual("id").get(function () {
  return this._id;
});

PostSchema.set("toObject", { virtuals: true });
PostSchema.set("toJSON", { virtuals: true });

const Post = mongoose.models.Post || mongoose.model("Post", PostSchema);

export default Post;
