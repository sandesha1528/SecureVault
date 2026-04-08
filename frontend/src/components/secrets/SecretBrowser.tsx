import React, { useEffect, useState } from "react";
import { ChevronRight, FolderOpen, Folder, Lock } from "lucide-react";

interface SecretBrowserProps {
  paths: string[];
  selected: string | null;
  onSelect: (path: string) => void;
  loading: boolean;
}

function buildTree(paths: string[]): Record<string, unknown> {
  const tree: Record<string, unknown> = {};
  for (const path of paths) {
    const parts = path.split("/");
    let node = tree;
    for (const part of parts) {
      if (!(part in node)) node[part] = {};
      node = node[part] as Record<string, unknown>;
    }
  }
  return tree;
}

interface TreeNodeProps {
  name: string;
  node: Record<string, unknown>;
  prefix: string;
  selected: string | null;
  isLeaf: boolean;
  onSelect: (path: string) => void;
  depth: number;
}

function TreeNode({ name, node, prefix, selected, isLeaf, onSelect, depth }: TreeNodeProps) {
  const path = prefix ? `${prefix}/${name}` : name;
  const children = Object.keys(node);
  const [open, setOpen] = useState(depth < 1);

  if (isLeaf) {
    return (
      <button
        id={`secret-path-${path.replace(/\//g, "-")}`}
        onClick={() => onSelect(path)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          width: "100%",
          padding: `0.3rem 0.5rem 0.3rem ${depth * 16 + 8}px`,
          background: selected === path ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent",
          border: "none",
          borderRadius: 6,
          color: selected === path ? "var(--accent)" : "var(--text-primary)",
          fontSize: 13,
          cursor: "pointer",
          textAlign: "left",
          transition: "all 150ms",
        }}
      >
        <Lock size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          width: "100%",
          padding: `0.3rem 0.5rem 0.3rem ${depth * 16 + 8}px`,
          background: "transparent",
          border: "none",
          borderRadius: 6,
          color: "var(--text-muted)",
          fontSize: 13,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <ChevronRight
          size={12}
          style={{
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 150ms",
            flexShrink: 0,
          }}
        />
        {open ? <FolderOpen size={13} style={{ color: "var(--accent-amber)" }} /> : <Folder size={13} style={{ color: "var(--accent-amber)" }} />}
        {name}
      </button>
      {open && (
        <div>
          {children.map((child) => {
            const childNode = node[child] as Record<string, unknown>;
            const childPath = `${path}/${child}`;
            const childIsLeaf = Object.keys(childNode).length === 0;
            return (
              <TreeNode
                key={child}
                name={child}
                node={childNode}
                prefix={path}
                selected={selected}
                isLeaf={childIsLeaf}
                onSelect={onSelect}
                depth={depth + 1}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SecretBrowser({ paths, selected, onSelect, loading }: SecretBrowserProps) {
  const tree = buildTree(paths);
  const roots = Object.keys(tree);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        height: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        Secret Paths {paths.length > 0 && `(${paths.length})`}
      </div>
      <div style={{ overflowY: "auto", flex: 1, padding: "0.5rem" }}>
        {loading ? (
          <div className="flex-center" style={{ padding: "2rem" }}>
            <span className="spinner" />
          </div>
        ) : roots.length === 0 ? (
          <div className="empty-state">
            <Lock size={32} />
            <p>No secrets yet</p>
          </div>
        ) : (
          roots.map((root) => {
            const rootNode = tree[root] as Record<string, unknown>;
            const isLeaf = Object.keys(rootNode).length === 0;
            return (
              <TreeNode
                key={root}
                name={root}
                node={rootNode}
                prefix=""
                selected={selected}
                isLeaf={isLeaf}
                onSelect={onSelect}
                depth={0}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
