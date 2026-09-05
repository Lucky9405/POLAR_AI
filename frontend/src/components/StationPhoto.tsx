import React, { useState } from "react";
import { Snowflake } from "lucide-react";

/**
 * Loads /stations/{code}.jpg if present. If the file is missing (404), shows
 * a clean gradient placeholder (station initial + snowflake glyph) instead
 * of a broken-image icon, so the header always looks intentional whether or
 * not a real photo has been dropped into frontend/public/stations/.
 * See frontend/public/stations/README.md for exactly where to add real photos.
 */
export function StationPhoto({ code, name, className = "" }: { code: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = `/stations/${code.toLowerCase()}.jpg`;

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg station-accent-bg station-accent-border ${className}`}
        style={{ borderWidth: 1 }}
        title={`No bundled photo for ${name} — see /stations/README.md`}
      >
        <div className="flex flex-col items-center justify-center text-center">
          <Snowflake size={18} className="station-accent-text" />
          <span className="text-[10px] font-bold station-accent-text mt-0.5">{code.slice(0, 2)}</span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      onError={() => setFailed(true)}
      className={`object-cover rounded-lg station-accent-border ${className}`}
      style={{ borderWidth: 1 }}
    />
  );
}
