import { getTracksForTeam } from '@/lib/db/queries';
import { LibraryView } from './library-view';

export default async function LibraryPage() {
  const tracks = await getTracksForTeam();

  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium text-gray-900 mb-6">
        Library
      </h1>
      <LibraryView initialTracks={tracks} />
    </section>
  );
}
