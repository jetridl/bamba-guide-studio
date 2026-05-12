import { Navigate, createBrowserRouter } from "react-router";

import { GuideEditorPage } from "@/features/editor/GuideEditorPage";
import { GuideListPage } from "@/features/guides/GuideListPage";
import { ImportGuidePage } from "@/features/guides/ImportGuidePage";
import { ImportReviewPage } from "@/features/reviews/ImportReviewPage";

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
    path: "/guides/:guideId",
    element: <GuideEditorPage />,
  },
  {
    path: "/guides/:guideId/reviews/import",
    element: <ImportReviewPage />,
  },
]);
