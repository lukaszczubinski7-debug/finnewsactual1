"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./HudBriefForm.module.css";
import { getRegionForCountry } from "./countryRegionMap";

export type ContinentKey =
  | "AMERYKA_PN"
  | "AMERYKA_PD"
  | "EUROPA"
  | "AFRYKA"
  | "BLISKI_WSCHOD"
  | "AZJA"
  | "AUSTRALIA";

type ContinentMapProps = {
  selected: ContinentKey[];
  onToggle: (region: ContinentKey) => void;
  disabled?: boolean;
};

type Geometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

type CountryFeature = {
  geometry: Geometry;
  properties?: {
    name?: string;
  };
};

type GeoJsonData = {
  features: CountryFeature[];
};

const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 650;
const MAP_X = 30;
const MAP_Y = 58;
const MAP_WIDTH = 1140;
const MAP_HEIGHT = 534;

function projectCoordinates(lon: number, lat: number): [number, number] {
  const x = MAP_X + ((lon + 180) / 360) * MAP_WIDTH;
  const y = MAP_Y + ((90 - lat) / 180) * MAP_HEIGHT;
  return [Number(x.toFixed(2)), Number(y.toFixed(2))];
}

function linearRingToPath(ring: number[][]): string {
  if (!ring.length) {
    return "";
  }
  const [startLon, startLat] = ring[0];
  const [startX, startY] = projectCoordinates(startLon, startLat);
  let path = `M ${startX} ${startY}`;
  for (let i = 1; i < ring.length; i += 1) {
    const [lon, lat] = ring[i];
    const [x, y] = projectCoordinates(lon, lat);
    path += ` L ${x} ${y}`;
  }
  return `${path} Z`;
}

function geometryToPath(geometry: Geometry): string {
  if (geometry.type === "Polygon") {
    return (geometry.coordinates as number[][][]).map(linearRingToPath).join(" ");
  }
  return (geometry.coordinates as number[][][][])
    .map((polygon) => polygon.map(linearRingToPath).join(" "))
    .join(" ");
}

export default function ContinentMap({ selected, onToggle, disabled = false }: ContinentMapProps) {
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [hoveredRegion, setHoveredRegion] = useState<ContinentKey | null>(null);

  useEffect(() => {
    let active = true;
    async function loadGeoJson() {
      try {
        const response = await fetch("/world-countries.geojson");
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as GeoJsonData;
        if (active && Array.isArray(data.features)) {
          setCountries(data.features);
        }
      } catch {
        setCountries([]);
      }
    }
    void loadGeoJson();
    return () => {
      active = false;
    };
  }, []);

  const renderedCountries = useMemo(
    () =>
      countries
        .map((feature, index) => {
          const countryName = feature.properties?.name?.trim();
          if (!countryName || !feature.geometry) {
            return null;
          }
          const region = getRegionForCountry(countryName);
          const path = geometryToPath(feature.geometry);
          if (!path) {
            return null;
          }
          const isSelected = region ? selected.includes(region) : false;
          const isHovered = region ? hoveredRegion === region : false;

          const stateClass = isSelected
            ? styles.countrySelected
            : isHovered
              ? styles.countryHovered
              : styles.countryDefault;

          const handleToggle = () => {
            if (!disabled && region) {
              onToggle(region);
            }
          };

          return (
            <path
              key={`${countryName}-${index}`}
              d={path}
              className={`${styles.worldCountryPath} ${stateClass}`}
              data-country={countryName}
              data-region={region ?? "NONE"}
              role="button"
              tabIndex={disabled || !region ? -1 : 0}
              aria-label={region ? `${countryName}, region ${region}` : countryName}
              onClick={handleToggle}
              onMouseEnter={() => {
                if (!disabled && region) {
                  setHoveredRegion(region);
                }
              }}
              onMouseLeave={() => setHoveredRegion((current) => (current === region ? null : current))}
              onFocus={() => {
                if (!disabled && region) {
                  setHoveredRegion(region);
                }
              }}
              onBlur={() => setHoveredRegion((current) => (current === region ? null : current))}
              onKeyDown={(event) => {
                if (disabled || !region) {
                  return;
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onToggle(region);
                }
              }}
            >
              <title>{countryName}</title>
            </path>
          );
        })
        .filter(Boolean),
    [countries, disabled, hoveredRegion, onToggle, selected],
  );

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      role="img"
      aria-label="Mapa kontynentow"
      className={styles.continentSvg}
    >
      <defs>
        <pattern id="hudGrid" width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M26 0H0V26" fill="none" className={styles.mapGridLine} />
        </pattern>
      </defs>

      <rect x="0" y="0" width="1200" height="650" fill="url(#hudGrid)" className={styles.mapGridOverlay} />
      <g className={styles.worldCountriesLayer}>{renderedCountries}</g>
    </svg>
  );
}
