import { ExploreThreadDemo } from "../components/ExploreThreadDemo";

type ExplorePageProps = {
  apiBaseUrl: string;
};

export function ExplorePage({ apiBaseUrl }: ExplorePageProps) {
  return <ExploreThreadDemo apiBaseUrl={apiBaseUrl} />;
}
