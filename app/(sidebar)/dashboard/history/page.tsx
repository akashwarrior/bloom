import { EmptyCollection } from "@/components/gallery-view";

export default function HistoryPage() {
  return (
    <EmptyCollection
      title="History"
      description="Every design Bloom generates for you will appear here, newest first."
      empty="No generations yet"
      action={{ label: "Start a project", href: "/dashboard/projects" }}
    />
  )
}
