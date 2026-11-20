/* Shown while a desk page's code loads: the same skeletons the pages use. */
export default function DeskLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading page">
      <div>
        <div className="skeleton h-9 w-64 max-w-full" />
        <div className="skeleton mt-2 h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="panel p-4 md:p-5">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton mt-3 h-8 w-14" />
          </div>
        ))}
      </div>
      <div className="panel space-y-2 p-4 md:p-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
