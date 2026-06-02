import mongoose, { Schema } from "mongoose";

const CommentSchema = new Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    content: { type: String, required: true },
    authorId: { type: String, ref: "User", required: true },
    postId: { type: String, ref: "Post", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

CommentSchema.index({ authorId: 1, postId: 1 });

CommentSchema.virtual("id").get(function () {
  return this._id;
});

CommentSchema.set("toObject", { virtuals: true });
CommentSchema.set("toJSON", { virtuals: true });

const Comment = mongoose.models.Comment || mongoose.model("Comment", CommentSchema);

export default Comment;
