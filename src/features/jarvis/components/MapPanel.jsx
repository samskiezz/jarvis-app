import Globe3D from "../../../components/Globe3D";

export default function MapPanel({ selectedCountry, onSelect, earthquakes }) {
  return <Globe3D selectedCountry={selectedCountry} onSelect={onSelect} earthquakes={earthquakes} />;
}
