"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

interface PeopleCreateDialogProps {
  mode: "person" | "group";
  initialName?: string;
  primaryGroupId?: string | null;
  parentGroupId?: string | null;
  onClose: () => void;
  onCreated: () => void;
}

interface PeopleCreateResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export function PeopleCreateDialog({
  mode,
  initialName = "",
  primaryGroupId = null,
  parentGroupId = null,
  onClose,
  onCreated,
}: PeopleCreateDialogProps) {
  const [name, setName] = useState(initialName);
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [organization, setOrganization] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [birthday, setBirthday] = useState("");
  const [website, setWebsite] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPerson = mode === "person";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setIsSubmitting(true);

    try {
      const response = await fetch(isPerson ? "/api/people/persons" : "/api/people/groups", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          isPerson
            ? {
                displayName: trimmedName,
                primaryGroupId,
                givenName: givenName.trim() || null,
                familyName: familyName.trim() || null,
                email: email.trim() || null,
                phone: phone.trim() || null,
                avatarUrl: avatarUrl.trim() || null,
                organization: organization.trim() || null,
                jobTitle: jobTitle.trim() || null,
                birthday: birthday.trim() || null,
                website: website.trim() || null,
                addressLine1: addressLine1.trim() || null,
                addressLine2: addressLine2.trim() || null,
                city: city.trim() || null,
                region: region.trim() || null,
                postalCode: postalCode.trim() || null,
                country: country.trim() || null,
                notes: notes.trim() || null,
              }
            : {
                name: trimmedName,
                parentGroupId,
              }
        ),
      });
      const result = (await response.json()) as PeopleCreateResponse;

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || `Failed to create ${isPerson ? "person" : "group"}`);
      }

      toast.success(isPerson ? "Person created" : "Group created", {
        description: trimmedName,
      });
      window.dispatchEvent(new CustomEvent("dg:people-refresh"));
      onCreated();
      onClose();
    } catch (err) {
      console.error("[PeopleCreateDialog] Create failed:", err);
      toast.error(isPerson ? "Failed to create person" : "Failed to create group", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]">
      <form onSubmit={submit} className="flex max-h-[480px] w-full max-w-md flex-col overflow-hidden rounded-xl border border-white/15 bg-white/95 shadow-2xl backdrop-blur-md dark:bg-gray-900/95">
        <div className="flex items-start justify-between border-b border-gray-200/60 px-4 py-3 dark:border-white/10">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {isPerson ? "Create Person Profile" : "Create Group"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {isPerson ? "Add a person record to People." : "Add a People group."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-gray-200"
            aria-label="Close create dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">
              {isPerson ? "Display name" : "Group name"}
            </span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={isPerson ? "Bob Smith" : "Friends"}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gold-primary/60 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:placeholder:text-gray-600"
            />
          </label>

          {isPerson ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Given name" value={givenName} onChange={setGivenName} placeholder="Optional" />
                <TextField label="Family name" value={familyName} onChange={setFamilyName} placeholder="Optional" />
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">Email</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Optional"
                  type="email"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gold-primary/60 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:placeholder:text-gray-600"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">Phone</span>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gold-primary/60 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:placeholder:text-gray-600"
                />
              </label>
              <TextField label="Avatar URL" value={avatarUrl} onChange={setAvatarUrl} placeholder="Optional" />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Organization" value={organization} onChange={setOrganization} placeholder="Optional" />
                <TextField label="Job title" value={jobTitle} onChange={setJobTitle} placeholder="Optional" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Birthday" value={birthday} onChange={setBirthday} placeholder="Optional" />
                <TextField label="Website" value={website} onChange={setWebsite} placeholder="Optional" />
              </div>
              <TextField label="Address line 1" value={addressLine1} onChange={setAddressLine1} placeholder="Optional" />
              <TextField label="Address line 2" value={addressLine2} onChange={setAddressLine2} placeholder="Optional" />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="City" value={city} onChange={setCity} placeholder="Optional" />
                <TextField label="State / Region" value={region} onChange={setRegion} placeholder="Optional" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Postal code" value={postalCode} onChange={setPostalCode} placeholder="Optional" />
                <TextField label="Country" value={country} onChange={setCountry} placeholder="Optional" />
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">Notes</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional"
                  rows={3}
                  className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-500 focus:border-gold-primary/60"
                />
              </label>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-end border-t border-gray-200/60 px-4 py-3 dark:border-white/10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="whitespace-nowrap rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
            >
              {isSubmitting ? "Creating..." : isPerson ? "Create Person" : "Create Group"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gold-primary/60 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:placeholder:text-gray-600"
      />
    </label>
  );
}
