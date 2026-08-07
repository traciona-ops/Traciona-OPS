import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 lg:flex-row">
        <Skeleton className="h-96 w-full rounded-2xl lg:w-80" />
        <div className="flex-1 space-y-4">
          <Skeleton className="h-5 w-64" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
