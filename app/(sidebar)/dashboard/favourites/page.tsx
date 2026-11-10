import { EmptyCollection } from "@/components/gallery-view";

export default function FavouritesPage() {
  return (
    <EmptyCollection
      title="Favourites"
      description="Designs you save will appear here."
      empty="Nothing saved yet"
      action={{ label: "Browse showcases", href: "/showcases" }}
    />
  )
}
