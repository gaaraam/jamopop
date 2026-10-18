import { redirect } from 'next/navigation';
import { SoloHub } from '@/components/game/solo-hub';
export default async function Solo({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  if ((await searchParams).start !== undefined) redirect('/solo/word?start=1');
  return <SoloHub />;
}
