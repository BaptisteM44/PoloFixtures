import Link from "next/link";

const continents = [
  { code: "NA", name: "North America", subtitle: "USA, Canada, Mexico" },
  { code: "SA", name: "South America", subtitle: "Brazil, Argentina" },
  { code: "EU", name: "Europe", subtitle: "France, Germany, UK" },
  { code: "AF", name: "Africa", subtitle: "Rising scenes" },
  { code: "AS", name: "Asia", subtitle: "Japan, Singapore" },
  { code: "OC", name: "Oceania", subtitle: "Australia, NZ" }
];

export function ContinentGrid() {
  return (
    <div className="continent-grid">
      {continents.map((continent) => (
        <Link
          key={continent.code}
          className="continent-card"
          href={`/continent/${continent.code}`}
        >
          <h3>{continent.name}</h3>
          <p>{continent.subtitle}</p>
        </Link>
      ))}
    </div>
  );
}
