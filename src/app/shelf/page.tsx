"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ShelfBook } from "@/lib/types";

const SHELF_API = process.env.NEXT_PUBLIC_SHELF_API_URL || "/api/shelf-availability";

function BookCard({ book }: { book: ShelfBook }) {
  const onShelf = book.available_copies > 0;
  return (
    <div className="book-card">
      <h3>{book.title}</h3>
      <p className="book-author">{book.author}</p>
      <p>ISBN: {book.isbn} · {book.genre}</p>
      <span className={`status-badge ${onShelf ? "available" : "borrowed"}`}>
        {onShelf ? `Available (${book.available_copies})` : "On loan"}
      </span>
      <a
        href={onShelf
          ? `/borrow?isbn=${encodeURIComponent(book.isbn)}`
          : `/borrow?isbn=${encodeURIComponent(book.isbn)}&hold=1`
        }
        className="borrow-btn"
        target="_blank"
        rel="noopener noreferrer"
      >
        {onShelf ? "Borrow at desk" : "Request hold"}
      </a>
    </div>
  );
}

export default function ShelfPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [books, setBooks] = useState<ShelfBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ShelfBook | null>(null);

  useEffect(() => {
    fetch(SHELF_API)
      .then((r) => r.json())
      .then((data: ShelfBook[]) => setBooks(data))
      .catch((e) => console.error("Failed to load shelf:", e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!books.length || !mountRef.current) return;

    const container = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a12);

    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 1.7, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    const shelfGroup = new THREE.Group();
    const genres = Array.from(new Set(books.map((b) => b.genre || "General")));
    const booksPerShelf = 12;
    const shelfWidth = booksPerShelf * 0.25;

    genres.forEach((genre, gi) => {
      const genreBooks = books.filter((b) => (b.genre || "General") === genre);
      const shelfY = gi * 2.2 - (genres.length * 2.2) / 2 + 1;

      // Shelf plank
      const geo = new THREE.BoxGeometry(shelfWidth, 0.4, 1.5);
      const mat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
      const plank = new THREE.Mesh(geo, mat);
      plank.position.set(0, shelfY - 0.5, 0);
      shelfGroup.add(plank);

      // Books
      genreBooks.slice(0, booksPerShelf).forEach((book, bi) => {
        const bookHeight = 1.6;
        const bookWidth = 0.15;
        const bookDepth = 1.2;
        const bookGeo = new THREE.BoxGeometry(bookWidth, bookHeight, bookDepth);

        const hue = (gi / Math.max(genres.length, 1)) * 0.8 + 0.1;
        const color = new THREE.Color().setHSL(hue, 0.7, 0.55);
        const bookMat = new THREE.MeshStandardMaterial({ color });
        const mesh = new THREE.Mesh(bookGeo, bookMat);
        mesh.position.set(
          bi * (bookWidth + 0.03) - shelfWidth / 2 + bookWidth / 2,
          shelfY,
          0
        );
        (mesh as any).userData = { book };
        shelfGroup.add(mesh);
      });

      // Genre label
      const labelGeo = new THREE.PlaneGeometry(2, 0.3);
      const labelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
      const label = new THREE.Mesh(labelGeo, labelMat);
      label.position.set(-shelfWidth / 2 + 1.5, shelfY - 0.3, -0.9);
      shelfGroup.add(label);
    });

    scene.add(shelfGroup);
    camera.position.set(0, 1.5, Math.max(shelfWidth * 0.7, 8));

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };

    function onClick(e: MouseEvent) {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(shelfGroup.children);
      if (hits.length > 0) {
        const mesh = hits[0].object as THREE.Mesh;
        const book = (mesh as any).userData?.book;
        if (book) setSelected(book);
      }
    }

    function onPointerDown(e: MouseEvent) {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
    }
    function onPointerMove(e: MouseEvent) {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      shelfGroup.rotation.y -= dx * 0.005;
      shelfGroup.rotation.x -= dy * 0.005;
      shelfGroup.rotation.x = Math.max(-0.3, Math.min(0.6, shelfGroup.rotation.x));
      prevMouse = { x: e.clientX, y: e.clientY };
    }
    function onPointerUp() { isDragging = false; }

    function onResize() {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    }

    container.addEventListener("click", onClick);
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    window.addEventListener("resize", onResize);

    let animId = 0;
    function animate() {
      animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      container.removeEventListener("click", onClick);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("resize", onResize);
      container.removeChild(renderer.domElement);
      renderer.dispose();
      cancelAnimationFrame(animId);
    };
  }, [books]);

  const genreCount = Array.from(new Set(books.map(b => b.genre))).length;
  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex", overflow: "hidden" }}>
      <div ref={mountRef} style={{ flex: 1, height: "100%" }} />
      <div className="shelf-ui-overlay">
        <h1>TRAC Library — 3D Bookshelf</h1>
        <p>Browse {books.length} titles across {genreCount} genres. Drag to rotate, click a book for details.</p>
        <p style={{ fontSize: "0.8rem", color: "#888", marginTop: "6px" }}>
          Sign in at{" "}
          <a href="https://library-cp22.onrender.com/login" style={{ color: "#3b82f6" }}>library desk</a> to borrow books.
        </p>
        {loading && <p>Loading collection…</p>}
        {!loading && books.length > 0 && selected && <BookCard book={selected} />}
        {!loading && books.length > 0 && !selected && (
          <p>Click any book on the shelf to see its details and borrow it.</p>
        )}
      </div>
    </div>
  );
}
