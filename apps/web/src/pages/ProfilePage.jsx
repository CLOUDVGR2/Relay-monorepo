/** Page component for ProfilePage in the Relay web application. */

import { useState } from "react";
import {
  Camera,
  Mail,
  UserRound,
  ShieldCheck,
  CalendarDays,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import toast from "react-hot-toast";

const MAX_PROFILE_IMAGE_SIZE = 7 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const ProfilePage = () => {
  const { authUser, isUpdatingProfile, updateProfile } = useAuthStore();
  const [selectedImg, setSelectedImg] = useState(null);

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_PROFILE_IMAGE_TYPES.has(file.type)) {
      toast.error("Choose a PNG, JPEG, WebP, or GIF image.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_PROFILE_IMAGE_SIZE) {
      toast.error("Profile pictures must be 7 MB or smaller.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = async () => {
      if (typeof reader.result !== "string") return;

      try {
        const updated = await updateProfile({ profilePic: reader.result });

        if (updated) {
          setSelectedImg(reader.result);
        }
      } catch (error) {
        console.error("Profile picture update failed:", error);
      }
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const memberSince = authUser?.createdAt
    ? new Date(authUser.createdAt).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      })
    : "—";

  return (
    <main className="min-h-full px-4 pb-10 pt-7 text-base-content sm:px-6 lg:px-10 lg:pt-10">
      <div className="mx-auto max-w-5xl space-y-7">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-base-content">
              <Sparkles size={13} />
              Your workspace identity
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Profile
            </h1>
            <p className="mt-2 text-sm text-base-content">
              Manage your personal information and account details.
            </p>
          </div>

          <div className="flex w-fit items-center gap-2 rounded-xl border border-base-300/80 bg-base-100 px-3.5 py-2.5 text-xs text-base-content shadow-sm">
            <ShieldCheck size={16} className="text-success" />
            Account information
          </div>
        </header>

        <section className="overflow-hidden rounded-3xl border border-base-300/80 bg-base-100 shadow-xl shadow-black/[0.04]">
          <div className="relative h-36 overflow-hidden bg-base-200 sm:h-44">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_20%,rgba(59,130,246,0.25),transparent_55%),radial-gradient(ellipse_at_85%_80%,rgba(34,211,238,0.15),transparent_48%)]" />
            <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.15)_1px,transparent_1px)] [background-size:32px_32px]" />
            <div className="absolute right-5 top-5 flex items-center gap-2 rounded-full border border-base-content/10 bg-base-100/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-base-content backdrop-blur-xl">
              <span className="size-1.5 rounded-full bg-success" />
              Relay member
            </div>
          </div>

          <div className="px-5 pb-7 sm:px-8 sm:pb-9">
            <div className="-mt-14 flex flex-col gap-5 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
              <div className="relative w-fit">
                <div className="rounded-full bg-gradient-to-br from-primary via-secondary to-primary p-1 shadow-xl shadow-primary/20">
                  <img
                    src={selectedImg || authUser?.profilePic || "/avatar.png"}
                    alt="Profile"
                    className="size-28 rounded-full border-4 border-base-100 bg-base-200 object-cover sm:size-32"
                  />
                </div>

                <label
                  htmlFor="avatar-upload"
                  className={`absolute bottom-1 right-1 grid size-10 cursor-pointer place-items-center rounded-full border-2 border-base-100 bg-primary text-primary-content shadow-lg transition hover:scale-105 hover:brightness-110 ${
                    isUpdatingProfile ? "pointer-events-none animate-pulse opacity-70" : ""
                  }`}
                  title="Change profile picture"
                >
                  <Camera size={17} />
                  <input
                    type="file"
                    id="avatar-upload"
                    className="hidden"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleImageUpload}
                    disabled={isUpdatingProfile}
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 pb-1">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-3 py-1.5 text-xs font-medium text-success">
                  <CheckCircle2 size={14} />
                  Active account
                </span>
                <span className="rounded-full border border-base-300 bg-base-200/60 px-3 py-1.5 text-xs text-base-content">
                  Personal profile
                </span>
              </div>
            </div>

            <div className="mt-5">
              <h2 className="text-2xl font-semibold tracking-tight">
                {authUser?.fullName || "Relay member"}
              </h2>
              <p className="mt-1 break-all text-sm text-base-content">
                {authUser?.email || "No email available"}
              </p>
              <p className={`mt-3 text-xs ${isUpdatingProfile ? "text-primary" : "text-base-content"}`}>
                {isUpdatingProfile
                  ? "Uploading your new profile photo…"
                  : "Choose the camera button to update your profile photo."}
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-3xl border border-base-300/80 bg-base-100 p-5 shadow-sm sm:p-7">
            <div className="mb-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                Personal details
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">
                Your information
              </h2>
              <p className="mt-1 text-sm text-base-content">
                Information associated with your Relay account.
              </p>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-base-300/80 bg-base-200/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-base-content">
                  <UserRound size={15} className="text-primary" />
                  Full name
                </div>
                <p className="break-words text-sm font-medium">
                  {authUser?.fullName || "Not provided"}
                </p>
              </div>

              <div className="rounded-2xl border border-base-300/80 bg-base-200/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-base-content">
                  <Mail size={15} className="text-primary" />
                  Email address
                </div>
                <p className="break-all text-sm font-medium">
                  {authUser?.email || "Not provided"}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-base-300/80 bg-base-100 p-5 shadow-sm sm:p-7">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              Account overview
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              Account details
            </h2>
            <p className="mt-1 text-sm text-base-content">
              A quick overview of your membership.
            </p>

            <div className="mt-6 divide-y divide-base-300/70">
              <div className="flex items-start gap-3 py-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <CalendarDays size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-base-content">Member since</p>
                  <p className="mt-1 text-sm font-medium">{memberSince}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 py-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success">
                  <ShieldCheck size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-base-content">Account status</p>
                  <p className="mt-1 text-sm font-medium">Active</p>
                  <p className="mt-1 text-xs leading-5 text-base-content">
                    Your Relay account is available for use.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};

export default ProfilePage;
