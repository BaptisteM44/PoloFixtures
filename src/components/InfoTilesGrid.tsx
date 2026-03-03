"use client";

import { useState, useCallback, useEffect, ReactNode } from "react";
import {
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor,
  type LayoutItem,
  type ResponsiveLayouts,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { DEFAULT_INFO_TILES_LAYOUT } from "@/lib/infoTilesDefaults";

type Props = {
  savedLayout: LayoutItem[] | null;
  isOrga: boolean;
  tournamentId: string;
  tiles: Record<string, ReactNode>;
  saveAction: (
    tournamentId: string,
    layout: unknown
  ) => Promise<{ ok?: boolean; error?: string }>;
};

export function InfoTilesGrid({
  savedLayout,
  isOrga,
  tournamentId,
  tiles,
  saveAction,
}: Props) {
  const initialLayout: LayoutItem[] = savedLayout ?? DEFAULT_INFO_TILES_LAYOUT;

  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState<LayoutItem[]>(initialLayout);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const { width, containerRef } = useContainerWidth({ initialWidth: 900 });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 800px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Filter out null/undefined tiles
  const activeTiles = Object.entries(tiles).filter(([, node]) => node != null);
  const activeTileKeys = new Set(activeTiles.map(([key]) => key));
  const filteredLayout = layout.filter((item) => activeTileKeys.has(item.i));

  const layouts: ResponsiveLayouts = {
    lg: filteredLayout,
    sm: filteredLayout.map((item) => ({ ...item, x: 0, w: 1 })),
  };

  const handleLayoutChange = useCallback(
    (newLayout: readonly LayoutItem[]) => {
      if (!editing) return;
      setLayout([...newLayout]);
    },
    [editing]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    const clean = layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
    await saveAction(tournamentId, clean);
    setSaving(false);
    setEditing(false);
  }, [layout, tournamentId, saveAction]);

  const handleCancel = useCallback(() => {
    setLayout(initialLayout);
    setEditing(false);
  }, [initialLayout]);

  return (
    <div className="info-tiles-grid-wrapper" ref={containerRef}>
      {isOrga && (
        <div className="info-tiles-toolbar">
          {!editing ? (
            <button className="ghost" onClick={() => setEditing(true)}>
              Personnaliser la disposition
            </button>
          ) : (
            <>
              <button
                className="primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </button>
              <button className="ghost" onClick={handleCancel}>
                Annuler
              </button>
            </>
          )}
        </div>
      )}

      <ResponsiveGridLayout
        className="info-tiles-rgl"
        width={width}
        layouts={layouts}
        breakpoints={{ lg: 800, sm: 0 }}
        cols={{ lg: 3, sm: 1 }}
        rowHeight={80}
        margin={[16, 16]}
        compactor={verticalCompactor}
        dragConfig={{
          enabled: editing && !isMobile,
          handle: ".info-tile-drag-handle",
        }}
        resizeConfig={{
          enabled: editing && !isMobile,
        }}
        onLayoutChange={(newLayout) => handleLayoutChange(newLayout)}
      >
        {activeTiles.map(([key, content]) => (
          <div key={key} className="panel info-tile-wrapper">
            {editing && (
              <div className="info-tile-drag-handle">
                <span>&#9776;</span>
              </div>
            )}
            <div className="info-tile-content">{content}</div>
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}
