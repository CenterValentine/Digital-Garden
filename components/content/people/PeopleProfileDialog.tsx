"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

interface PeopleProfileDialogProps {
  personId: string;
  onClose: () => void;
  onUpdated: () => void;
}

interface PersonDetailResponse {
  success: boolean;
  data?: {
    personId: string;
    displayName: string;
    slug: string;
    givenName: string | null;
    familyName: string | null;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
    primaryGroupId: string;
    primaryGroupName: string;
    metadata: {
      organization: string | null;
      jobTitle: string | null;
      birthday: string | null;
      website: string | null;
      notes: string | null;
      address: {
        line1: string | null;
        line2: string | null;
        city: string | null;
        region: string | null;
        postalCode: string | null;
        country: string | null;
      };
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

interface PersonFormState {
  displayName: string;
  givenName: string;
  familyName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  organization: string;
  jobTitle: string;
  birthday: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  notes: string;
}

function emptyFormState(): PersonFormState {
  return {
    displayName: "",
    givenName: "",
    familyName: "",
    email: "",
    phone: "",
    avatarUrl: "",
    organization: "",
    jobTitle: "",
    birthday: "",
    website: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
    notes: "",
  };
}

export function PeopleProfileDialog({
  personId,
  onClose,
  onUpdated,
}: PeopleProfileDialogProps) {
  const [form, setForm] = useState<PersonFormState>(() => emptyFormState());
  const [primaryGroupName, setPrimaryGroupName] = useState("People");
  const [primaryGroupId, setPrimaryGroupId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadPerson = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/people/persons/${personId}`, {
          credentials: "include",
        });
        const result = (await response.json()) as PersonDetailResponse;

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error?.message || "Failed to load person profile");
        }

        if (cancelled) {
          return;
        }

        setPrimaryGroupId(result.data.primaryGroupId);
        setPrimaryGroupName(result.data.primaryGroupName);
        setForm({
          displayName: result.data.displayName,
          givenName: result.data.givenName || "",
          familyName: result.data.familyName || "",
          email: result.data.email || "",
          phone: result.data.phone || "",
          avatarUrl: result.data.avatarUrl || "",
          organization: result.data.metadata.organization || "",
          jobTitle: result.data.metadata.jobTitle || "",
          birthday: result.data.metadata.birthday || "",
          website: result.data.metadata.website || "",
          addressLine1: result.data.metadata.address.line1 || "",
          addressLine2: result.data.metadata.address.line2 || "",
          city: result.data.metadata.address.city || "",
          region: result.data.metadata.address.region || "",
          postalCode: result.data.metadata.address.postalCode || "",
          country: result.data.metadata.address.country || "",
          notes: result.data.metadata.notes || "",
        });
      } catch (fetchError) {
        if (cancelled) {
          return;
        }
        console.error("[PeopleProfileDialog] Failed to load person:", fetchError);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load person profile");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadPerson();

    return () => {
      cancelled = true;
    };
  }, [personId]);

  const formDisabled = isLoading || isSaving;
  const description = useMemo(() => {
    if (isLoading) {
      return "Loading contact profile.";
    }
    return `Editing contact details in ${primaryGroupName}.`;
  }, [isLoading, primaryGroupName]);

  const updateField = (key: keyof PersonFormState, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.displayName.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/people/persons/${personId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: form.displayName.trim(),
          primaryGroupId,
          givenName: form.givenName.trim() || null,
          familyName: form.familyName.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          avatarUrl: form.avatarUrl.trim() || null,
          organization: form.organization.trim() || null,
          jobTitle: form.jobTitle.trim() || null,
          birthday: form.birthday.trim() || null,
          website: form.website.trim() || null,
          addressLine1: form.addressLine1.trim() || null,
          addressLine2: form.addressLine2.trim() || null,
          city: form.city.trim() || null,
          region: form.region.trim() || null,
          postalCode: form.postalCode.trim() || null,
          country: form.country.trim() || null,
          notes: form.notes.trim() || null,
        }),
      });
      const result = (await response.json()) as PersonDetailResponse;

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "Failed to update person");
      }

      toast.success("Contact updated", {
        description: form.displayName.trim(),
      });
      window.dispatchEvent(new CustomEvent("dg:people-refresh"));
      window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
      onUpdated();
      onClose();
    } catch (saveError) {
      console.error("[PeopleProfileDialog] Failed to update person:", saveError);
      toast.error("Failed to update contact", {
        description: saveError instanceof Error ? saveError.message : "Unknown error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/45 px-4">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[430px] w-full max-w-md flex-col overflow-hidden rounded-xl border border-white/10 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Edit Contact Profile</h2>
            <p className="mt-1 text-xs text-gray-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
            aria-label="Close profile dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="space-y-3">
            <ProfileTextField
              autoFocus
              label="Display name"
              value={form.displayName}
              onChange={(value) => updateField("displayName", value)}
              placeholder="Bob Smith"
              disabled={formDisabled}
            />
            <div className="grid grid-cols-2 gap-3">
              <ProfileTextField label="Given name" value={form.givenName} onChange={(value) => updateField("givenName", value)} placeholder="Optional" disabled={formDisabled} />
              <ProfileTextField label="Family name" value={form.familyName} onChange={(value) => updateField("familyName", value)} placeholder="Optional" disabled={formDisabled} />
            </div>
            <ProfileTextField label="Email" value={form.email} onChange={(value) => updateField("email", value)} placeholder="Optional" type="email" disabled={formDisabled} />
            <ProfileTextField label="Phone" value={form.phone} onChange={(value) => updateField("phone", value)} placeholder="Optional" disabled={formDisabled} />
            <ProfileTextField label="Avatar URL" value={form.avatarUrl} onChange={(value) => updateField("avatarUrl", value)} placeholder="Optional" disabled={formDisabled} />
            <div className="grid grid-cols-2 gap-3">
              <ProfileTextField label="Organization" value={form.organization} onChange={(value) => updateField("organization", value)} placeholder="Optional" disabled={formDisabled} />
              <ProfileTextField label="Job title" value={form.jobTitle} onChange={(value) => updateField("jobTitle", value)} placeholder="Optional" disabled={formDisabled} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ProfileTextField label="Birthday" value={form.birthday} onChange={(value) => updateField("birthday", value)} placeholder="Optional" disabled={formDisabled} />
              <ProfileTextField label="Website" value={form.website} onChange={(value) => updateField("website", value)} placeholder="Optional" disabled={formDisabled} />
            </div>
            <ProfileTextField label="Address line 1" value={form.addressLine1} onChange={(value) => updateField("addressLine1", value)} placeholder="Optional" disabled={formDisabled} />
            <ProfileTextField label="Address line 2" value={form.addressLine2} onChange={(value) => updateField("addressLine2", value)} placeholder="Optional" disabled={formDisabled} />
            <div className="grid grid-cols-2 gap-3">
              <ProfileTextField label="City" value={form.city} onChange={(value) => updateField("city", value)} placeholder="Optional" disabled={formDisabled} />
              <ProfileTextField label="State / Region" value={form.region} onChange={(value) => updateField("region", value)} placeholder="Optional" disabled={formDisabled} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ProfileTextField label="Postal code" value={form.postalCode} onChange={(value) => updateField("postalCode", value)} placeholder="Optional" disabled={formDisabled} />
              <ProfileTextField label="Country" value={form.country} onChange={(value) => updateField("country", value)} placeholder="Optional" disabled={formDisabled} />
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">Notes</span>
              <textarea
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="Optional"
                rows={3}
                disabled={formDisabled}
                className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-500 focus:border-gold-primary/60 disabled:cursor-not-allowed disabled:bg-gray-50"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!form.displayName.trim() || formDisabled}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Contact"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ProfileTextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-700">{label}</span>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        disabled={disabled}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-500 focus:border-gold-primary/60 disabled:cursor-not-allowed disabled:bg-gray-50"
      />
    </label>
  );
}
