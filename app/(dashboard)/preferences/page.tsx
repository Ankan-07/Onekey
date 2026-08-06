/**
 * @file app/(dashboard)/preferences/page.tsx
 * Responsible for drag-and-drop provider ordering (@dnd-kit), provider exclusions, and model blacklisting.
 * Must never overwrite remote preference state with empty local defaults prior to initial hydration.
 */

"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useApi, api } from "@/lib/api";
import { PreferencesResponse, ListModelsResponse, UserModel } from "@/lib/types";
import { providerLabel } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, Plus, Search, SlidersHorizontal, Save } from "lucide-react";
import { toast } from "sonner";

const AVAILABLE_PROVIDERS = [
  "gemini",
  "groq",
  "cerebras",
  "mistral",
  "deepseek",
  "openrouter",
  "together",
  "cohere",
];

export default function PreferencesPage() {
  const { userId, ready } = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  // Preference states
  const [preferred, setPreferred] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [excludedModels, setExcludedModels] = useState<string[]>([]);

  // Search filter for model exclusion
  const [modelSearch, setModelSearch] = useState("");

  // SWR queries
  const { data: prefData } = useApi<PreferencesResponse>(
    ready && userId ? `/users/${userId}/preferences` : null
  );

  const { data: modelsData } = useApi<ListModelsResponse>(
    ready && userId ? `/users/${userId}/models` : null
  );

  // Hydrate local state ONCE when prefData arrives
  useEffect(() => {
    if (prefData && !hydrated) {
      setPreferred(prefData.preferred_providers || []);
      setExcluded(prefData.excluded_providers || []);
      setExcludedModels(prefData.excluded_models || []);
      setHydrated(true);
    }
  }, [prefData, hydrated]);

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPreferred((items) => {
        const oldIndex = items.indexOf(String(active.id));
        const newIndex = items.indexOf(String(over.id));
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSavePreferences = async () => {
    if (!userId) return;
    try {
      setSaving(true);
      await api.put(`/users/${userId}/preferences`, {
        preferred_providers: preferred,
        excluded_providers: excluded,
        excluded_models: excludedModels,
      });
      toast.success("Routing preferences saved successfully");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  const toggleExcludedProvider = (p: string) => {
    if (excluded.includes(p)) {
      setExcluded(excluded.filter((item) => item !== p));
    } else {
      setExcluded([...excluded, p]);
    }
  };

  const appendPreferredProvider = (p: string) => {
    if (!preferred.includes(p)) {
      setPreferred([...preferred, p]);
    }
  };

  const removePreferredProvider = (p: string) => {
    setPreferred(preferred.filter((item) => item !== p));
  };

  // Filtered connectable models for exclusion search
  const rawModels = modelsData?.models;
  const modelsList: UserModel[] = Array.isArray(rawModels)
    ? rawModels
    : rawModels
    ? (Object.values(rawModels).flat() as UserModel[])
    : [];

  const availableModels = Array.from(
    new Set(
      modelsList
        .filter((m) => m.provider_connected)
        .map((m) => m.model_entry)
    )
  ).sort();

  const searchResults = modelSearch.trim()
    ? availableModels.filter(
        (m) =>
          m.toLowerCase().includes(modelSearch.toLowerCase()) &&
          !excludedModels.includes(m)
      )
    : [];

  return (
    <div className="space-y-8 font-sans">
      <PageHeader
        title="Preferences"
        description="Customize provider order priority and global exclusion rules."
        actions={
          <Button onClick={handleSavePreferences} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" /> Save Preferences
          </Button>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Preferred Providers (Drag and Drop) */}
        <Card>
          <CardHeader>
            <CardTitle>Preferred Provider Priority</CardTitle>
            <p className="text-xs text-muted-soft">
              Drag to reorder provider preference override. Providers listed here are tried first in order.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={preferred} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {preferred.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-soft italic">
                      No preferred provider overrides set (uses standard tier cascade).
                    </p>
                  ) : (
                    preferred.map((p, idx) => (
                      <SortableItem
                        key={p}
                        id={p}
                        index={idx + 1}
                        label={providerLabel(p)}
                        onRemove={() => removePreferredProvider(p)}
                      />
                    ))
                  )}
                </div>
              </SortableContext>
            </DndContext>

            {/* Append provider pills */}
            <div className="pt-3 border-t border-hairline/10">
              <span className="text-xs text-muted-soft font-medium">Add to priority:</span>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {AVAILABLE_PROVIDERS.filter((p) => !preferred.includes(p)).map((p) => (
                  <Button
                    key={p}
                    variant="outline"
                    size="sm"
                    onClick={() => appendPreferredProvider(p)}
                    className="h-7 text-xs border-hairline/20 gap-1"
                  >
                    <Plus className="h-3 w-3" /> {providerLabel(p)}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Excluded Providers Toggle Pills */}
        <Card>
          <CardHeader>
            <CardTitle>Excluded Providers</CardTitle>
            <p className="text-xs text-muted-soft">
              Toggle providers to globally exclude them from all effort cascades.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_PROVIDERS.map((p) => {
                const isExcluded = excluded.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => toggleExcludedProvider(p)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                      isExcluded
                        ? "bg-error/15 border-error/40 text-error"
                        : "bg-surface-dark-soft border-hairline/20 text-on-dark hover:bg-surface-dark-elevated"
                    }`}
                  >
                    {isExcluded ? "✓ Excluded: " : "+ Enable: "} {providerLabel(p)}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Model Blacklist Exclusions */}
      <Card>
        <CardHeader>
          <CardTitle>Excluded Models</CardTitle>
          <p className="text-xs text-muted-soft">
            Blacklist specific model IDs to prevent them from executing in your cascade.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Active exclusions pills */}
          <div className="flex flex-wrap gap-2">
            {excludedModels.length === 0 ? (
              <p className="text-xs text-muted-soft italic">No specific models blacklisted.</p>
            ) : (
              excludedModels.map((m) => (
                <Badge
                  key={m}
                  variant="danger"
                  className="gap-1.5 py-1 px-2.5 font-mono text-xs"
                >
                  <span>{m}</span>
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-on-primary"
                    onClick={() => setExcludedModels(excludedModels.filter((item) => item !== m))}
                  />
                </Badge>
              ))
            )}
          </div>

          {/* Model search input */}
          <div className="relative max-w-md pt-2">
            <Search className="absolute left-3 top-5 h-4 w-4 text-muted-soft" />
            <Input
              placeholder="Search model ID to blacklist..."
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              className="pl-9"
            />

            {/* Dropdown results */}
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-hairline/30 bg-surface-dark shadow-lg">
                {searchResults.slice(0, 8).map((m) => (
                  <div
                    key={m}
                    onClick={() => {
                      setExcludedModels([...excludedModels, m]);
                      setModelSearch("");
                    }}
                    className="cursor-pointer px-3 py-2 text-xs font-mono text-on-dark hover:bg-surface-dark-elevated"
                  >
                    + Exclude <span className="font-semibold text-primary">{m}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Sortable Item Component for dnd-kit
function SortableItem({
  id,
  index,
  label,
  onRemove,
}: {
  id: string;
  index: number;
  label: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between rounded-md border border-hairline/20 bg-surface-dark-soft p-2.5 text-xs text-on-dark font-sans"
    >
      <div className="flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-soft hover:text-on-dark active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-dark-elevated text-[11px] font-mono text-muted-soft">
          {index}
        </span>
        <span className="font-medium">{label}</span>
      </div>
      <Button variant="ghost" size="icon" onClick={onRemove} className="h-6 w-6 text-muted-soft hover:text-error">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
