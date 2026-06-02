import mongoose, { Schema } from "mongoose";

const UserSchema = new Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    clerkId: { type: String, required: true, unique: true },
    name: { type: String },
    bio: { type: String },
    image: { type: String },
    location: { type: String },
    website: { type: String },
  },
  { timestamps: true, versionKey: false }
);

UserSchema.virtual("id").get(function () {
  return this._id;
});

UserSchema.set("toObject", { virtuals: true });
UserSchema.set("toJSON", { virtuals: true });

const User = mongoose.models.User || mongoose.model("User", UserSchema);

export default User;
