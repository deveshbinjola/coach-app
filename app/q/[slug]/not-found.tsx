export default function QuizNotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        backgroundColor: "#0A0F1C",
        fontFamily: "Plus Jakarta Sans, sans-serif",
        color: "#FFFFFF",
      }}
    >
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-extrabold">Quiz not found</h1>
        <p className="mt-3 text-lg opacity-60">
          This quiz may have been unpublished or the link is incorrect.
        </p>
        <a
          href="https://elevateaisystem.com"
          className="inline-block mt-6 px-6 py-3 rounded-[var(--r-lg)] font-bold text-sm"
          style={{
            backgroundColor: "#0B6E23",
            color: "#FAF8F3",
          }}
        >
          Visit ElevateAI
        </a>
      </div>
    </div>
  );
}
