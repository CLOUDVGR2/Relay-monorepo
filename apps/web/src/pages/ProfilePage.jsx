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
    <main className="min-h-full px-4 pb-12 pt-7 text-base-content sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col justify-between gap-5 sm:mb-10 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              <Sparkles size={13} />
              Account & identity
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-[2.75rem]">
              Your profile<span className="text-primary">.</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-base-content/65">
              Your personal space in Relay. Manage your identity and keep your account information close.
            </p>
          </div>

          <div className="flex w-fit items-center gap-2 rounded-full border border-success/20 bg-success/10 px-4 py-2.5 text-xs font-semibold text-success">
            <span className="size-2 rounded-full bg-success" />
            Account active
            <ShieldCheck size={15} />
          </div>
        </header>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.5fr)]">
          <section className="overflow-hidden rounded-[1.75rem] border border-base-300/70 bg-base-100 shadow-xl shadow-black/[0.04]">
            <div className="relative h-36 overflow-hidden bg-gradient-to-br from-primary/30 via-primary/10 to-secondary/20 sm:h-44">
              <div className="absolute -right-12 -top-24 size-72 rounded-full border border-base-content/10" />
              <div className="absolute -right-2 -top-14 size-52 rounded-full border border-base-content/10" />
              <div className="absolute -bottom-24 -left-12 size-56 rounded-full bg-primary/15 blur-2xl" />
              <div className="absolute right-5 top-5 rounded-full border border-base-content/10 bg-base-100/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-base-content backdrop-blur-md">
                Personal account
              </div>
            </div>

            <div className="px-6 pb-7 sm:px-8">
              <div className="-mt-16 flex items-end justify-between gap-3">
                <div className="relative">
                  <div className="rounded-[1.65rem] bg-gradient-to-br from-primary via-secondary to-primary p-1 shadow-xl shadow-primary/20">
                    <img
                      src={selectedImg || authUser?.profilePic || "/avatar.png"}
                      alt="Profile"
                      className="size-32 rounded-[1.4rem] border-[3px] border-base-100 bg-base-200 object-cover sm:size-36"
                    />
                  </div>
                  <label
                    htmlFor="avatar-upload"
                    className={`absolute -bottom-2 -right-2 grid size-11 cursor-pointer place-items-center rounded-2xl border-[3px] border-base-100 bg-primary text-primary-content shadow-lg transition duration-200 hover:-translate-y-1 hover:brightness-110 ${
                      isUpdatingProfile ? "pointer-events-none animate-pulse opacity-70" : ""
                    }`}
                    title="Change profile picture"
                  >
                    <Camera size={18} />
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

                <span className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-success">
                  <CheckCircle2 size={13} />
                  Active
                </span>
              </div>

              <div className="mt-6">
                <h2 className="break-words text-2xl font-bold tracking-tight sm:text-[1.8rem]">
                  {authUser?.fullName || "Relay member"}
                </h2>
                <p className="mt-2 break-all text-sm text-base-content/60">
                  {authUser?.email || "No email available"}
                </p>
              </div>

              <div className="my-6 h-px bg-base-300/80" />

              <div className="rounded-2xl bg-base-200/60 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-base-content/70">
                  <Camera size={15} className="text-primary" />
                  Profile photo
                </div>
                <p className="mt-2 text-xs leading-5 text-base-content/60">
                  {isUpdatingProfile
                    ? "Uploading your new profile photo…"
                    : "Make your Relay identity yours. Choose a clear photo to represent you."}
                </p>
                <label
                  htmlFor="avatar-upload"
                  className={`mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3.5 py-2.5 text-xs font-semibold shadow-sm transition hover:border-primary/40 hover:text-primary ${
                    isUpdatingProfile ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  <Camera size={14} />
                  {isUpdatingProfile ? "Uploading…" : "Update photo"}
                </label>
              </div>
            </div>
          </section>

          <div className="space-y-6">
            <section className="overflow-hidden rounded-[1.75rem] border border-base-300/70 bg-base-100 shadow-sm">
              <div className="flex flex-col gap-2 border-b border-base-300/70 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                    Personal information
                  </p>
                  <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
                    Account identity
                  </h2>
                  <p className="mt-1 text-sm text-base-content/60">
                    The details associated with your Relay account.
                  </p>
                </div>
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <UserRound size={20} />
                </div>
              </div>

              <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-8">
                <div className="rounded-2xl border border-base-300/70 bg-base-200/30 p-5 transition-colors hover:bg-base-200/60">
                  <div className="flex items-center gap-2 text-xs font-semibold text-base-content/55">
                    <UserRound size={15} className="text-primary" />
                    FULL NAME
                  </div>
                  <p className="mt-4 break-words text-base font-semibold">
                    {authUser?.fullName || "Not provided"}
                  </p>
                  <p className="mt-1 text-xs text-base-content/50">
                    Your display identity
                  </p>
                </div>

                <div className="rounded-2xl border border-base-300/70 bg-base-200/30 p-5 transition-colors hover:bg-base-200/60">
                  <div className="flex items-center gap-2 text-xs font-semibold text-base-content/55">
                    <Mail size={15} className="text-primary" />
                    EMAIL ADDRESS
                  </div>
                  <p className="mt-4 break-all text-base font-semibold">
                    {authUser?.email || "Not provided"}
                  </p>
                  <p className="mt-1 text-xs text-base-content/50">
                    Your account email
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-base-300/70 bg-base-100 p-6 shadow-sm sm:p-8">
              <div className="mb-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                  Membership
                </p>
                <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
                  Your account at a glance
                </h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-4 rounded-2xl bg-base-200/50 p-4">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <CalendarDays size={21} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-base-content/55">
                      Member since
                    </p>
                    <p className="mt-1 text-sm font-bold">{memberSince}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 rounded-2xl bg-base-200/50 p-4">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-success/10 text-success">
                    <ShieldCheck size={21} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-base-content/55">
                      Account status
                    </p>
                    <p className="mt-1 text-sm font-bold">Active</p>
                    <p className="mt-0.5 text-xs text-base-content/55">
                      Available for use
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
};

export default ProfilePage;
