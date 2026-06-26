import { useRef, useState } from "react";
import { supabase } from "@/integrations/app-supabase/client";
import { toast } from "sonner";

type Props = {
  bucket: string;
  pathPrefix: string;
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  shape?: "circle" | "rect";
  aspect?: string;
};

export function ImageUpload({
  bucket,
  pathPrefix,
  value,
  onChange,
  label = "Image",
  shape = "circle",
  aspect = "aspect-square",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Pick an image file.");
    if (file.size > 5 * 1024 * 1024) return toast.error("Max 5 MB.");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${pathPrefix}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success(`${label} uploaded.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const rounded = shape === "circle" ? "rounded-full" : "rounded-2xl";

  return (
    <div className="flex items-center gap-4">
      <div
        className={`${rounded} ${aspect} ${shape === "circle" ? "w-20 h-20" : "w-32"} overflow-hidden border border-border bg-muted flex items-center justify-center`}
      >
        {value ? (
          <img src={value} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted-foreground">No image</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="rounded-full border border-input px-4 py-1.5 text-xs font-semibold disabled:opacity-60"
        >
          {uploading ? "Uploading…" : value ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}