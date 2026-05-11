import { createBrowserRouter } from "react-router";

function GuideListPage() {
  return (
    <div className="min-h-screen bg-bamba-ivory p-8 text-bamba-ink">
      <h1 className="font-serif text-4xl font-bold">Bamba Guide Studio</h1>
      <p className="mt-2 text-bamba-muted">Compose guided learning journeys.</p>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <GuideListPage />,
  },
  {
    path: "/guides",
    element: <GuideListPage />,
  },
]);