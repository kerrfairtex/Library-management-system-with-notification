"use client";

import dynamic from "next/dynamic";
import "./globals.css";

// Dynamically import the 3D bookshelf component with SSR disabled.
// Three.js uses WebGL canvas rendering that must run client-side only.
// This also avoids Turbopack bundling Node.js built-ins (fs, module, etc.)
// from three.js addon dependencies into the server bundle.
const Shelf = dynamic(
  () => import("./ProgressLibrary").then((mod) => mod.ProgressLibrary),
  {
    ssr: false,
    loading: () => <LoadingFallback />,
  }
);

function LoadingFallback() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "60vh",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          border: "3px solid #ddd",
          borderTopColor: "#3b82f6",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <span style={{ fontSize: "0.9rem", color: "#666" }}>Loading 3D bookshelf...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

export default function ShelfPage() {
  return <Shelf />;
}
