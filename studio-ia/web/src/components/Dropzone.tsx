import { ImageUp } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ACCEPT_ATTR, firstImageFile } from "../lib/image";
import { cx } from "../lib/util";

/**
 * Zone d'import d'image : clic, glisser-déposer, ou collage (Ctrl+V) quand `paste` est actif.
 */
export function Dropzone({
  onFile,
  title = "Glissez une image ici",
  subtitle = "ou cliquez pour choisir un fichier — PNG, JPG, JPEG, WEBP · 20 Mo max",
  compact,
  paste,
  testId = "dropzone",
  children,
}: {
  onFile: (file: File) => void;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  paste?: boolean;
  testId?: string;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    if (!paste) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      const file = firstImageFile(e.clipboardData?.items);
      if (file) {
        e.preventDefault();
        onFile(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [paste, onFile]);

  return (
    <div
      className={cx("dropzone", compact && "compact", dragging && "dragging")}
      role="button"
      tabIndex={0}
      aria-label={`${title}. ${subtitle}`}
      data-testid={testId}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        const file = firstImageFile(e.dataTransfer.files);
        if (file) onFile(file);
      }}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        hidden
        data-testid={`${testId}-input`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      {children ?? (
        <>
          <div className="dropzone-icon">
            <ImageUp size={22} />
          </div>
          <div style={{ fontWeight: 600 }}>{title}</div>
          <div className="hint">{subtitle}</div>
          {paste && <div className="hint">Astuce : vous pouvez aussi coller une image avec Ctrl+V.</div>}
        </>
      )}
    </div>
  );
}
