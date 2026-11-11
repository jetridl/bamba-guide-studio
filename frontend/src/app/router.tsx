import { Navigate, createBrowserRouter } from "react-router"

import { GuideEditorPage } from "@/features/editor/GuideEditorPage"
import { GuideListPage } from "@/features/guides/GuideListPage"
import { ImportGuidePage } from "@/features/guides/ImportGuidePage"
import { JourneyEditorPage } from "@/features/journeys/JourneyEditorPage"
import { JourneyListPage } from "@/features/journeys/JourneyListPage"
import { ImportReviewPage } from "@/features/reviews/ImportReviewPage"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate replace to="/guides" />,
  },
  {
    path: "/guides",
    element: <GuideListPage />,
  },
  {
    path: "/guides/import",
    element: <ImportGuidePage />,
  },
  {
    path: "/guides/:guideId/reviews/import",
    element: <ImportReviewPage />,
  },
  {
    // One route for the guide and its pages, so moving between them never
    // remounts the editor and never drops an unsaved edit.
    path: "/guides/:guideId/*",
    element: <GuideEditorPage />,
  },
  {
    path: "/journeys",
    element: <JourneyListPage />,
  },
  {
    path: "/journeys/:journeyId",
    element: <JourneyEditorPage />,
  },
])
