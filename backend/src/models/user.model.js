import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      maxlength: 254,
      unique: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address"],
    },
    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
      select: false,
      match: [
        /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/,
        "Password hash must have the bcrypt format",
      ],
    },
    role: {
      type: String,
      required: true,
      enum: [
        "system_admin",
        "directorate_staff",
        "department_manager",
        "faculty_member",
      ],
      default: "faculty_member",
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(document, result) {
        delete result.passwordHash;
        return result;
      },
    },
  },
);

const User = mongoose.model("User", userSchema);

export default User;
