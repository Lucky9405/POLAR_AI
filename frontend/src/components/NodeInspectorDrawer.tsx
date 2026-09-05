import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "../api/client";

/**
 * Same-page inspector drawer for a clicked energy-flow/digital-twin node.
 * Never navigates away — just fetches GET /api/nodes/{node} and renders the
 * result. Shared by EnergyFlowDiagram and the Digital Twin page so both use
 * one implementation instead of two divergent modals.
 */
export function NodeInspectorDrawer({ node, onClose }: { node: string | null; onClose: () => void }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!node) return;
    setData(null);
    api.nodeInspector(node).then(setData).catch(() => setData({ error: "Could not load inspector data" }));
  }, [node]);

  if (!node) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-polar-panel border border-polar-border rounded-xl p-5 w-[380px] max-h-[70vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold uppercase text-polar-cyan">{node.replace(/_/g, " ")} Inspector</h3>
          <button onClick={onClose}><X size={18} className="text-polar-dim" /></button>
        </div>
        {!data && <p className="text-sm text-polar-dim">Loading...</p>}
        {data && (
          <div className="space-y-1.5 text-sm">
            {Object.entries(data).map(([k, v]: any) => (
              <div key={k} className="flex justify-between border-b border-polar-border/50 py-1">
                <span className="text-polar-dim capitalize">{k.replace(/_/g, " ")}</span>
                <span className="font-semibold">{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
